import "server-only";
import { and, asc, count, desc, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { getDb } from "@/db";
import { bitacora_budgets, bitacora_entries, bitacora_goal_moves, bitacora_goals, fx_snapshots, ipc_series } from "@/db/schema";
import { arsRate } from "@/modules/gastos/server/fx";
import { monthOf, prevMonth } from "./catalog";
import { bitacoraPlan } from "./plus";
import { listCategories, movements } from "./server";
import { realValue, suggestBudgets, weeklySaving } from "./smart";

// Sobres, metas, valores reales (IPC y dólar MEP) y separación de lo
// profesional. Todo por el user_id de la sesión.

const db = () => getDb();
const UUID = /^[0-9a-f-]{36}$/i;
export class PlanningError extends Error {}

// ───────────── Sobres ─────────────

/** Gasto en pesos por categoría de los últimos `n` meses completos */
async function spendHistory(userId: string, n = 3) {
  const months: string[] = [];
  let m = prevMonth(monthOf());
  for (let i = 0; i < n; i++) {
    months.unshift(m);
    m = prevMonth(m);
  }
  const byCat: Record<string, number[]> = {};
  for (const [i, month] of months.entries()) {
    for (const mv of await movements(userId, month)) {
      if (mv.kind !== "gasto" || mv.currency !== "ARS" || !mv.categoryId) continue;
      byCat[mv.categoryId] ??= Array(n).fill(0);
      byCat[mv.categoryId][i] += mv.amount;
    }
  }
  return { months, byCat };
}

export async function budgetView(userId: string, month = monthOf()) {
  const [cats, rows, hist, current] = await Promise.all([listCategories(userId), db().select().from(bitacora_budgets).where(eq(bitacora_budgets.user_id, userId)), spendHistory(userId), movements(userId, month)]);
  const suggested = suggestBudgets(hist.byCat);
  const spent: Record<string, number> = {};
  for (const mv of current) if (mv.kind === "gasto" && mv.currency === "ARS" && mv.categoryId) spent[mv.categoryId] = (spent[mv.categoryId] ?? 0) + mv.amount;
  const list = cats
    .filter((c) => c.kind === "gasto")
    .map((c) => {
      const b = rows.find((r) => r.category_id === c.id);
      return { categoryId: c.id, name: c.name, budget: b?.amount ?? null, isSuggested: b?.suggested ?? false, suggested: suggested[c.id] ?? null, spent: spent[c.id] ?? 0 };
    });
  const total = list.reduce((s, x) => s + (x.budget ?? 0), 0);
  const totalSpent = list.filter((x) => x.budget != null).reduce((s, x) => s + x.spent, 0);
  return { month, list, total, totalSpent, monthsUsed: hist.months, hasHistory: Object.keys(suggested).length > 0 };
}

export async function saveBudget(userId: string, categoryId: string, amount: number | null, suggested = false) {
  if (!UUID.test(categoryId)) throw new PlanningError("Categoría inválida.");
  const cats = await listCategories(userId);
  if (!cats.some((c) => c.id === categoryId)) throw new PlanningError("Categoría inválida.");
  if (amount == null || amount <= 0) {
    await db().delete(bitacora_budgets).where(and(eq(bitacora_budgets.user_id, userId), eq(bitacora_budgets.category_id, categoryId)));
    return;
  }
  await db()
    .insert(bitacora_budgets)
    .values({ user_id: userId, category_id: categoryId, amount: Math.round(amount), suggested })
    .onConflictDoUpdate({ target: [bitacora_budgets.user_id, bitacora_budgets.category_id], set: { amount: Math.round(amount), suggested } });
}

/** Aplica los sobres sugeridos donde no hay uno propio */
export async function applySuggested(userId: string) {
  const v = await budgetView(userId);
  let n = 0;
  for (const x of v.list) if (x.suggested && x.budget == null) {
    await saveBudget(userId, x.categoryId, x.suggested, true);
    n++;
  }
  return n;
}

// ───────────── Metas ─────────────

export async function listGoals(userId: string) {
  const goals = await db().select().from(bitacora_goals).where(and(eq(bitacora_goals.user_id, userId), eq(bitacora_goals.archived, false))).orderBy(asc(bitacora_goals.created_at));
  return goals.map((g) => ({ ...g, weekly: weeklySaving(g.target, g.saved, g.deadline), progress: g.target ? Math.min(1, g.saved / g.target) : 0 }));
}

export async function createGoal(userId: string, studioId: string, i: { name: string; kind: string; target: number; deadline: string | null; currency: string }) {
  if (!i.name.trim() || !(i.target > 0)) throw new PlanningError("Poné un nombre y cuánto querés juntar.");
  const plan = await bitacoraPlan({ studioId });
  if (plan.limits.goals != null) {
    const [{ n }] = await db().select({ n: count() }).from(bitacora_goals).where(and(eq(bitacora_goals.user_id, userId), eq(bitacora_goals.archived, false)));
    if (n >= plan.limits.goals) throw new PlanningError(`En Bitácora Gratis podés tener ${plan.limits.goals} meta activa. Con Plus, todas las que quieras.`);
  }
  const [g] = await db()
    .insert(bitacora_goals)
    .values({ user_id: userId, name: i.name.trim().slice(0, 80), kind: ["viaje", "emergencia"].includes(i.kind) ? i.kind : "otro", target: Math.round(i.target), deadline: i.deadline && /^\d{4}-\d{2}-\d{2}$/.test(i.deadline) ? i.deadline : null, currency: i.currency === "USD" ? "USD" : "ARS" })
    .returning();
  return g;
}

export async function addToGoal(userId: string, goalId: string, amount: number, note: string | null) {
  if (!UUID.test(goalId) || !Number.isFinite(amount) || amount === 0) throw new PlanningError("Revisá el monto.");
  const [g] = await db().select().from(bitacora_goals).where(and(eq(bitacora_goals.id, goalId), eq(bitacora_goals.user_id, userId)));
  if (!g) throw new PlanningError("No encontramos esa meta.");
  await db().insert(bitacora_goal_moves).values({ goal_id: g.id, amount: Math.round(amount), date: new Date().toISOString().slice(0, 10), note: note?.slice(0, 120) || null });
  await db().update(bitacora_goals).set({ saved: Math.max(0, g.saved + Math.round(amount)) }).where(eq(bitacora_goals.id, g.id));
}

export async function archiveGoal(userId: string, goalId: string) {
  if (!UUID.test(goalId)) return;
  await db().update(bitacora_goals).set({ archived: true }).where(and(eq(bitacora_goals.id, goalId), eq(bitacora_goals.user_id, userId)));
}

// ───────────── Valores reales ─────────────

export async function ipcTable() {
  return db().select().from(ipc_series).orderBy(desc(ipc_series.month)).limit(60);
}

/** Factor para llevar montos de `month` a pesos del último mes con IPC */
export async function ipcFactor(month: string) {
  const rows = await db().select().from(ipc_series).where(inArray(ipc_series.month, [month])).limit(1);
  const [latest] = await db().select().from(ipc_series).orderBy(desc(ipc_series.month)).limit(1);
  if (!rows[0] || !latest) return null;
  return { then: Number(rows[0].value), now: Number(latest.value), latestMonth: latest.month, source: latest.source, apply: (c: number) => realValue(c, Number(rows[0].value), Number(latest.value)) };
}

/** Cotización del dólar MEP para un mes: promedio de las guardadas, o la de hoy */
export async function mepFor(month: string) {
  const from = `${month}-01`;
  const to = `${month}-31`;
  const rows = await db().select({ rate: fx_snapshots.rate, date: fx_snapshots.date }).from(fx_snapshots).where(and(eq(fx_snapshots.currency, "USD"), eq(fx_snapshots.kind, "mep"), gte(fx_snapshots.date, from), lte(fx_snapshots.date, to)));
  if (rows.length) return { rate: rows.reduce((s, r) => s + Number(r.rate), 0) / rows.length, source: `Dólar MEP promedio de ${rows.length} día${rows.length === 1 ? "" : "s"} del mes` };
  const now = await arsRate("USD", "mep");
  return now ? { rate: now, source: "Dólar MEP de hoy (sin cotizaciones guardadas de ese mes)" } : null;
}

/** Guarda la cotización MEP del día (la corre el job) */
export async function snapshotMep() {
  const rate = await arsRate("USD", "mep");
  if (!rate) return false;
  await db()
    .insert(fx_snapshots)
    .values({ date: new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10), currency: "USD", kind: "mep", rate: String(rate), source: process.env.FX_API_URL ? "FX_API_URL" : "DolarApi" })
    .onConflictDoNothing();
  return true;
}

// ───────────── Personal / profesional (autónomos) ─────────────

export async function markProfessional(user: { id: string; studioId: string; email: string; role: string; tenantKind: string }, entryId: string, i: { professional: boolean; deductible: boolean }) {
  if (!UUID.test(entryId)) throw new PlanningError("Movimiento inválido.");
  const [e] = await db().select().from(bitacora_entries).where(and(eq(bitacora_entries.id, entryId), eq(bitacora_entries.user_id, user.id), isNull(bitacora_entries.deleted_at)));
  if (!e) throw new PlanningError("No encontramos ese movimiento.");
  await db().update(bitacora_entries).set({ professional: i.professional, deductible: i.professional && i.deductible }).where(eq(bitacora_entries.id, e.id));
}
