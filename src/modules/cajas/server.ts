import "server-only";
import { and, asc, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { bitacora_categories, bitacora_entries, box_entries, box_members, box_salaries, box_transfers, boxes, users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { monthRange, prevMonth } from "@/modules/bitacora/catalog";
import { todayAR } from "@/modules/gastos/constants";
import { BUSINESS_CATEGORIES, businessCategoryFor, categoriesFor, looksLikeBusiness, nextSalaryDate, SALARY_FREQUENCIES, suggestedSalary, type BoxKind, type SalaryFrequency } from "./catalog";

// Cajas del lado del servidor (principios §10, §11 y §17). Una sola cuenta por
// usuario y varias cajas: la personal (es la Bitácora: sus movimientos siguen
// en bitacora_entries), la de negocio y las compartidas. Toda función recibe
// el usuario de la sesión y valida que sea integrante activo de la caja: un
// ID que viene del navegador nunca alcanza. Entre cajas solo pasa plata con un
// movimiento explícito (sueldo del dueño o aporte), registrado en box_transfers.

export class CajaError extends Error {}

const UUID = /^[0-9a-f-]{36}$/i;
const db = () => getDb();
export type Box = typeof boxes.$inferSelect;
export type BoxEntry = typeof box_entries.$inferSelect;
type Me = { id: string; name?: string; email?: string | null; studioId?: string };

const studioOf = async (userId: string) => (await db().select({ s: users.studioId }).from(users).where(eq(users.id, userId)))[0]?.s ?? null;

/** La caja personal (la Bitácora) existe para todos: se crea al abrir Mis cajas */
export async function ensurePersonalBox(userId: string) {
  const [b] = await db().select().from(boxes).where(and(eq(boxes.owner_id, userId), eq(boxes.kind, "personal")));
  if (b) return b;
  const [row] = await db().insert(boxes).values({ kind: "personal", name: "Personal", owner_id: userId }).onConflictDoNothing().returning();
  if (row) {
    await db().insert(box_members).values({ box_id: row.id, user_id: userId, role: "titular" }).onConflictDoNothing();
    return row;
  }
  return (await db().select().from(boxes).where(and(eq(boxes.owner_id, userId), eq(boxes.kind, "personal"))))[0];
}

export async function businessBoxOf(userId: string) {
  const [b] = await db().select().from(boxes).where(and(eq(boxes.owner_id, userId), eq(boxes.kind, "negocio"), isNull(boxes.archived_at)));
  return b ?? null;
}

/** Abrir la caja de negocio (apenas hay una actividad, por chica que sea) */
export async function openBusinessBox(me: Me, name = "Mi negocio") {
  const existing = await businessBoxOf(me.id);
  if (existing) return existing;
  const [row] = await db()
    .insert(boxes)
    .values({ kind: "negocio", name: name.trim().slice(0, 60) || "Mi negocio", owner_id: me.id })
    .onConflictDoNothing()
    .returning();
  const box = row ?? (await businessBoxOf(me.id))!;
  await db().insert(box_members).values({ box_id: box.id, user_id: me.id, role: "titular" }).onConflictDoNothing();
  if (row) await audit({ studioId: me.studioId ?? (await studioOf(me.id)), actor: me, action: "caja.abrir_negocio", entityType: "caja", entityId: box.id });
  return box;
}

/** Caja a la que la persona pertenece (integrante activo); null si no */
export async function boxFor(userId: string, boxId: string | null | undefined) {
  if (!boxId || !UUID.test(boxId)) return null;
  const [r] = await db()
    .select({ box: boxes, role: box_members.role })
    .from(boxes)
    .innerJoin(box_members, and(eq(box_members.box_id, boxes.id), eq(box_members.user_id, userId), eq(box_members.status, "activo")))
    .where(and(eq(boxes.id, boxId), isNull(boxes.archived_at)));
  return r ?? null;
}

async function needBox(userId: string, boxId: string, kinds?: BoxKind[]) {
  const r = await boxFor(userId, boxId);
  if (!r) throw new CajaError("No encontramos esa caja.");
  if (kinds && !kinds.includes(r.box.kind)) throw new CajaError("Eso no se puede hacer en esta caja.");
  return r;
}

/** Mis cajas: todas las cajas de la persona, con su gente */
export async function myBoxes(userId: string) {
  await ensurePersonalBox(userId);
  const rows = await db()
    .select({ box: boxes, role: box_members.role })
    .from(box_members)
    .innerJoin(boxes, eq(boxes.id, box_members.box_id))
    .where(and(eq(box_members.user_id, userId), eq(box_members.status, "activo"), isNull(boxes.archived_at)))
    .orderBy(asc(boxes.created_at));
  const ids = rows.map((r) => r.box.id);
  const members = ids.length
    ? await db()
        .select({ boxId: box_members.box_id, userId: users.id, name: users.name })
        .from(box_members)
        .innerJoin(users, eq(users.id, box_members.user_id))
        .where(and(inArray(box_members.box_id, ids), eq(box_members.status, "activo")))
    : [];
  const order: Record<BoxKind, number> = { personal: 0, negocio: 1, compartida: 2 };
  return rows
    .map((r) => ({ ...r.box, role: r.role, members: members.filter((m) => m.boxId === r.box.id) }))
    .sort((a, b) => order[a.kind] - order[b.kind] || a.created_at.getTime() - b.created_at.getTime());
}

// ── Movimientos de la caja de negocio ────────────────────────────────

export interface BoxEntryInput {
  kind: "gasto" | "ingreso";
  amount: number;
  currency?: string;
  date: string;
  category: string;
  description: string;
  note?: string | null;
  invoiced?: boolean;
  deductible?: boolean;
  source?: "manual" | "vigia";
  copilotMessageId?: string | null;
}

function validate(box: Box, i: BoxEntryInput) {
  if (i.kind !== "gasto" && i.kind !== "ingreso") throw new CajaError("Elegí si es gasto o ingreso.");
  if (!Number.isInteger(i.amount) || i.amount <= 0 || i.amount > 1e13) throw new CajaError("Revisá el monto.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(i.date)) throw new CajaError("Revisá la fecha.");
  const description = i.description.trim().slice(0, 160);
  if (!description) throw new CajaError("Contá en qué fue.");
  const cats = categoriesFor(box.kind, box.purpose);
  const category = cats.some((c) => c.key === i.category) ? i.category : i.kind === "ingreso" ? (cats.find((c) => c.kind === "ingreso")?.key ?? "otros") : "otros";
  return { description, category, currency: i.currency === "USD" ? "USD" : "ARS" };
}

/** Cargar un gasto o ingreso en la caja de negocio */
export async function addBusinessEntry(me: Me, boxId: string, i: BoxEntryInput) {
  const { box } = await needBox(me.id, boxId, ["negocio"]);
  const v = validate(box, i);
  const [row] = await db()
    .insert(box_entries)
    .values({
      box_id: box.id,
      created_by: me.id,
      paid_by: me.id,
      kind: i.kind,
      amount: i.amount,
      currency: v.currency,
      date: i.date,
      category: v.category,
      description: v.description,
      note: i.note?.trim().slice(0, 500) || null,
      invoiced: i.kind === "ingreso" ? !!i.invoiced : false,
      deductible: i.kind === "gasto" ? !!i.deductible : false,
      source: i.source ?? "manual",
      copilot_message_id: i.copilotMessageId ?? null,
    })
    .returning();
  return row;
}

async function ownBoxEntry(me: Me, boxId: string, entryId: string) {
  if (!UUID.test(entryId)) throw new CajaError("Movimiento inválido.");
  await needBox(me.id, boxId);
  const [e] = await db().select().from(box_entries).where(and(eq(box_entries.id, entryId), eq(box_entries.box_id, boxId)));
  if (!e) throw new CajaError("No encontramos ese movimiento.");
  return e;
}

/** Borrar un movimiento de la caja (borrado suave). Un sueldo o aporte se borra entero, de los dos lados */
export async function deleteBoxEntry(me: Me, boxId: string, entryId: string) {
  const e = await ownBoxEntry(me, boxId, entryId);
  if (e.created_by !== me.id && e.paid_by !== me.id) throw new CajaError("Solo quien lo cargó puede borrarlo.");
  if (e.transfer_id) return deleteTransfer(me, e.transfer_id);
  await db().update(box_entries).set({ deleted_at: new Date() }).where(eq(box_entries.id, e.id));
  if (e.personal_entry_id) await db().update(bitacora_entries).set({ deleted_at: new Date() }).where(and(eq(bitacora_entries.id, e.personal_entry_id), eq(bitacora_entries.user_id, me.id)));
}

export async function restoreBoxEntry(me: Me, boxId: string, entryId: string) {
  const e = await ownBoxEntry(me, boxId, entryId);
  if (e.created_by !== me.id) throw new CajaError("Solo quien lo cargó puede restaurarlo.");
  await db().update(box_entries).set({ deleted_at: null }).where(eq(box_entries.id, e.id));
}

/** Movimientos de un mes de una caja (solo para integrantes) */
export async function boxEntries(me: Me, boxId: string, month: string) {
  const { box } = await needBox(me.id, boxId);
  const { from, to } = monthRange(month);
  const rows = await db()
    .select({ e: box_entries, by: users.name })
    .from(box_entries)
    .leftJoin(users, eq(users.id, box_entries.paid_by))
    .where(and(eq(box_entries.box_id, box.id), isNull(box_entries.deleted_at), gte(box_entries.date, from), lte(box_entries.date, to)))
    .orderBy(desc(box_entries.date), desc(box_entries.created_at));
  return rows.map((r) => ({ ...r.e, paidByName: r.by }));
}

/** Resumen de la caja de negocio de un mes: lo que entró y salió por la actividad, el sueldo y los aportes */
export async function businessSummary(me: Me, boxId: string, month: string) {
  const { box } = await needBox(me.id, boxId, ["negocio"]);
  const { from, to } = monthRange(month);
  const rows = await db()
    .select({ kind: box_entries.kind, invoiced: box_entries.invoiced, total: sql<string>`coalesce(sum(${box_entries.amount}), 0)` })
    .from(box_entries)
    .where(and(eq(box_entries.box_id, box.id), isNull(box_entries.deleted_at), eq(box_entries.currency, "ARS"), gte(box_entries.date, from), lte(box_entries.date, to)))
    .groupBy(box_entries.kind, box_entries.invoiced);
  const sum = (k: string, f?: (r: (typeof rows)[number]) => boolean) => rows.filter((r) => r.kind === k && (!f || f(r))).reduce((s, r) => s + Number(r.total), 0);
  const income = sum("ingreso");
  const expenses = sum("gasto");
  return { income, uninvoiced: sum("ingreso", (r) => !r.invoiced), expenses, result: income - expenses, salary: sum("retiro"), contributions: sum("aporte"), left: income - expenses - sum("retiro") + sum("aporte") };
}

/** Resultado (ingresos − gastos) de los últimos meses, para sugerir un sueldo como dato */
export async function salarySuggestion(me: Me, boxId: string, months = 3) {
  const out: number[] = [];
  let m = prevMonth(todayAR().slice(0, 7));
  for (let i = 0; i < months; i++) {
    const s = await businessSummary(me, boxId, m);
    if (s.income || s.expenses) out.push(s.result);
    m = prevMonth(m);
  }
  return suggestedSalary(out);
}

// ── Mover de la caja personal a la de negocio ────────────────────────

/**
 * Un gasto cargado en lo personal que es del negocio pasa a la caja de
 * negocio (§10): no se duplica, queda el registro original y el de la
 * Bitácora se borra vinculado al nuevo.
 */
export async function moveToBusiness(me: Me, bitacoraEntryId: string) {
  if (!UUID.test(bitacoraEntryId)) throw new CajaError("Movimiento inválido.");
  const [e] = await db().select().from(bitacora_entries).where(and(eq(bitacora_entries.id, bitacoraEntryId), eq(bitacora_entries.user_id, me.id)));
  if (!e || e.deleted_at) throw new CajaError("Ese movimiento no es tuyo o ya no está en tu caja personal.");
  if (e.transfer_id || e.box_entry_id) throw new CajaError("Ese movimiento viene de otra caja: no se puede mover.");
  const box = await openBusinessBox(me);
  const [cat] = e.category_id ? await db().select({ key: bitacora_categories.key, name: bitacora_categories.name }).from(bitacora_categories).where(eq(bitacora_categories.id, e.category_id)) : [];
  const category = e.kind === "ingreso" ? "ventas" : cat?.key === "transporte" ? "transporte" : businessCategoryFor(e.description);
  const [row] = await db()
    .insert(box_entries)
    .values({ box_id: box.id, created_by: me.id, paid_by: me.id, kind: e.kind, amount: e.amount, currency: e.currency, date: e.date, category, description: e.description, note: e.note, deductible: e.deductible, source: "bitacora", origin_id: e.id, copilot_message_id: e.copilot_message_id, raw: { ...e, categoria_bitacora: cat?.name ?? null } })
    .returning();
  await db().update(bitacora_entries).set({ moved_to_box_entry_id: row.id, deleted_at: new Date() }).where(eq(bitacora_entries.id, e.id));
  await audit({ studioId: me.studioId ?? (await studioOf(me.id)), actor: me, action: "caja.mover_a_negocio", entityType: "movimiento", entityId: row.id, metadata: { desde: e.id, monto: e.amount / 100 } });
  return row;
}

/** Gastos personales recientes que parecen del negocio (licencias, oficina…): Faro sugiere moverlos */
export async function businessHints(userId: string, days = 120) {
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const rows = await db()
    .select()
    .from(bitacora_entries)
    .where(and(eq(bitacora_entries.user_id, userId), eq(bitacora_entries.kind, "gasto"), isNull(bitacora_entries.deleted_at), isNull(bitacora_entries.transfer_id), isNull(bitacora_entries.box_entry_id), eq(bitacora_entries.business_hint_dismissed, false), gte(bitacora_entries.date, since)))
    .orderBy(desc(bitacora_entries.date))
    .limit(300);
  return rows.map((e) => ({ entry: e, hint: looksLikeBusiness(e.description, e.note) })).filter((x): x is { entry: typeof x.entry; hint: string } => !!x.hint).slice(0, 10);
}

export async function dismissBusinessHint(userId: string, entryId: string) {
  if (!UUID.test(entryId)) return;
  await db().update(bitacora_entries).set({ business_hint_dismissed: true }).where(and(eq(bitacora_entries.id, entryId), eq(bitacora_entries.user_id, userId)));
}

// ── Movimientos explícitos entre cajas: sueldo del dueño y aportes ───

async function personalCategory(userId: string, key: "ingresos" | "otros") {
  const [c] = await db().select({ id: bitacora_categories.id }).from(bitacora_categories).where(and(eq(bitacora_categories.user_id, userId), eq(bitacora_categories.key, key)));
  return c?.id ?? null;
}

/**
 * El negocio le paga el sueldo a la persona (§11): el único movimiento del
 * negocio a lo personal. Queda como retiro en la caja de negocio y como
 * ingreso en la Bitácora, unidos por la transferencia.
 */
export async function paySalary(me: Me, boxId: string, input: { amount: number; date?: string; salaryId?: string | null; note?: string | null }) {
  const { box } = await needBox(me.id, boxId, ["negocio"]);
  if (box.owner_id !== me.id) throw new CajaError("Solo la persona dueña del negocio se paga el sueldo.");
  if (!Number.isInteger(input.amount) || input.amount <= 0) throw new CajaError("Revisá el monto del sueldo.");
  const date = input.date ?? todayAR();
  const [t] = await db().insert(box_transfers).values({ kind: "sueldo", user_id: me.id, from_box_id: box.id, to_box_id: null, amount: input.amount, date, salary_id: input.salaryId ?? null, note: input.note ?? null }).returning();
  await db().insert(box_entries).values({ box_id: box.id, created_by: me.id, paid_by: me.id, kind: "retiro", amount: input.amount, date, category: "sueldo", description: "Sueldo del dueño", source: "sueldo", transfer_id: t.id });
  await db().insert(bitacora_entries).values({ user_id: me.id, kind: "ingreso", amount: input.amount, date, category_id: await personalCategory(me.id, "ingresos"), description: `Sueldo de ${box.name}`, source: "caja", transfer_id: t.id });
  await audit({ studioId: me.studioId ?? (await studioOf(me.id)), actor: me, action: "caja.sueldo", entityType: "transferencia", entityId: t.id, metadata: { caja: box.id, monto: input.amount / 100, automatico: !!input.salaryId } });
  return t;
}

/** Aporte de la caja personal a otra caja (por ejemplo, poner plata en el negocio) */
export async function contribute(me: Me, boxId: string, input: { amount: number; date?: string; note?: string | null }) {
  const { box } = await needBox(me.id, boxId, ["negocio"]);
  if (!Number.isInteger(input.amount) || input.amount <= 0) throw new CajaError("Revisá el monto del aporte.");
  const date = input.date ?? todayAR();
  const [t] = await db().insert(box_transfers).values({ kind: "aporte", user_id: me.id, from_box_id: null, to_box_id: box.id, amount: input.amount, date, note: input.note ?? null }).returning();
  await db().insert(box_entries).values({ box_id: box.id, created_by: me.id, paid_by: me.id, kind: "aporte", amount: input.amount, date, category: "aporte", description: "Aporte de la caja personal", source: "aporte", transfer_id: t.id });
  await db().insert(bitacora_entries).values({ user_id: me.id, kind: "gasto", amount: input.amount, date, category_id: await personalCategory(me.id, "otros"), description: `Aporte a ${box.name}`, source: "caja", transfer_id: t.id });
  await audit({ studioId: me.studioId ?? (await studioOf(me.id)), actor: me, action: "caja.aporte", entityType: "transferencia", entityId: t.id, metadata: { caja: box.id, monto: input.amount / 100 } });
  return t;
}

/** Deshacer un sueldo o aporte: se borra de las dos cajas a la vez */
export async function deleteTransfer(me: Me, transferId: string) {
  if (!UUID.test(transferId)) throw new CajaError("Movimiento inválido.");
  const [t] = await db().select().from(box_transfers).where(and(eq(box_transfers.id, transferId), eq(box_transfers.user_id, me.id)));
  if (!t) throw new CajaError("No encontramos ese movimiento.");
  const now = new Date();
  await db().update(box_entries).set({ deleted_at: now }).where(eq(box_entries.transfer_id, t.id));
  await db().update(bitacora_entries).set({ deleted_at: now }).where(and(eq(bitacora_entries.transfer_id, t.id), eq(bitacora_entries.user_id, me.id)));
  await audit({ studioId: me.studioId ?? (await studioOf(me.id)), actor: me, action: "caja.transferencia_borrada", entityType: "transferencia", entityId: t.id, metadata: { tipo: t.kind, monto: t.amount / 100 } });
}

// ── Sueldo del dueño: monto y frecuencia ─────────────────────────────

export async function salaryOf(me: Me, boxId: string) {
  await needBox(me.id, boxId, ["negocio"]);
  const [s] = await db().select().from(box_salaries).where(eq(box_salaries.box_id, boxId));
  return s ?? null;
}

export async function setSalary(me: Me, boxId: string, input: { amount: number; frequency: string; nextDate: string; active: boolean }) {
  const { box } = await needBox(me.id, boxId, ["negocio"]);
  if (box.owner_id !== me.id) throw new CajaError("Solo la persona dueña del negocio configura su sueldo.");
  if (!Number.isInteger(input.amount) || input.amount <= 0) throw new CajaError("Revisá el monto del sueldo.");
  const frequency = (input.frequency in SALARY_FREQUENCIES ? input.frequency : "mensual") as SalaryFrequency;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.nextDate)) throw new CajaError("Revisá la fecha del próximo sueldo.");
  const values = { box_id: box.id, user_id: me.id, amount: input.amount, frequency, next_date: input.nextDate, active: input.active };
  await db().insert(box_salaries).values(values).onConflictDoUpdate({ target: box_salaries.box_id, set: values });
  await audit({ studioId: me.studioId ?? (await studioOf(me.id)), actor: me, action: "caja.sueldo_configurado", entityType: "caja", entityId: box.id, metadata: { monto: input.amount / 100, frecuencia: frequency, desde: input.nextDate, activo: input.active } });
}

/** Tarea periódica: registra los sueldos que vencieron (uno por fecha, nunca dos veces) */
export async function runSalaryJobs(today = todayAR()) {
  const due = await db().select().from(box_salaries).where(and(eq(box_salaries.active, true), lte(box_salaries.next_date, today)));
  let n = 0;
  for (const s of due) {
    const [u] = await db().select({ id: users.id, email: users.email, studioId: users.studioId, active: users.active }).from(users).where(eq(users.id, s.user_id));
    if (!u?.active) continue;
    // Se reserva la fecha antes de pagar: nunca dos sueldos por la misma fecha
    const next = nextSalaryDate(s.next_date, s.frequency as SalaryFrequency);
    const [claimed] = await db().update(box_salaries).set({ next_date: next }).where(and(eq(box_salaries.id, s.id), eq(box_salaries.next_date, s.next_date))).returning({ id: box_salaries.id });
    if (!claimed) continue;
    await paySalary({ id: u.id, email: u.email, studioId: u.studioId ?? undefined }, s.box_id, { amount: s.amount, date: s.next_date, salaryId: s.id }).catch((e) => console.error("[cajas] sueldo", (e as Error).message));
    n++;
  }
  return n;
}

export { BUSINESS_CATEGORIES };
