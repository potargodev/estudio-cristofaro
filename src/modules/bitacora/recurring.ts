import "server-only";
import { and, asc, desc, eq, gte, inArray, isNull, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { bitacora_entries, bitacora_insights, bitacora_recurring } from "@/db/schema";
import { listCategories } from "./server";
import { budgetView, PlanningError } from "./planning";
import { detectLeaks, detectRecurring, merchantKey, type Mov } from "./smart";
import { formatDate, formatMoney } from "@/lib/format";

// Gastos fijos y suscripciones (detección por recurrencia), fugas y avisos
// (vencimientos, renovaciones, aumentos y sobres excedidos). Todo de la
// persona; los avisos son preventivos y se pueden descartar.

const db = () => getDb();
const UUID = /^[0-9a-f-]{36}$/i;
const today = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);

/** Movimientos propios de los últimos 6 meses, con la hora de carga (Argentina) */
async function recentMovs(userId: string): Promise<Mov[]> {
  const since = new Date(Date.now() - 190 * 86400000).toISOString().slice(0, 10);
  const [rows, cats] = await Promise.all([
    db().select().from(bitacora_entries).where(and(eq(bitacora_entries.user_id, userId), isNull(bitacora_entries.deleted_at), gte(bitacora_entries.date, since))).orderBy(asc(bitacora_entries.date)),
    listCategories(userId, true),
  ]);
  const key = new Map(cats.map((c) => [c.id, c.key]));
  return rows.map((e) => ({
    id: e.id,
    kind: e.kind,
    amount: e.amount,
    currency: e.currency,
    date: e.date,
    description: e.description,
    categoryId: e.category_id,
    categoryKey: e.category_id ? key.get(e.category_id) ?? null : null,
    hour: e.source === "copiloto" || e.source === "manual" ? Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: "America/Argentina/Buenos_Aires" }).format(e.created_at)) : null,
  }));
}

/** Detecta fijos y suscripciones y actualiza la tabla (respeta lo confirmado o descartado) */
export async function refreshRecurring(userId: string) {
  const movs = await recentMovs(userId);
  const found = detectRecurring(movs);
  const existing = await db().select().from(bitacora_recurring).where(eq(bitacora_recurring.user_id, userId));
  for (const r of found) {
    const prev = existing.find((e) => e.key === r.key);
    if (prev?.status === "descartado") continue;
    const values = { user_id: userId, key: r.key, label: prev?.label ?? r.label, category_id: r.categoryId, kind: r.kind, currency: r.currency, avg_amount: r.avgAmount, last_amount: r.lastAmount, last_date: r.lastDate, next_date: r.nextDate, months: r.months, price_change_pct: r.priceChangePct == null ? null : String(r.priceChangePct), source: prev?.source ?? "deteccion" };
    await db().insert(bitacora_recurring).values(values).onConflictDoUpdate({ target: [bitacora_recurring.user_id, bitacora_recurring.key], set: values });
  }
  return { movs, found };
}

export async function listRecurring(userId: string) {
  return db().select().from(bitacora_recurring).where(and(eq(bitacora_recurring.user_id, userId), ne(bitacora_recurring.status, "descartado"))).orderBy(asc(bitacora_recurring.next_date));
}

export async function addManualRecurring(userId: string, i: { label: string; amount: number; day: number; kind: string }) {
  if (!i.label.trim() || !(i.amount > 0)) throw new PlanningError("Poné un nombre y un monto.");
  const now = new Date();
  const day = Math.min(28, Math.max(1, Math.round(i.day || 1)));
  const next = new Date(now.getFullYear(), now.getMonth() + (now.getDate() > day ? 1 : 0), day);
  const key = merchantKey(i.label) || i.label.toLowerCase().slice(0, 40);
  const iso = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const values = { user_id: userId, key, label: i.label.trim().slice(0, 60), kind: i.kind === "suscripcion" ? "suscripcion" : "fijo", currency: "ARS", avg_amount: Math.round(i.amount), last_amount: Math.round(i.amount), last_date: today(), next_date: iso, months: 1, status: "confirmado", source: "manual" };
  await db().insert(bitacora_recurring).values(values).onConflictDoUpdate({ target: [bitacora_recurring.user_id, bitacora_recurring.key], set: values });
}

