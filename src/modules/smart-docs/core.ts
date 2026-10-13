// Lectura inteligente (módulo smart_docs), sin base ni red: esquema tipado de
// lo que se extrae de una factura, ticket o extracto, validaciones (CUIT,
// CAE, cuentas), huella para duplicados, confianza por campo y filas de
// exportación (planilla, Tango y Xubio). Montos en centavos.

import { z } from "zod";
import { CBTE_TYPES, validCuit } from "@/modules/arca/config";
import { toCsv as toCsv_ } from "@/lib/csv";
import { formatAmount } from "@/lib/format";
import { byTipo, classifyTributo, TRIBUTO_TIPOS } from "./tributos";

/** Percepción, retención u otro tributo, por tipo y jurisdicción */
const TRIBUTO = z.object({
  concepto: z.string(),
  importe: z.number(),
  tipo: z.enum(TRIBUTO_TIPOS).nullable().optional(),
  jurisdiccion: z.string().nullable().optional(),
});

/** Lo que devuelve el modelo (montos en pesos con decimales; confianza 0 a 1 por campo) */
export const EXTRACTION_SCHEMA = z.object({
  tipo_documento: z.enum(["factura", "ticket", "nota_credito", "nota_debito", "extracto", "otro"]),
  cuit_emisor: z.string().nullable().describe("CUIT del emisor, 11 dígitos sin guiones"),
  razon_social_emisor: z.string().nullable(),
  cuit_receptor: z.string().nullable(),
  letra: z.enum(["A", "B", "C", "E", "M", "X"]).nullable(),
  codigo_comprobante: z.number().int().nullable().describe("Código de ARCA del tipo de comprobante (1 = Factura A, 6 = Factura B, 11 = Factura C, …)"),
  punto_venta: z.number().int().nullable(),
  numero: z.number().int().nullable(),
  fecha: z.string().nullable().describe("AAAA-MM-DD"),
  moneda: z.enum(["ARS", "USD"]).default("ARS"),
  neto_gravado: z.number().nullable(),
  no_gravado: z.number().nullable(),
  exento: z.number().nullable(),
  iva: z.array(z.object({ alicuota: z.number(), importe: z.number() })).default([]),
  percepciones: z.array(TRIBUTO).default([]).describe("Percepciones, impuestos internos y otros tributos que suman al total"),
  /** Retenciones informadas en el comprobante (no suman al total) */
  retenciones: z.array(TRIBUTO).default([]),
  items: z
    .array(
      z.object({
        descripcion: z.string(),
        codigo: z.string().nullable().default(null).describe("Código del producto del proveedor"),
        cantidad: z.number().nullable().default(null),
        precio_unitario: z.number().nullable().default(null),
        alicuota: z.number().nullable().default(null).describe("Alícuota de IVA del ítem"),
        importe: z.number().nullable().default(null).describe("Importe neto del ítem"),
      }),
    )
    .default([]),
  total: z.number().nullable(),
  cae: z.string().nullable(),
  vencimiento_cae: z.string().nullable(),
  confianza: z.record(z.string(), z.number().min(0).max(1)).default({}).describe("Confianza por campo, de 0 a 1"),
});
export type Extraction = z.infer<typeof EXTRACTION_SCHEMA>;

/** Lo guardado en la base como Extraction (los leídos antes de la etapa 2 de §2.q no traen ítems ni retenciones) */
export function asExtraction(raw: unknown): Extraction | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Partial<Extraction>;
  return { ...(e as Extraction), iva: e.iva ?? [], percepciones: e.percepciones ?? [], retenciones: e.retenciones ?? [], items: e.items ?? [], confianza: e.confianza ?? {} };
}

/** Campos que se muestran y se corrigen en la bandeja "Para confirmar" */
export const FIELDS: { key: keyof Extraction; label: string; kind: "text" | "money" | "date" | "int" }[] = [
  { key: "cuit_emisor", label: "CUIT del emisor", kind: "text" },
  { key: "razon_social_emisor", label: "Razón social", kind: "text" },
  { key: "codigo_comprobante", label: "Tipo (código ARCA)", kind: "int" },
  { key: "punto_venta", label: "Punto de venta", kind: "int" },
  { key: "numero", label: "Número", kind: "int" },
  { key: "fecha", label: "Fecha", kind: "date" },
  { key: "neto_gravado", label: "Neto gravado", kind: "money" },
  { key: "no_gravado", label: "No gravado", kind: "money" },
  { key: "exento", label: "Exento", kind: "money" },
  { key: "total", label: "Total", kind: "money" },
  { key: "cae", label: "CAE", kind: "text" },
  { key: "vencimiento_cae", label: "Vencimiento del CAE", kind: "date" },
];

