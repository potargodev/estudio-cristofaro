import "server-only";
import { and, count, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { bitacora_entries, bitacora_imports } from "@/db/schema";
import { listCategories } from "./server";
import { bitacoraPlan } from "./plus";
import { mapRows, mercadoPagoMapping, merchantKey, parseAmount, parseCsv, parseDate, rowsFromPdfText, type ImportRow, type Mapping } from "./smart";
import { pdfPages } from "@/lib/text/extract";

// Importación de resúmenes bancarios y de tarjeta (CSV y PDF con texto) y del
// CSV de movimientos de Mercado Pago: vista previa con el mapeo de columnas,
// detección de duplicados y confirmación. Cada movimiento guarda el lote, su
// ID externo y la fila original.

const db = () => getDb();
const UUID = /^[0-9a-f-]{36}$/i;
export class ImportError extends Error {}

/** Adivina el mapeo de columnas mirando las filas */
export function guessMapping(rows: string[][]): Mapping {
  const mp = rows[0] ? mercadoPagoMapping(rows[0]) : null;
  if (mp) return mp;
  const sample = rows.slice(1, 15);
  const cols = Math.max(...rows.map((r) => r.length));
  const score = (fn: (v: string) => boolean, c: number) => sample.filter((r) => fn(r[c] ?? "")).length;
  const dateCol = [...Array(cols).keys()].sort((a, b) => score((v) => !!parseDate(v), b) - score((v) => !!parseDate(v), a))[0] ?? 0;
  const amountCols = [...Array(cols).keys()].filter((c) => c !== dateCol && score((v) => parseAmount(v) != null && /\d/.test(v), c) >= Math.max(1, sample.length / 3));
  const textCol = [...Array(cols).keys()].filter((c) => c !== dateCol && !amountCols.includes(c)).sort((a, b) => score((v) => /[a-z]/i.test(v), b) - score((v) => /[a-z]/i.test(v), a))[0] ?? 1;
  const header = (rows[0] ?? []).map((h) => h.toLowerCase());
  const debit = header.findIndex((h) => /d[eé]bito|debe|egreso/.test(h));
  const credit = header.findIndex((h) => /cr[eé]dito|haber|ingreso/.test(h));
  const skipHeader = !parseDate(rows[0]?.[dateCol] ?? "");
  if (debit >= 0 && credit >= 0) return { date: dateCol, description: textCol, debit, credit, skipHeader };
  return { date: dateCol, description: textCol, amount: amountCols[amountCols.length - 1] ?? 2, skipHeader };
}

export async function importsThisMonth(userId: string) {
  const first = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 8) + "01";
  const [{ n }] = await db().select({ n: count() }).from(bitacora_imports).where(and(eq(bitacora_imports.user_id, userId), eq(bitacora_imports.status, "importado"), gte(bitacora_imports.created_at, new Date(`${first}T03:00:00Z`))));
  return n;
}

/** Lee el archivo y guarda la vista previa (todavía no carga nada) */
export async function createPreview(user: { id: string; studioId: string }, file: File, source: "auto" | "mercadopago_csv") {
  const plan = await bitacoraPlan(user);
  if (plan.limits.importsPerMonth != null && (await importsThisMonth(user.id)) >= plan.limits.importsPerMonth) throw new ImportError(`En Bitácora Gratis podés importar ${plan.limits.importsPerMonth} resúmenes por mes. Con Plus, sin límite.`);
  if (file.size > 5 * 1024 * 1024) throw new ImportError("El archivo pesa más de 5 MB.");
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  let rows: string[][];
  if (isPdf) {
    rows = rowsFromPdfText((await pdfPages(new Uint8Array(await file.arrayBuffer()))).join("\n"));
    if (!rows.length) throw new ImportError("No encontramos movimientos en el PDF (tiene que tener texto, no una imagen escaneada). Probá con el CSV o el Excel del banco.");
    rows.unshift(["Fecha", "Descripción", "Importe"]);
  } else {
    rows = parseCsv(await file.text());
    if (rows.length < 2) throw new ImportError("El archivo no tiene filas.");
  }
  const mapping = isPdf ? { date: 0, description: 1, amount: 2, skipHeader: true, positiveIsExpense: true } : guessMapping(rows);
  const [row] = await db()
    .insert(bitacora_imports)
    .values({ user_id: user.id, source: isPdf ? "pdf" : source === "mercadopago_csv" || mercadoPagoMapping(rows[0]) ? "mercadopago_csv" : "csv", file_name: file.name.slice(0, 120), mapping: mapping as unknown as Record<string, unknown>, rows: rows.slice(0, 2000), total: rows.length - (mapping.skipHeader ? 1 : 0) })
    .returning();
  return row;
}

async function getImport(userId: string, id: string) {
  if (!UUID.test(id)) return null;
  const [r] = await db().select().from(bitacora_imports).where(and(eq(bitacora_imports.id, id), eq(bitacora_imports.user_id, userId)));
  return r ?? null;
}

