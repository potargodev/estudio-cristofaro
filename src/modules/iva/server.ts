import "server-only";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { bank_movements, invoices, iva_marks, organizations, smart_documents } from "@/db/schema";
import { audit } from "@/lib/audit";
import { hasModule } from "@/lib/faro/entitlements";
import { isUuid } from "@/lib/ids";
import { CBTE_TYPES } from "@/modules/arca/config";
import { asExtraction } from "@/modules/smart-docs/core";
import { ivaLight } from "./digital";
import { prevPeriod, purchaseAnomalies, rowsOf, salesAnomalies, summarize, type Anomaly, type BookRow, type ChecklistItem } from "./core";

// Análisis del Libro IVA de una organización (§2.q, etapa 4): libro de
// compras (comprobantes confirmados en la lectura inteligente) y de ventas
// (comprobantes emitidos en Faro), resumen, comparación con los 3 períodos
// anteriores, anomalías, marcas «a revisar» y el checklist de lo que falta
// antes de presentar. Todo filtra por estudio y organización.

const db = () => getDb();
export class IvaError extends Error {}
interface IvaScope {
  studioId: string;
  organizationId: string;
}
type Actor = { id: string; email: string };
export type Book = "compras" | "ventas";

const cents = (n: number | string | null | undefined) => Math.round(Number(n ?? 0) * 100);
export const isPeriod = (p: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(p);

async function orgOk(s: IvaScope) {
  if (!isUuid(s.organizationId)) return false;
  const [o] = await db().select({ id: organizations.id }).from(organizations).where(and(eq(organizations.id, s.organizationId), eq(organizations.studio_id, s.studioId)));
  return !!o;
}

/** Libro de compras: todo lo confirmado de la organización (para el período y su historia) */
async function purchaseRows(s: IvaScope): Promise<BookRow[]> {
  const docs = await db()
    .select()
    .from(smart_documents)
    .where(and(eq(smart_documents.studio_id, s.studioId), eq(smart_documents.organization_id, s.organizationId), eq(smart_documents.scope, "organizacion"), eq(smart_documents.status, "confirmado")))
    .orderBy(desc(smart_documents.confirmed_at))
    .limit(5000);
  return docs.flatMap((d) => {
    const e = asExtraction(d.extracted);
    if (!e?.fecha || e.total == null || e.tipo_documento === "extracto") return [];
    const sign = e.tipo_documento === "nota_credito" ? -1 : 1;
    return [
      {
        id: d.id,
        kind: "compra" as const,
        fecha: e.fecha,
        letra: e.letra,
        codigo: e.codigo_comprobante,
        puntoVenta: e.punto_venta,
        numero: e.numero,
        cuit: e.cuit_emisor,
        nombre: e.razon_social_emisor ?? d.file_name,
        neto: sign * cents(e.neto_gravado),
        noGravado: sign * cents(e.no_gravado),
        exento: sign * cents(e.exento),
        iva: e.iva.map((x) => ({ alicuota: x.alicuota, importe: sign * cents(x.importe) })),
        percepcionesIva: sign * cents(e.percepciones.filter((p) => p.tipo === "iva").reduce((a, p) => a + p.importe, 0)),
        total: sign * cents(e.total),
        cae: e.cae,
        validation: d.validation as BookRow["validation"],
        fingerprint: d.fingerprint,
        loadedAt: (d.confirmed_at ?? d.created_at).toISOString().slice(0, 10),
        supplierHint: e.razon_social_emisor,
        ownCuit: e.cuit_receptor,
      },
    ];
  });
}

/** Libro de ventas: lo emitido en Faro (las rechazadas y con error también, para marcarlas) */
async function salesRows(s: IvaScope): Promise<BookRow[]> {
  const rows = await db()
    .select()
    .from(invoices)
    .where(and(eq(invoices.studio_id, s.studioId), eq(invoices.organization_id, s.organizationId), inArray(invoices.status, ["autorizada", "rechazada", "error"])))
    .orderBy(desc(invoices.issue_date))
    .limit(5000);
  return rows.map((i) => {
    const t = CBTE_TYPES[i.cbte_type];
    const sign = t?.kind === "nota_credito" ? -1 : 1;
    return {
      id: i.id,
      kind: "venta" as const,
      fecha: i.issue_date,
      letra: t?.letter ?? null,
      codigo: i.cbte_type,
      puntoVenta: i.point_of_sale,
      numero: i.number,
      cuit: i.customer_doc_number,
      nombre: i.customer_name,
      neto: sign * cents(i.net),
      noGravado: 0,
      exento: sign * cents(i.exempt),
      iva: (i.iva_breakdown ?? []).map((x) => ({ alicuota: x.rate, importe: sign * cents(x.amount) })),
      percepcionesIva: 0,
      total: sign * cents(i.total),
      cae: i.cae,
      fingerprint: null,
      loadedAt: i.issue_date,
      status: i.status,
      ownCuit: i.cuit,
    };
  });
}

/** De una CUIT propia: las ventas que emitió y las compras a su nombre (las que no dicen receptor también entran, «a validar») */
const ofCuit = (cuit?: string | null) => (r: BookRow) => !cuit || r.ownCuit === cuit || (r.kind === "compra" && !r.ownCuit);

/** El libro de un período para exportar (opcionalmente de una sola CUIT): ventas solo autorizadas */
export async function bookFor(s: IvaScope, period: string, book: Book, cuit?: string | null) {
  if (!isPeriod(period)) throw new IvaError("Período inválido.");
  if (cuit && !/^\d{11}$/.test(cuit)) throw new IvaError("CUIT inválida.");
  if (!(await orgOk(s))) throw new IvaError("Esa organización no es del estudio.");
  const all = (book === "compras" ? await purchaseRows(s) : await salesRows(s)).filter(ofCuit(cuit));
  return rowsOf(all, period)
    .filter((r) => book === "compras" || r.status === "autorizada")
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.numero ?? 0) - (b.numero ?? 0));
}