/** Debajo de esto, el campo se marca para revisar */
export const LOW_CONFIDENCE = 0.8;

const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");
const cents = (n: number | null | undefined) => (n == null ? 0 : Math.round(n * 100));

/** Limpia lo que devolvió el modelo: CUIT solo dígitos, fechas válidas, códigos conocidos */
export function normalize(e: Extraction): Extraction {
  const date = (s: string | null) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(s).getTime()) ? s : null);
  return {
    ...e,
    cuit_emisor: digits(e.cuit_emisor) || null,
    cuit_receptor: digits(e.cuit_receptor) || null,
    razon_social_emisor: e.razon_social_emisor?.trim().slice(0, 160) || null,
    codigo_comprobante: e.codigo_comprobante && (CBTE_TYPES[e.codigo_comprobante] || [51, 52, 53, 81, 82, 83].includes(e.codigo_comprobante)) ? e.codigo_comprobante : e.codigo_comprobante ?? null,
    fecha: date(e.fecha),
    vencimiento_cae: date(e.vencimiento_cae),
    cae: digits(e.cae) || null,
    percepciones: e.percepciones.map(tributo),
    retenciones: (e.retenciones ?? []).map(tributo),
    items: (e.items ?? []).slice(0, 300).map((i) => ({ ...i, descripcion: i.descripcion.trim().slice(0, 200), codigo: i.codigo?.trim().slice(0, 60) || null })),
  };
}

/** Tipo y jurisdicción del tributo: lo que dijo el modelo o, si falta, lo que dice el concepto */
function tributo(x: z.infer<typeof TRIBUTO>) {
  const guess = classifyTributo(x.concepto);
  return { ...x, concepto: x.concepto.trim().slice(0, 120), tipo: x.tipo ?? guess.tipo, jurisdiccion: x.jurisdiccion?.trim() || guess.jurisdiccion };
}

/** Neto de un ítem: el importe o cantidad × precio unitario */
const itemNet = (i: Extraction["items"][number]) => i.importe ?? (i.cantidad != null && i.precio_unitario != null ? Math.round(i.cantidad * i.precio_unitario * 100) / 100 : 0);

export type Check = "ok" | "error" | "sin_dato" | "no_verificado";

export interface Validation {
  cuit: Check;
  cae: Check;
  totales: Check;
  /** Que los ítems sumen el neto del comprobante */
  items?: Check;
  /** Resultado de la consulta a ARCA, si se pudo hacer */
  arca?: { cuit?: "activo" | "inexistente" | "error"; cae?: "autorizado" | "no_encontrado" | "error"; consultado_at?: string };
  /** §2.p B8: que el comprobante esté a nombre de una CUIT de la organización */
  receptor?: "ok" | "otra" | "sin_dato";
  mensajes: string[];
}

/** ¿El receptor del comprobante es una CUIT propia? (sin CUIT del receptor, o sin CUIT propias cargadas: sin dato) */
export function receiverCheck(receptor: string | null | undefined, own: string[]): NonNullable<Validation["receptor"]> {
  const r = (receptor ?? "").replace(/\D/g, "");
  if (r.length !== 11 || !own.length) return "sin_dato";
  return own.includes(r) ? "ok" : "otra";
}

/** Validaciones locales: dígito verificador del CUIT, formato y vigencia del CAE y que cierren los totales */
export function validate(e: Extraction, today = new Date().toISOString().slice(0, 10)): Validation {
  const v: Validation = { cuit: "sin_dato", cae: "sin_dato", totales: "sin_dato", mensajes: [] };
  if (e.cuit_emisor) {
    v.cuit = validCuit(e.cuit_emisor) ? "ok" : "error";
    if (v.cuit === "error") v.mensajes.push("El CUIT del emisor no es válido (dígito verificador).");
  }
  if (e.cae) {
    v.cae = /^\d{14}$/.test(e.cae) ? "ok" : "error";
    if (v.cae === "error") v.mensajes.push("El CAE tiene que tener 14 dígitos.");
    else if (e.vencimiento_cae && e.fecha && e.vencimiento_cae < e.fecha) {
      v.cae = "error";
      v.mensajes.push("El vencimiento del CAE es anterior a la fecha del comprobante.");
    }
  } else if (e.tipo_documento === "factura" && e.letra && e.letra !== "X") v.mensajes.push("La factura no tiene CAE visible.");
  if (e.total != null) {
    const parts = [e.neto_gravado, e.no_gravado, e.exento].some((x) => x != null) || e.iva.length || e.percepciones.length;
    if (parts) {
      const sum = cents(e.neto_gravado) + cents(e.no_gravado) + cents(e.exento) + e.iva.reduce((s, x) => s + cents(x.importe), 0) + e.percepciones.reduce((s, x) => s + cents(x.importe), 0);
      v.totales = Math.abs(sum - cents(e.total)) <= 2 ? "ok" : "error";
      if (v.totales === "error") v.mensajes.push(`Los importes suman ${formatAmount(sum / 100)} y el total dice ${formatAmount(e.total)}.`);
    }
  }
  if (e.items.length) {
    const net = cents(e.neto_gravado) + cents(e.no_gravado) + cents(e.exento);
    const sum = e.items.reduce((s, i) => s + cents(itemNet(i)), 0);
    // Tolerancia: un peso por ítem (redondeos de precio unitario)
    v.items = net && Math.abs(sum - net) <= Math.max(100, e.items.length * 100) ? "ok" : net ? "error" : "sin_dato";
    if (v.items === "error") v.mensajes.push(`Los ítems suman ${formatAmount(sum / 100)} y el neto del comprobante es ${formatAmount(net / 100)}.`);
  }
  if (e.fecha && e.fecha > today) v.mensajes.push("La fecha es posterior a hoy.");
  return v;
}