/** Filas convertidas con el mapeo y marcadas si ya están cargadas */
export async function previewRows(userId: string, id: string, override?: Mapping) {
  const imp = await getImport(userId, id);
  if (!imp) return null;
  const mapping = override ?? (imp.mapping as unknown as Mapping);
  const rows = mapRows(imp.rows as string[][], mapping);
  if (!rows.length) return { imp, mapping, rows: [] as ImportRow[] };
  const dates = rows.map((r) => r.date).sort();
  const existing = await db()
    .select({ date: bitacora_entries.date, amount: bitacora_entries.amount, description: bitacora_entries.description, externalId: bitacora_entries.external_id })
    .from(bitacora_entries)
    .where(and(eq(bitacora_entries.user_id, userId), isNull(bitacora_entries.deleted_at), gte(bitacora_entries.date, dates[0]), sql`${bitacora_entries.date} <= ${dates[dates.length - 1]}`));
  const ext = new Set(existing.map((e) => e.externalId).filter(Boolean));
  const loose = new Set(existing.map((e) => `${e.date}|${e.amount}|${merchantKey(e.description)}`));
  const seen = new Set<string>();
  for (const r of rows) {
    const k = `${r.date}|${r.amount}|${merchantKey(r.description)}`;
    r.duplicate = ext.has(r.externalId) || loose.has(k) || seen.has(r.externalId);
    seen.add(r.externalId);
  }
  return { imp, mapping, rows };
}

/** Categoría sugerida: la de un movimiento anterior del mismo comercio, o "otros" / "ingresos" */
async function categoryGuesser(userId: string) {
  const [cats, past] = await Promise.all([
    listCategories(userId),
    db().select({ d: bitacora_entries.description, c: bitacora_entries.category_id }).from(bitacora_entries).where(and(eq(bitacora_entries.user_id, userId), isNull(bitacora_entries.deleted_at))).orderBy(desc(bitacora_entries.created_at)).limit(500),
  ]);
  const byMerchant = new Map<string, string>();
  for (const p of past) if (p.c && !byMerchant.has(merchantKey(p.d))) byMerchant.set(merchantKey(p.d), p.c);
  const otros = cats.find((c) => c.key === "otros")?.id ?? null;
  const ingresos = cats.find((c) => c.key === "ingresos")?.id ?? null;
  return (r: { description: string; kind: string }) => byMerchant.get(merchantKey(r.description)) ?? (r.kind === "ingreso" ? ingresos : otros);
}

/** Carga las filas elegidas (sin duplicados) */
export async function confirmImport(userId: string, id: string, mapping: Mapping, chosen: Set<string> | null) {
  const p = await previewRows(userId, id, mapping);
  if (!p || p.imp.status !== "vista_previa") throw new ImportError("Esa importación ya no está disponible.");
  const guess = await categoryGuesser(userId);
  const rows = p.rows.filter((r) => !r.duplicate && (!chosen || chosen.has(r.externalId)));
  const source = p.imp.source === "mercadopago_csv" ? "mercadopago" : "importacion";
  if (rows.length)
    await db()
      .insert(bitacora_entries)
      .values(rows.map((r) => ({ user_id: userId, kind: r.kind, amount: r.amount, currency: "ARS", date: r.date, category_id: guess(r), description: r.description, source, import_id: p.imp.id, external_id: r.externalId, raw: r.raw, validation: "importado", synced_at: new Date() })));
  await db().update(bitacora_imports).set({ status: "importado", mapping: mapping as unknown as Record<string, unknown>, imported: rows.length, duplicates: p.rows.filter((r) => r.duplicate).length }).where(eq(bitacora_imports.id, p.imp.id));
  return { imported: rows.length, duplicates: p.rows.filter((r) => r.duplicate).length };
}

export async function discardImport(userId: string, id: string) {
  if (!UUID.test(id)) return;
  await db().update(bitacora_imports).set({ status: "descartado", rows: [] }).where(and(eq(bitacora_imports.id, id), eq(bitacora_imports.user_id, userId), eq(bitacora_imports.status, "vista_previa")));
}

export async function listImports(userId: string) {
  return db().select({ id: bitacora_imports.id, source: bitacora_imports.source, fileName: bitacora_imports.file_name, status: bitacora_imports.status, total: bitacora_imports.total, imported: bitacora_imports.imported, duplicates: bitacora_imports.duplicates, createdAt: bitacora_imports.created_at }).from(bitacora_imports).where(eq(bitacora_imports.user_id, userId)).orderBy(desc(bitacora_imports.created_at)).limit(20);
}

/** Deshace una importación (borra lo que cargó ese lote) */
export async function undoImport(userId: string, id: string) {
  if (!UUID.test(id)) return 0;
  const r = await db().update(bitacora_entries).set({ deleted_at: new Date() }).where(and(eq(bitacora_entries.user_id, userId), eq(bitacora_entries.import_id, id), isNull(bitacora_entries.deleted_at))).returning({ id: bitacora_entries.id });
  await db().update(bitacora_imports).set({ status: "descartado" }).where(and(eq(bitacora_imports.id, id), eq(bitacora_imports.user_id, userId)));
  return r.length;
}