/** Posición de IVA (débito − crédito) del período y los 3 anteriores, con el semáforo (§2.p, B4) */
export async function ivaPosition(s: IvaScope, period: string, cuit?: string | null) {
  if (!isPeriod(period)) throw new IvaError("Período inválido.");
  if (!(await orgOk(s))) throw new IvaError("Esa organización no es del estudio.");
  const [sales, purchases] = await Promise.all([salesRows(s), purchaseRows(s)]);
  const months = [0, 1, 2, 3].map((n) => (n ? prevPeriod(period, n) : period));
  const items = months.map((p) => {
    const debit = summarize(rowsOf(sales.filter(ofCuit(cuit)), p).filter((r) => r.status === "autorizada"), "ventas").fiscal;
    const credit = summarize(rowsOf(purchases.filter(ofCuit(cuit)), p), "compras").fiscal;
    return { period: p, debit, credit, balance: debit - credit };
  });
  return { items, light: ivaLight(items[0].balance, items.slice(1).filter((x) => x.debit || x.credit).map((x) => x.balance)) };
}

interface IvaAnalysis {
  period: string;
  book: Book;
  rows: BookRow[];
  summary: ReturnType<typeof summarize>;
  previous: { period: string; count: number; fiscal: number; total: number }[];
  anomalies: Anomaly[];
  marks: (typeof iva_marks.$inferSelect)[];
  checklist: ChecklistItem[];
}

