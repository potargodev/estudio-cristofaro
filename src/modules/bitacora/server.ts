import "server-only";
import { and, asc, desc, eq, gte, isNull, lte } from "drizzle-orm";
import { getDb } from "@/db";
import { bitacora_categories, bitacora_entries, expense_groups, expense_shares, expenses, group_members } from "@/db/schema";
import { BITACORA_CURRENCIES, DEFAULT_CATEGORIES, GROUP_CATEGORY_MAP, isPaymentMethod, monthRange, prevMonth, type PaymentMethodKey } from "./catalog";

// Bitácora (docs/faro-producto.md §2.g): finanzas personales, siempre
// privadas. Toda función recibe el id del usuario de la sesión y filtra por
// él: nadie más ve ni toca estos registros. Los gastos de grupos cuentan como
// "mi parte" (se calculan de expense_shares, no se copian: no hay duplicados).

export class BitacoraError extends Error {}

const UUID = /^[0-9a-f-]{36}$/i;
const db = () => getDb();

export async function ensureCategories(userId: string) {
  const rows = await db().select({ id: bitacora_categories.id }).from(bitacora_categories).where(eq(bitacora_categories.user_id, userId)).limit(1);
  if (rows.length) return;
  await db()
    .insert(bitacora_categories)
    .values(DEFAULT_CATEGORIES.map((c, i) => ({ user_id: userId, key: c.key, name: c.name, kind: c.kind, position: i })))
    .onConflictDoNothing();
}

export async function listCategories(userId: string, includeArchived = false) {
  await ensureCategories(userId);
  return db()
    .select()
    .from(bitacora_categories)
    .where(and(eq(bitacora_categories.user_id, userId), includeArchived ? undefined : eq(bitacora_categories.archived, false)))
    .orderBy(asc(bitacora_categories.position), asc(bitacora_categories.name));
}

async function ownCategory(userId: string, id: string | null | undefined) {
  if (!id) return null;
  if (!UUID.test(id)) throw new BitacoraError("Categoría inválida.");
  const [c] = await db().select().from(bitacora_categories).where(and(eq(bitacora_categories.id, id), eq(bitacora_categories.user_id, userId)));
  if (!c) throw new BitacoraError("Esa categoría no es tuya.");
  return c;
}

/** Categoría por clave o nombre (la usa el Copiloto) */
export async function categoryByHint(userId: string, hint: string | null | undefined, kind: "gasto" | "ingreso") {
  const cats = await listCategories(userId);
  const n = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const h = n(hint ?? "");
  return (
    (h && cats.find((c) => c.key === h || n(c.name) === h || n(c.name).includes(h) || h.includes(n(c.name).split(" ")[0]))) ||
    cats.find((c) => c.key === (kind === "ingreso" ? "ingresos" : "otros")) ||
    cats[0]
  );
}

export interface EntryInput {
  kind: "gasto" | "ingreso";
  amount: number;
  currency?: string;
  date: string;
  categoryId?: string | null;
  description: string;
  paymentMethod?: string | null;
  note?: string | null;
  source?: "manual" | "copiloto";
  copilotMessageId?: string | null;
}