/** Campos con confianza baja (o sin dato obligatorio) que hay que revisar */
export function lowFields(e: Extraction): string[] {
  const out = Object.entries(e.confianza ?? {})
    .filter(([, c]) => c < LOW_CONFIDENCE)
    .map(([k]) => k);
  for (const k of ["fecha", "total"] as const) if (e[k] == null && !out.includes(k)) out.push(k);
  if (e.tipo_documento !== "extracto" && !e.cuit_emisor && !out.includes("cuit_emisor")) out.push("cuit_emisor");
  return out;
}

/** Confianza general: el mínimo de los campos importantes */
export function overallConfidence(e: Extraction): number {
  const keys = ["cuit_emisor", "fecha", "total", "numero"];
  const vals = keys.map((k) => e.confianza?.[k]).filter((x): x is number => typeof x === "number");
  return vals.length ? Math.min(...vals) : 0.5;
}

/**
 * Huella para detectar el mismo comprobante cargado dos veces: CUIT del
 * emisor + tipo + punto de venta + número; si falta algo, CUIT + fecha + total.
 */
export function fingerprint(e: Extraction): string | null {
  if (e.cuit_emisor && e.codigo_comprobante && e.punto_venta != null && e.numero != null) return `c:${e.cuit_emisor}:${e.codigo_comprobante}:${e.punto_venta}:${e.numero}`;
  if (e.cuit_emisor && e.fecha && e.total != null) return `t:${e.cuit_emisor}:${e.fecha}:${cents(e.total)}`;
  if (e.fecha && e.total != null && e.razon_social_emisor) return `n:${e.razon_social_emisor.toLowerCase().replace(/\W+/g, "")}:${e.fecha}:${cents(e.total)}`;
  return null;
}

/** Cuentas de la planilla (se exporta una hoja por cuenta) */
export const DEFAULT_ACCOUNTS = ["Compras", "Servicios", "Alquileres", "Honorarios", "Combustible", "Viáticos", "Impuestos y tasas", "Otros gastos"];

/** Cuenta sugerida por palabras del emisor (el estudio la corrige) */
export function suggestAccount(e: Extraction, history: Map<string, string> = new Map()): string {
  if (e.cuit_emisor && history.has(e.cuit_emisor)) return history.get(e.cuit_emisor)!;
  const n = (e.razon_social_emisor ?? "").toLowerCase();
  if (/ypf|shell|axion|puma|combust/.test(n)) return "Combustible";
  if (/edenor|edesur|metrogas|aysa|telecom|personal|claro|movistar|fibertel|telefonica|naturgy/.test(n)) return "Servicios";
  if (/inmobiliaria|alquiler/.test(n)) return "Alquileres";
  if (/estudio|consultor|abogad|contador/.test(n)) return "Honorarios";
  if (/municipal|arba|agip|rentas/.test(n)) return "Impuestos y tasas";
  return "Compras";
}

export interface ExportRow {
  fecha: string;
  tipo: string;
  punto_venta: number | null;
  numero: number | null;
  cuit: string;
  razon_social: string;
  cuenta: string;
  neto_gravado: number;
  no_gravado: number;
  exento: number;
  iva_21: number;
  iva_10_5: number;
  iva_27: number;
  iva_otros: number;
  percepciones: number;
  percepciones_iva: number;
  percepciones_iibb: number;
  percepciones_ganancias: number;
  impuestos_internos: number;
  otros_tributos: number;
  total: number;
  cae: string;
  moneda: string;
}