/** El análisis de un período: libro, resumen, comparación, anomalías, marcas y checklist */
export async function analyze(s: IvaScope, period: string, book: Book): Promise<IvaAnalysis> {
  if (!isPeriod(period)) throw new IvaError("Período inválido.");
  if (!(await orgOk(s))) throw new IvaError("Esa organización no es del estudio.");
  const all = book === "compras" ? await purchaseRows(s) : await salesRows(s);
  const rows = rowsOf(all, period).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const valid = book === "ventas" ? rows.filter((r) => r.status === "autorizada") : rows;
  const summary = summarize(valid, book);
  const previous = [1, 2, 3].map((n) => {
    const p = prevPeriod(period, n);
    const r = rowsOf(all, p).filter((x) => book === "compras" || x.status === "autorizada");
    const sm = summarize(r, book);
    return { period: p, count: sm.count, fiscal: sm.fiscal, total: sm.total };
  });
  const anomalies = book === "compras" ? purchaseAnomalies(rows, all, period) : salesAnomalies(rows);
  const marks = await db().select().from(iva_marks).where(and(eq(iva_marks.studio_id, s.studioId), eq(iva_marks.organization_id, s.organizationId), eq(iva_marks.book, book), eq(iva_marks.period, period)));
  const checklist = await checklistFor(s, period, book, rows, anomalies, marks);
  return { period, book, rows, summary, previous, anomalies, marks, checklist };
}

/** Lo que falta antes de presentar: un dato para el contador, nunca una validación */
async function checklistFor(s: IvaScope, period: string, book: Book, rows: BookRow[], anomalies: Anomaly[], marks: (typeof iva_marks.$inferSelect)[]): Promise<ChecklistItem[]> {
  const out: ChecklistItem[] = [];
  const openMarks = marks.filter((m) => m.status === "a_revisar").length;
  const high = anomalies.filter((a) => a.severity === "alta");
  const resolved = new Set(marks.filter((m) => m.status === "resuelta").map((m) => m.row_id));
  const highOpen = high.filter((a) => !a.rowIds.length || a.rowIds.some((id) => !resolved.has(id)));
  if (book === "compras") {
    const [pend] = await db()
      .select({ n: sql<number>`count(*)::int` })
      .from(smart_documents)
      .where(and(eq(smart_documents.studio_id, s.studioId), eq(smart_documents.organization_id, s.organizationId), eq(smart_documents.scope, "organizacion"), inArray(smart_documents.status, ["para_confirmar", "en_cola", "leyendo"]), sql`(${smart_documents.extracted}->>'fecha' like ${`${period}%`} or ${smart_documents.created_at} >= ${`${period}-01`}::date)`));
    out.push({ label: "No quedan comprobantes de compra para confirmar", state: pend.n ? "pendiente" : "ok", detail: pend.n ? `${pend.n} en Lectura inteligente.` : undefined });
    const withCae = rows.filter((r) => r.cae);
    const checked = withCae.filter((r) => r.validation?.arca?.cae === "autorizado");
    out.push({ label: "CAE constatados en ARCA", state: !withCae.length ? "sin_dato" : checked.length === withCae.length ? "ok" : checked.length ? "pendiente" : "sin_dato", detail: withCae.length ? `${checked.length} de ${withCae.length} constatados.` : "Ningún comprobante con CAE en el período." });
    if (await hasModule(s.studioId, "bank_rec")) {
      const [mov] = await db()
        .select({ n: sql<number>`count(*)::int` })
        .from(bank_movements)
        .where(and(eq(bank_movements.studio_id, s.studioId), eq(bank_movements.organization_id, s.organizationId), inArray(bank_movements.status, ["sin_conciliar", "sugerido"]), gte(bank_movements.date, `${period}-01`), sql`${bank_movements.date} < (${`${period}-01`}::date + interval '1 month')`));
      out.push({ label: "Conciliación bancaria del período sin pendientes", state: mov.n ? "pendiente" : "ok", detail: mov.n ? `${mov.n} movimientos sin conciliar.` : undefined });
    }
  } else {
    const bad = rows.filter((r) => r.status !== "autorizada").length;
    out.push({ label: "Sin comprobantes rechazados ni con error", state: bad ? "pendiente" : "ok", detail: bad ? `${bad} sin CAE.` : undefined });
    out.push({ label: "Numeración sin saltos", state: anomalies.some((a) => a.type === "numeracion") ? "pendiente" : "ok" });
  }
  out.push({ label: "Anomalías de importancia alta revisadas", state: highOpen.length ? "pendiente" : "ok", detail: highOpen.length ? `${highOpen.length} sin marcar como resueltas.` : undefined });
  out.push({ label: "Comprobantes marcados a revisar, resueltos", state: openMarks ? "pendiente" : "ok", detail: openMarks ? `${openMarks} a revisar.` : undefined });
  return out;
}

