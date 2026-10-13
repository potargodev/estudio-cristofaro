// Buzón de comprobantes recibidos (§2.p, B8): reglas puras. El CSV que baja
// el contribuyente de ARCA → «Mis Comprobantes» → Recibidos se convierte en
// comprobantes para revisar sin pasar por la IA (Faro no entra a ARCA con la
// clave fiscal: el archivo lo baja la persona). Columnas según el formato
// conocido de la exportación, «a validar» contra la versión vigente.

import { CBTE_TYPES } from "@/modules/arca/config";
import { validCuit } from "@/modules/arca/config";
import type { Extraction } from "@/modules/smart-docs/core";

export const SOURCE_LABEL: Record<string, string> = { subida: "Subido", portal: "Portal", vigia: "Vigía", whatsapp: "WhatsApp", mail: "Mail", arca: "ARCA", rendicion: "Rendición", documentos: "Documentos", archivos: "Archivos", zip: "ZIP" };

export const COMPUTABLE = { computa: "Computa", no_computa: "No computa", parcial: "Parcial" } as const;
type Computable = keyof typeof COMPUTABLE;
export const isComputable = (x: string): x is Computable => x in COMPUTABLE;

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Número de ARCA: «1.234,56» o «1234.56» */
export function arNumber(v: string | undefined): number | null {
  const t = (v ?? "").trim().replace(/^\$\s*/, "");
  if (!t) return null;
  const n = /,\d{1,2}$/.test(t) ? Number(t.replace(/\./g, "").replace(",", ".")) : Number(t.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Fecha «dd/mm/aaaa» o «aaaa-mm-dd» → AAAA-MM-DD */
function isoDate(v: string | undefined) {
  const t = (v ?? "").trim();
  const a = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (a) return `${a[1]}-${a[2]}-${a[3]}`;
  const b = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return b ? `${b[3]}-${b[2].padStart(2, "0")}-${b[1].padStart(2, "0")}` : null;
}

const RATES = [21, 10.5, 27, 5, 2.5];
/** Alícuota más cercana al IVA sobre el neto (ARCA informa el IVA total; a validar con el comprobante si hay varias) */
export function rateOf(net: number, iva: number) {
  if (!(net > 0) || !(iva > 0)) return 21;
  const r = (iva / net) * 100;
  return RATES.reduce((best, x) => (Math.abs(x - r) < Math.abs(best - r) ? x : best), 21);
}

const COLS: Record<string, string[]> = {
  fecha: ["fecha", "fecha de emision"],
  tipo: ["tipo", "tipo de comprobante"],
  pv: ["punto de venta"],
  numero: ["numero desde", "numero", "nro desde"],
  cae: ["cod autorizacion", "codigo de autorizacion", "cae"],
  doc: ["nro doc emisor", "nro doc vendedor", "cuit emisor", "nro doc"],
  nombre: ["denominacion emisor", "denominacion vendedor", "denominacion"],
  moneda: ["moneda"],
  neto: ["imp neto gravado", "neto gravado", "imp neto gravado total"],
  noGravado: ["imp neto no gravado", "neto no gravado"],
  exento: ["imp op exentas", "operaciones exentas", "exento"],
  iva: ["iva", "total iva", "imp iva"],
  total: ["imp total", "importe total", "total"],
};

/** Filas del CSV de Mis Comprobantes → extracciones listas para revisar (y las filas que no se entendieron) */
export function parseMisComprobantes(rows: string[][], receiverCuit: string | null) {
  const headIdx = rows.findIndex((r) => r.some((c) => norm(c) === "fecha") && r.some((c) => norm(c).startsWith("tipo")));
  if (headIdx < 0) return { docs: [], errors: ["No encontramos los encabezados de Mis Comprobantes (Fecha, Tipo, Punto de Venta…)."] };
  const head = rows[headIdx].map(norm);
  const col = (k: string) => head.findIndex((h) => COLS[k].includes(h));
  const c = Object.fromEntries(Object.keys(COLS).map((k) => [k, col(k)])) as Record<string, number>;
  const docs: { row: number; extraction: Extraction }[] = [];
  const errors: string[] = [];
  for (const [i, r] of rows.slice(headIdx + 1).entries()) {
    if (!r.some((x) => x.trim())) continue;
    const at = (k: string) => (c[k] >= 0 ? r[c[k]] : undefined);
    const code = Number((at("tipo") ?? "").match(/^\s*(\d+)/)?.[1] ?? NaN);
    const fecha = isoDate(at("fecha"));
    const total = arNumber(at("total"));
    const cuit = (at("doc") ?? "").replace(/\D/g, "");
    if (!fecha || total == null || !Number.isFinite(code)) {
      errors.push(`Fila ${headIdx + i + 2}: falta la fecha, el tipo o el total.`);
      continue;
    }
    const t = CBTE_TYPES[code];
    const net = arNumber(at("neto")) ?? 0;
    const iva = arNumber(at("iva")) ?? 0;
    docs.push({
      row: headIdx + i + 2,
      extraction: {
        tipo_documento: t?.kind === "nota_credito" ? "nota_credito" : t?.kind === "nota_debito" ? "nota_debito" : "factura",
        cuit_emisor: cuit.length === 11 ? cuit : null,
        razon_social_emisor: (at("nombre") ?? "").trim() || null,
        cuit_receptor: receiverCuit,
        letra: t?.letter ?? null,
        codigo_comprobante: code,
        punto_venta: Number(at("pv")) || null,
        numero: Number(at("numero")) || null,
        fecha,
        moneda: /dol|usd/i.test(at("moneda") ?? "") ? "USD" : "ARS",
        neto_gravado: net || null,
        no_gravado: arNumber(at("noGravado")),
        exento: arNumber(at("exento")),
        iva: iva ? [{ alicuota: rateOf(net, iva), importe: iva }] : [],
        percepciones: [],
        retenciones: [],
        items: [],
        total: Math.abs(total),
        cae: (at("cae") ?? "").replace(/\D/g, "") || null,
        vencimiento_cae: null,
        confianza: {},
      },
    });
  }
  return { docs, errors };
}

/** Validación local de una fila de ARCA: viene de ARCA, así que el CAE existe; el CUIT se revisa igual */
export function arcaRowValidation(e: Extraction) {
  return { cuit: e.cuit_emisor ? (validCuit(e.cuit_emisor) ? "ok" : "error") : "sin_dato", cae: e.cae ? "ok" : "sin_dato", totales: "no_verificado", receptor: e.cuit_receptor ? "ok" : "sin_dato", mensajes: ["Importado de ARCA (Mis Comprobantes): los importes por alícuota se estiman con el IVA total."] } as const;
}