/** Fila de exportación (en pesos, con dos decimales) */
export function exportRow(e: Extraction, account: string): ExportRow {
  const iva = (rate: number) => e.iva.filter((x) => Math.abs(x.alicuota - rate) < 0.01).reduce((s, x) => s + x.importe, 0);
  const known = iva(21) + iva(10.5) + iva(27);
  const totalIva = e.iva.reduce((s, x) => s + x.importe, 0);
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return {
    fecha: e.fecha ?? "",
    tipo: e.codigo_comprobante && CBTE_TYPES[e.codigo_comprobante] ? CBTE_TYPES[e.codigo_comprobante].label : e.letra ? `${e.tipo_documento === "ticket" ? "Ticket" : "Factura"} ${e.letra}` : e.tipo_documento,
    punto_venta: e.punto_venta,
    numero: e.numero,
    cuit: e.cuit_emisor ?? "",
    razon_social: e.razon_social_emisor ?? "",
    cuenta: account,
    neto_gravado: r2(e.neto_gravado ?? 0),
    no_gravado: r2(e.no_gravado ?? 0),
    exento: r2(e.exento ?? 0),
    iva_21: r2(iva(21)),
    iva_10_5: r2(iva(10.5)),
    iva_27: r2(iva(27)),
    iva_otros: r2(totalIva - known),
    percepciones: r2(e.percepciones.reduce((s, x) => s + x.importe, 0)),
    percepciones_iva: r2(byTipo(e.percepciones).iva),
    percepciones_iibb: r2(byTipo(e.percepciones).iibb),
    percepciones_ganancias: r2(byTipo(e.percepciones).ganancias),
    impuestos_internos: r2(byTipo(e.percepciones).internos),
    otros_tributos: r2(byTipo(e.percepciones).otros),
    total: r2(e.total ?? 0),
    cae: e.cae ?? "",
    moneda: e.moneda,
  };
}

export const EXPORT_HEADERS: [keyof ExportRow, string][] = [
  ["fecha", "Fecha"],
  ["tipo", "Comprobante"],
  ["punto_venta", "Punto de venta"],
  ["numero", "Número"],
  ["cuit", "CUIT"],
  ["razon_social", "Razón social"],
  ["cuenta", "Cuenta"],
  ["neto_gravado", "Neto gravado"],
  ["no_gravado", "No gravado"],
  ["exento", "Exento"],
  ["iva_21", "IVA 21%"],
  ["iva_10_5", "IVA 10,5%"],
  ["iva_27", "IVA 27%"],
  ["iva_otros", "IVA otras"],
  ["percepciones", "Percepciones"],
  ["total", "Total"],
  ["cae", "CAE"],
  ["moneda", "Moneda"],
];

/** CSV para planilla (punto y coma, coma decimal, BOM para Excel) */
export function toCsv(rows: ExportRow[]) {
  return toCsv_([EXPORT_HEADERS.map(([, h]) => h), ...rows.map((r) => EXPORT_HEADERS.map(([k]) => r[k]))], { decimalComma: true, bom: true });
}

/**
 * Archivo para importar en Tango Gestión (Compras → Importación de
 * comprobantes): una fila por comprobante con los campos del asistente de
 * importación (fecha dd/mm/aaaa, tipo, número completo, CUIT con guiones,
 * importes con punto decimal). El formato exacto se ajusta en el asistente
 * de Tango; ver docs/decisiones.md.
 */
export function toTangoCsv(rows: ExportRow[]) {
  const f = (d: string) => (d ? d.split("-").reverse().join("/") : "");
  const cuit = (c: string) => (c.length === 11 ? `${c.slice(0, 2)}-${c.slice(2, 10)}-${c.slice(10)}` : c);
  const n = (x: number) => x.toFixed(2);
  const head = ["FECHA", "TIPO_COMP", "NRO_COMP", "CUIT", "RAZON_SOCIAL", "CUENTA", "NETO_GRAVADO", "NO_GRAVADO", "EXENTO", "IVA_21", "IVA_105", "IVA_27", "PERCEPCIONES", "TOTAL", "CAE"];
  const lines = rows.map((r) => [f(r.fecha), r.tipo, `${String(r.punto_venta ?? 0).padStart(5, "0")}-${String(r.numero ?? 0).padStart(8, "0")}`, cuit(r.cuit), r.razon_social, r.cuenta, n(r.neto_gravado), n(r.no_gravado), n(r.exento), n(r.iva_21), n(r.iva_10_5), n(r.iva_27), n(r.percepciones), n(r.total), r.cae]);
  return toCsv_([head, ...lines]);
}
