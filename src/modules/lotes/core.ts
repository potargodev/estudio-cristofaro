// Facturación en lote (§2.p, B2): lectura de una planilla (Excel, CSV o
// pegada), mapeo flexible de columnas y validación fila por fila antes de
// emitir. Las filas con el mismo «grupo» son un solo comprobante con varios
// ítems. Sin base ni red: lo usan el servidor y las pruebas.

import { validCuit } from "@/modules/arca/config";

export interface BatchItem {
  description: string;
  quantity: number;
  unitPrice: number;
  ivaRate: number | null;
}

export interface BatchRow {
  /** Fila de la planilla (la primera del grupo) */
  row: number;
  issuerCuit: string | null;
  pointOfSale: number | null;
  type: string | null;
  issueDate: string | null;
  concept: number;
  customerDoc: string;
  customerDocType: number;
  customerName: string;
  ivaCondition: string;
  email: string | null;
  phone: string | null;
  reference: string | null;
  items: BatchItem[];
}

/** Encabezados aceptados (sin tildes, en minúscula) → campo */
const HEADERS: Record<string, keyof RawRow> = {
  cuit_emisor: "issuer",
  emisor: "issuer",
  punto_de_venta: "pos",
  punto_venta: "pos",
  pv: "pos",
  tipo: "type",
  tipo_comprobante: "type",
  fecha: "date",
  concepto: "concept",
  cuit_cliente: "doc",
  documento: "doc",
  cuit: "doc",
  dni: "doc",
  doc_cliente: "doc",
  cliente: "name",
  nombre: "name",
  razon_social: "name",
  condicion_iva: "iva",
  condicion: "iva",
  iva_cliente: "iva",
  email: "email",
  mail: "email",
  telefono: "phone",
  celular: "phone",
  whatsapp: "phone",
  descripcion: "description",
  detalle: "description",
  cantidad: "quantity",
  precio: "price",
  precio_unitario: "price",
  importe: "price",
  alicuota: "rate",
  alicuota_iva: "rate",
  iva: "rate",
  grupo: "group",
  referencia: "reference",
  id_externo: "reference",
};

type RawRow = { issuer?: string; pos?: string; type?: string; date?: string; concept?: string; doc?: string; name?: string; iva?: string; email?: string; phone?: string; description?: string; quantity?: string; price?: string; rate?: string; group?: string; reference?: string };

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");

/** Texto pegado o CSV → filas (detecta ; , o tabulación) */
export function parseText(text: string): string[][] {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim());
  if (!lines.length) return [];
  const head = lines[0];
  const sep = head.includes("\t") ? "\t" : (head.match(/;/g)?.length ?? 0) >= (head.match(/,/g)?.length ?? 0) ? ";" : ",";
  return lines.map((l) => {
    const out: string[] = [];
    let cur = "";
    let q = false;
    for (let i = 0; i < l.length; i++) {
      const ch = l[i];
      if (ch === '"') {
        if (q && l[i + 1] === '"') {
          cur += '"';
          i++;
        } else q = !q;
      } else if (ch === sep && !q) {
        out.push(cur);
        cur = "";
      } else cur += ch;
    }
    out.push(cur);
    return out.map((c) => c.trim());
  });
}

/** Primera fila = encabezados; devuelve las filas como objetos y los encabezados que no se entendieron */
export function mapRows(table: unknown[][]) {
  if (table.length < 2) return { rows: [] as (RawRow & { _row: number })[], unknown: [] as string[] };
  const keys = table[0].map((h) => HEADERS[norm(String(h ?? ""))] ?? null);
  const unknown = table[0].filter((_, i) => !keys[i]).map((h) => String(h ?? "")).filter(Boolean);
  const rows = table.slice(1).flatMap((cells, i) => {
    const r: RawRow & { _row: number } = { _row: i + 2 };
    let any = false;
    cells.forEach((c, j) => {
      const k = keys[j];
      if (!k) return;
      const v = c instanceof Date ? c.toISOString().slice(0, 10) : String(c ?? "").trim();
      if (v) any = true;
      r[k] = v;
    });
    return any ? [r] : [];
  });
  return { rows, unknown };
}

const num = (v: string | undefined) => {
  if (v == null || v === "") return NaN;
  const t = v.replace(/\$|\s/g, "");
  return Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
};

const IVA_ALIASES: Record<string, string> = {
  ri: "responsable_inscripto",
  responsable_inscripto: "responsable_inscripto",
  inscripto: "responsable_inscripto",
  mono: "monotributo",
  monotributo: "monotributo",
  monotributista: "monotributo",
  cf: "consumidor_final",
  consumidor_final: "consumidor_final",
  final: "consumidor_final",
  exento: "exento",
  iva_exento: "exento",
};