export async function setRecurringStatus(userId: string, id: string, patch: { status?: "confirmado" | "descartado"; stillUsed?: boolean }) {
  if (!UUID.test(id)) return;
  await db()
    .update(bitacora_recurring)
    .set({ ...(patch.status ? { status: patch.status } : {}), ...(patch.stillUsed !== undefined ? { still_used: patch.stillUsed } : {}) })
    .where(and(eq(bitacora_recurring.id, id), eq(bitacora_recurring.user_id, userId)));
}

// ───────────── Avisos ─────────────

async function upsertInsight(userId: string, i: { kind: string; ref?: string; period: string; title: string; body: string; data?: Record<string, unknown> }) {
  const [row] = await db()
    .insert(bitacora_insights)
    .values({ user_id: userId, kind: i.kind, ref: i.ref ?? "", period: i.period, title: i.title, body: i.body, data: i.data ?? {} })
    .onConflictDoNothing()
    .returning({ id: bitacora_insights.id });
  return row?.id ?? null;
}

/**
 * Recalcula fijos, fugas y avisos del mes. Devuelve los avisos nuevos (para
 * mandarlos a la campanita). Nunca repite un aviso del mismo período.
 */
export async function refreshInsights(userId: string) {
  const { movs } = await refreshRecurring(userId);
  const rec = await listRecurring(userId);
  const created: { id: string; title: string; body: string }[] = [];
  const add = async (i: Parameters<typeof upsertInsight>[1]) => {
    const id = await upsertInsight(userId, i);
    if (id) created.push({ id, title: i.title, body: i.body });
  };
  const month = today().slice(0, 7);
  for (const l of detectLeaks(movs, rec.map((r) => ({ key: r.key, label: r.label, categoryId: r.category_id, kind: r.kind as "fijo" | "suscripcion", currency: r.currency, avgAmount: r.avg_amount, lastAmount: r.last_amount, lastDate: r.last_date, nextDate: r.next_date, months: r.months, priceChangePct: r.price_change_pct ? Number(r.price_change_pct) : null, stillUsed: r.still_used })))) await add({ kind: l.kind, ref: String(l.data.key ?? ""), period: month, title: l.title, body: l.body, data: l.data });
  const soon = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  for (const r of rec) {
    if (r.price_change_pct && Number(r.price_change_pct) >= 10) await add({ kind: "aumento", ref: r.key, period: r.last_date.slice(0, 7), title: `Subió ${r.label}`, body: `El último pago fue ${formatMoney(r.last_amount, "ARS", { decimals: "none" })}, ${Number(r.price_change_pct)}% más que antes (${formatMoney(r.avg_amount, "ARS", { decimals: "none" })} de promedio).`, data: { key: r.key } });
    if (r.next_date >= today() && r.next_date <= soon && r.status !== "descartado") await add({ kind: r.kind === "suscripcion" ? "renovacion" : "vencimiento", ref: r.key, period: r.next_date, title: r.kind === "suscripcion" ? `Se renueva ${r.label}` : `Vence ${r.label}`, body: `El ${formatDate(r.next_date, "short")}, unos ${formatMoney(r.last_amount, "ARS", { decimals: "none" })}.`, data: { key: r.key } });
  }
  const b = await budgetView(userId);
  for (const x of b.list) if (x.budget && x.spent > x.budget) await add({ kind: "sobre_excedido", ref: x.categoryId, period: month, title: `Te pasaste en ${x.name}`, body: `Llevás ${formatMoney(x.spent, "ARS", { decimals: "none" })} de ${formatMoney(x.budget, "ARS", { decimals: "none" })} este mes.`, data: { categoryId: x.categoryId } });
  else if (x.budget && x.spent > x.budget * 0.8) await add({ kind: "sobre_cerca", ref: x.categoryId, period: month, title: `Cerca del tope en ${x.name}`, body: `Llevás ${formatMoney(x.spent, "ARS", { decimals: "none" })} de ${formatMoney(x.budget, "ARS", { decimals: "none" })}: te quedan ${formatMoney(x.budget - x.spent, "ARS", { decimals: "none" })} para el mes.`, data: { categoryId: x.categoryId } });
  return created;
}

export async function listInsights(userId: string, limit = 8) {
  return db().select().from(bitacora_insights).where(and(eq(bitacora_insights.user_id, userId), inArray(bitacora_insights.status, ["nuevo", "visto"]))).orderBy(desc(bitacora_insights.created_at)).limit(limit);
}

export async function dismissInsight(userId: string, id: string) {
  if (!UUID.test(id)) return;
  await db().update(bitacora_insights).set({ status: "descartado" }).where(and(eq(bitacora_insights.id, id), eq(bitacora_insights.user_id, userId)));
}