/** ¿Está listo para presentar? (solo un resumen del checklist) */
export const readyToFile = (c: ChecklistItem[]) => c.every((x) => x.state !== "pendiente");

// ───────────── Marcas «a revisar» ─────────────

async function rowExists(s: IvaScope, book: Book, rowId: string) {
  if (!isUuid(rowId)) return false;
  if (book === "compras") {
    const [r] = await db().select({ id: smart_documents.id }).from(smart_documents).where(and(eq(smart_documents.id, rowId), eq(smart_documents.studio_id, s.studioId), eq(smart_documents.organization_id, s.organizationId)));
    return !!r;
  }
  const [r] = await db().select({ id: invoices.id }).from(invoices).where(and(eq(invoices.id, rowId), eq(invoices.studio_id, s.studioId), eq(invoices.organization_id, s.organizationId)));
  return !!r;
}

export async function markRow(s: IvaScope, actor: Actor, i: { period: string; book: Book; rowId: string; note: string | null; state: "a_revisar" | "resuelta" | "quitar" }) {
  if (!isPeriod(i.period) || !["compras", "ventas"].includes(i.book)) throw new IvaError("Dato inválido.");
  if (!(await orgOk(s)) || !(await rowExists(s, i.book, i.rowId))) throw new IvaError("Ese comprobante no es de esta organización.");
  const where = and(eq(iva_marks.organization_id, s.organizationId), eq(iva_marks.book, i.book), eq(iva_marks.row_id, i.rowId));
  if (i.state === "quitar") await db().delete(iva_marks).where(where);
  else {
    const note = i.note?.trim().slice(0, 500) || null;
    const values = { status: i.state, ...(note !== null ? { note } : {}), ...(i.state === "resuelta" ? { resolved_by: actor.id, resolved_at: new Date() } : { resolved_by: null, resolved_at: null }) };
    const [up] = await db().update(iva_marks).set(values).where(where).returning({ id: iva_marks.id });
    if (!up) await db().insert(iva_marks).values({ studio_id: s.studioId, organization_id: s.organizationId, period: i.period, book: i.book, row_id: i.rowId, note, created_by: actor.id, ...values });
  }
  await audit({ studioId: s.studioId, organizationId: s.organizationId, actor, action: `iva.marca_${i.state}`, entityType: i.book === "compras" ? "documento_leido" : "factura", entityId: i.rowId, metadata: { periodo: i.period, libro: i.book } });
}

/** Para el Agente y el Vigía: el análisis resumido de una organización */
export async function brief(s: IvaScope, period: string) {
  const [c, v] = await Promise.all([analyze(s, period, "compras"), analyze(s, period, "ventas")]);
  return {
    periodo: period,
    compras: { comprobantes: c.summary.count, credito_fiscal: c.summary.fiscal / 100, total: c.summary.total / 100 },
    ventas: { comprobantes: v.summary.count, debito_fiscal: v.summary.fiscal / 100, total: v.summary.total / 100 },
    saldo_tecnico: (v.summary.fiscal - c.summary.fiscal) / 100,
    anomalias: [...c.anomalies.map((a) => ({ ...a, libro: "compras" })), ...v.anomalies.map((a) => ({ ...a, libro: "ventas" }))].map((a) => ({ tipo: a.type, importancia: a.severity, titulo: a.title, detalle: a.detail, libro: a.libro, comprobantes: a.rowIds.length })),
    listo_para_presentar: readyToFile(c.checklist) && readyToFile(v.checklist),
    pendientes: [...c.checklist, ...v.checklist].filter((x) => x.state === "pendiente").map((x) => x.label),
    enlace: `/admin/organizaciones/${s.organizationId}?tab=iva&periodo=${period}`,
    aviso: "Datos según lo cargado en Faro: no reemplazan el criterio de un contador.",
  };
}