function date(v: string | undefined): string | null {
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(v);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return "invalida";
}

/**
 * Valida cada fila y arma los comprobantes (las filas con el mismo «grupo»
 * se juntan). Devuelve los válidos y, para cada fila con problemas, qué
 * corregir. `needsIssuer`: en el panel del estudio la CUIT emisora va por fila.
 */
export function validate(raw: (RawRow & { _row: number })[], opts: { needsIssuer: boolean; today: string }) {
  const groups = new Map<string, (RawRow & { _row: number })[]>();
  for (const r of raw) {
    const k = r.group ? `g:${r.group}` : `r:${r._row}`;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const out: { row: number; data: BatchRow | null; errors: string[] }[] = [];
  for (const rs of groups.values()) {
    const f = rs[0];
    const errors: string[] = [];
    const issuer = (f.issuer ?? "").replace(/\D/g, "");
    if (opts.needsIssuer && !issuer) errors.push("Falta la CUIT emisora.");
    if (issuer && (!/^\d{11}$/.test(issuer) || !validCuit(issuer))) errors.push("La CUIT emisora no es válida.");
    const pos = f.pos ? Number(f.pos) : null;
    if (f.pos && (!Number.isInteger(pos) || pos! < 1 || pos! > 99998)) errors.push("Punto de venta inválido.");
    const d = date(f.date);
    if (d === "invalida") errors.push("Fecha inválida (usá DD/MM/AAAA).");
    const doc = (f.doc ?? "").replace(/\D/g, "");
    const docType = !doc || doc === "0" ? 99 : doc.length === 11 ? 80 : doc.length >= 7 && doc.length <= 8 ? 96 : -1;
    if (docType === -1) errors.push("El documento del cliente tiene que ser una CUIT (11 números) o un DNI.");
    if (docType === 80 && !validCuit(doc)) errors.push("La CUIT del cliente no es válida.");
    const iva = IVA_ALIASES[norm(f.iva ?? "")] ?? (docType === 99 || docType === 96 ? "consumidor_final" : f.iva ? null : "consumidor_final");
    if (!iva) errors.push("Condición frente al IVA del cliente: RI, monotributo, exento o consumidor final.");
    const name = (f.name ?? "").trim() || (docType === 99 ? "Consumidor final" : "");
    if (!name) errors.push("Falta el nombre del cliente.");
    const concept = /serv/i.test(f.concept ?? "") ? 2 : /amb|prod.*serv/i.test(f.concept ?? "") ? 3 : /prod/i.test(f.concept ?? "") ? 1 : 2;
    const items: BatchItem[] = [];
    for (const r of rs) {
      const q = r.quantity ? num(r.quantity) : 1;
      const p = num(r.price);
      const rate = r.rate ? num(String(r.rate).replace("%", "")) : null;
      if (!r.description) errors.push(`Fila ${r._row}: falta la descripción.`);
      if (!(q > 0)) errors.push(`Fila ${r._row}: cantidad inválida.`);
      if (!(p >= 0) || Number.isNaN(p)) errors.push(`Fila ${r._row}: precio inválido.`);
      if (rate != null && ![0, 2.5, 5, 10.5, 21, 27].includes(rate)) errors.push(`Fila ${r._row}: alícuota de IVA inválida.`);
      items.push({ description: (r.description ?? "").slice(0, 200), quantity: q, unitPrice: p, ivaRate: rate });
    }
    if (items.length && items.reduce((t, x) => t + x.quantity * x.unitPrice, 0) <= 0) errors.push("El total tiene que ser mayor a cero.");
    const type = f.type ? f.type.trim().toUpperCase() : null;
    if (type && !/^(A|B|C|E|\d{1,3})$/.test(type)) errors.push("Tipo de comprobante: A, B, C, E o su código.");
    const email = f.email?.trim() || null;
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errors.push("Mail inválido.");
    out.push({
      row: f._row,
      errors: [...new Set(errors)],
      data: errors.length ? null : { row: f._row, issuerCuit: issuer || null, pointOfSale: pos, type, issueDate: d && d !== "invalida" ? d : opts.today, concept, customerDoc: docType === 99 ? "0" : doc, customerDocType: docType, customerName: name, ivaCondition: iva!, email, phone: f.phone?.trim() || null, reference: f.reference?.trim() || null, items },
    });
  }
  return out.sort((a, b) => a.row - b.row);
}

/** Código de comprobante a partir de la letra (o el código) y si es factura */
export function cbteFrom(type: string | null): number | null {
  if (!type) return null;
  if (/^\d+$/.test(type)) return Number(type);
  return { A: 1, B: 6, C: 11, E: 19 }[type] ?? null;
}