function validate(i: EntryInput) {
  if (i.kind !== "gasto" && i.kind !== "ingreso") throw new BitacoraError("Elegí si es gasto o ingreso.");
  if (!Number.isInteger(i.amount) || i.amount <= 0 || i.amount > 1e13) throw new BitacoraError("Revisá el monto.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(i.date)) throw new BitacoraError("Revisá la fecha.");
  const desc = i.description.trim();
  if (desc.length < 1) throw new BitacoraError("Contá en qué fue (comercio o descripción).");
  const currency = BITACORA_CURRENCIES.includes((i.currency ?? "ARS") as never) ? (i.currency ?? "ARS") : "ARS";
  return { desc: desc.slice(0, 160), currency, method: isPaymentMethod(i.paymentMethod) ? (i.paymentMethod as PaymentMethodKey) : null };
}

export async function createEntry(userId: string, i: EntryInput) {
  const v = validate(i);
  const cat = await ownCategory(userId, i.categoryId ?? null);
  const [row] = await db()
    .insert(bitacora_entries)
    .values({
      user_id: userId,
      kind: i.kind,
      amount: i.amount,
      currency: v.currency,
      date: i.date,
      category_id: cat?.id ?? null,
      description: v.desc,
      payment_method: v.method,
      note: i.note?.trim().slice(0, 500) || null,
      source: i.source ?? "manual",
      copilot_message_id: i.copilotMessageId ?? null,
    })
    .returning();
  return row;
}

async function ownEntry(userId: string, id: string) {
  if (!UUID.test(id)) throw new BitacoraError("Movimiento inválido.");
  const [e] = await db().select().from(bitacora_entries).where(and(eq(bitacora_entries.id, id), eq(bitacora_entries.user_id, userId)));
  if (!e) throw new BitacoraError("Ese movimiento no es tuyo.");
  return e;
}

export const getEntry = ownEntry;

export async function updateEntry(userId: string, id: string, i: EntryInput) {
  await ownEntry(userId, id);
  const v = validate(i);
  const cat = await ownCategory(userId, i.categoryId ?? null);
  const [row] = await db()
    .update(bitacora_entries)
    .set({ kind: i.kind, amount: i.amount, currency: v.currency, date: i.date, category_id: cat?.id ?? null, description: v.desc, payment_method: v.method, note: i.note?.trim().slice(0, 500) || null })
    .where(and(eq(bitacora_entries.id, id), eq(bitacora_entries.user_id, userId)))
    .returning();
  return row;
}

/** Borrado suave (Deshacer) */
export async function deleteEntry(userId: string, id: string) {
  await ownEntry(userId, id);
  await db().update(bitacora_entries).set({ deleted_at: new Date() }).where(and(eq(bitacora_entries.id, id), eq(bitacora_entries.user_id, userId)));
}

export async function restoreEntry(userId: string, id: string) {
  await ownEntry(userId, id);
  await db().update(bitacora_entries).set({ deleted_at: null }).where(and(eq(bitacora_entries.id, id), eq(bitacora_entries.user_id, userId)));
}

// ── Categorías editables ─────────────────────────────────────────────

export async function saveCategory(userId: string, input: { id?: string | null; name: string; kind: "gasto" | "ingreso" }) {
  const name = input.name.trim().slice(0, 40);
  if (name.length < 2) throw new BitacoraError("El nombre tiene que tener al menos 2 letras.");
  const kind = input.kind === "ingreso" ? "ingreso" : "gasto";
  if (input.id) {
    await ownCategory(userId, input.id);
    await db().update(bitacora_categories).set({ name, kind }).where(and(eq(bitacora_categories.id, input.id), eq(bitacora_categories.user_id, userId)));
    return input.id;
  }
  const cats = await listCategories(userId, true);
  const [c] = await db().insert(bitacora_categories).values({ user_id: userId, name, kind, position: cats.length }).returning({ id: bitacora_categories.id });
  return c.id;
}

export async function archiveCategory(userId: string, id: string, archived: boolean) {
  await ownCategory(userId, id);
  await db().update(bitacora_categories).set({ archived }).where(and(eq(bitacora_categories.id, id), eq(bitacora_categories.user_id, userId)));
}

// ── Lectura: movimientos propios + mi parte de los grupos ────────────

export interface Movement {
  id: string;
  kind: "gasto" | "ingreso";
  amount: number;
  currency: string;
  date: string;
  description: string;
  categoryId: string | null;
  categoryName: string;
  paymentMethod: string | null;
  note: string | null;
  source: "manual" | "copiloto" | "grupo";
  group?: { id: string; name: string; total: number };
  copilotMessageId?: string | null;
}

/** Mi parte de cada gasto de mis grupos (como integrante con cuenta), entre dos fechas */
export async function groupShares(userId: string, from: string, to: string) {
  return db()
    .select({
      id: expenses.id,
      date: expenses.date,
      description: expenses.description,
      currency: expenses.currency,
      total: expenses.amount,
      category: expenses.category,
      share: expense_shares.amount,
      groupId: expense_groups.id,
      groupName: expense_groups.name,
    })
    .from(expense_shares)
    .innerJoin(group_members, eq(group_members.id, expense_shares.member_id))
    .innerJoin(expenses, eq(expenses.id, expense_shares.expense_id))
    .innerJoin(expense_groups, eq(expense_groups.id, expenses.group_id))
    .where(and(eq(group_members.user_id, userId), isNull(expenses.deleted_at), gte(expenses.date, from), lte(expenses.date, to)));
}

export async function movements(userId: string, month: string, categoryId?: string | null) {
  const { from, to } = monthRange(month);
  const [cats, own, shares] = await Promise.all([
    listCategories(userId, true),
    db()
      .select()
      .from(bitacora_entries)
      .where(and(eq(bitacora_entries.user_id, userId), isNull(bitacora_entries.deleted_at), gte(bitacora_entries.date, from), lte(bitacora_entries.date, to)))
      .orderBy(desc(bitacora_entries.date), desc(bitacora_entries.created_at)),
    groupShares(userId, from, to),
  ]);
  const byId = new Map(cats.map((c) => [c.id, c]));
  const byKey = new Map(cats.filter((c) => c.key).map((c) => [c.key!, c]));
  const list: Movement[] = [
    ...own.map((e) => ({
      id: e.id,
      kind: e.kind,
      amount: e.amount,
      currency: e.currency,
      date: e.date,
      description: e.description,
      categoryId: e.category_id,
      categoryName: (e.category_id && byId.get(e.category_id)?.name) || "Sin categoría",
      paymentMethod: e.payment_method,
      note: e.note,
      source: e.source === "copiloto" ? ("copiloto" as const) : ("manual" as const),
      copilotMessageId: e.copilot_message_id,
    })),
    ...shares
      .filter((s) => s.share > 0)
      .map((s) => {
        const cat = byKey.get(GROUP_CATEGORY_MAP[s.category] ?? "otros") ?? byKey.get("otros");
        return {
          id: `grupo:${s.id}`,
          kind: "gasto" as const,
          amount: s.share,
          currency: s.currency === "USD" ? "USD" : s.currency,
          date: s.date,
          description: s.description,
          categoryId: cat?.id ?? null,
          categoryName: cat?.name ?? "Otros",
          paymentMethod: null,
          note: null,
          source: "grupo" as const,
          group: { id: s.groupId, name: s.groupName, total: s.total },
        };
      }),
  ].sort((a, b) => b.date.localeCompare(a.date));
  return categoryId ? list.filter((m) => m.categoryId === categoryId) : list;
}

/** Tablero del mes (por moneda): entró, salió, queda, por categoría y comparación con el mes anterior */
export async function monthSummary(userId: string, month: string, categoryId?: string | null) {
  const [cur, prev] = await Promise.all([movements(userId, month, categoryId), movements(userId, prevMonth(month), categoryId)]);
  const totals = (list: Movement[], currency: string) => {
    const l = list.filter((m) => m.currency === currency);
    const inn = l.filter((m) => m.kind === "ingreso").reduce((s, m) => s + m.amount, 0);
    const out = l.filter((m) => m.kind === "gasto").reduce((s, m) => s + m.amount, 0);
    return { in: inn, out, left: inn - out };
  };
  const currencies = [...new Set(["ARS", ...cur.map((m) => m.currency)])];
  const byCategory = new Map<string, { name: string; amount: number; categoryId: string | null }>();
  for (const m of cur.filter((x) => x.kind === "gasto" && x.currency === "ARS")) {
    const k = m.categoryId ?? "none";
    const e = byCategory.get(k) ?? { name: m.categoryName, amount: 0, categoryId: m.categoryId };
    e.amount += m.amount;
    byCategory.set(k, e);
  }
  return {
    month,
    movements: cur,
    byCurrency: Object.fromEntries(currencies.map((c) => [c, { now: totals(cur, c), before: totals(prev, c) }])),
    byCategory: [...byCategory.values()].sort((a, b) => b.amount - a.amount),
  };
}

const csvCell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV del mes (o de los meses pedidos): fecha, tipo, monto, moneda, categoría, descripción, medio, nota, origen */
export async function exportCsv(userId: string, month: string, categoryId?: string | null) {
  const list = await movements(userId, month, categoryId);
  const rows = [
    ["fecha", "tipo", "monto", "moneda", "categoria", "descripcion", "medio_de_pago", "nota", "origen", "grupo"],
    ...list.map((m) => [m.date, m.kind, (m.amount / 100).toFixed(2), m.currency, m.categoryName, m.description, m.paymentMethod ?? "", m.note ?? "", m.source, m.group?.name ?? ""]),
  ];
  return `﻿${rows.map((r) => r.map(csvCell).join(",")).join("\n")}\n`;
}

/** Totales rápidos (los usa el Copiloto: "¿cuánto gasté en delivery este mes?") */
export async function spentInCategory(userId: string, month: string, categoryHint?: string | null) {
  const cat = categoryHint ? await categoryByHint(userId, categoryHint, "gasto") : null;
  const list = await movements(userId, month, cat?.id ?? null);
  const out = list.filter((m) => m.kind === "gasto" && m.currency === "ARS").reduce((s, m) => s + m.amount, 0);
  const inn = list.filter((m) => m.kind === "ingreso" && m.currency === "ARS").reduce((s, m) => s + m.amount, 0);
  return { category: cat?.name ?? null, spent: out, earned: inn, count: list.length };
}

