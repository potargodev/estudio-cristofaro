import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { bitacora_categories, bitacora_entries, bitacora_shares, box_entries, box_entry_shares, box_goals, box_members, boxes, users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { getSiteUrl } from "@/lib/runtime-config";
import { SplitError, splitExpense } from "@/modules/gastos/core/split";
import { todayAR } from "@/modules/gastos/constants";
import { notify } from "@/modules/notifications/server";
import { categoriesFor, templateOf } from "./catalog";
import { breakdown, type LedgerEntry } from "./ledger";
import { boxFor, CajaError } from "./server";

// Cajas compartidas: el registro compartido (principios §16 y §18). No es un
// grupo de gastos: llevar la cuenta juntos. Cada integrante carga lo que gasta
// y lo que ahorra, con dos finales que elige quien paga: «solo registrar»
// (queda que puso ese monto, sin deuda) o «dividir» (la lógica de Grupos de
// gastos: quién le debe a quién). Una carga, uno o más destinos: la misma
// carga puede quedar también en la caja personal. Nada cuenta en el
// seguimiento de una persona hasta que ella confirma que lo pagó. Solo los
// integrantes ven la caja: todo se valida con boxFor().

const UUID = /^[0-9a-f-]{36}$/i;
const db = () => getDb();
const MAX_MEMBERS = 30;
type Me = { id: string; name?: string; email?: string | null; studioId?: string };
const studioOf = async (userId: string) => (await db().select({ s: users.studioId }).from(users).where(eq(users.id, userId)))[0]?.s ?? null;

async function needShared(userId: string, boxId: string) {
  const r = await boxFor(userId, boxId);
  if (!r || r.box.kind !== "compartida") throw new CajaError("No encontramos esa caja.");
  return r;
}

/** Elegir una opción ya armada: sin configurar ni ponerle nombre */
export async function createSharedBox(me: Me, purpose: string) {
  const t = templateOf(purpose);
  if (!t) throw new CajaError("Elegí una de las opciones.");
  const [box] = await db().insert(boxes).values({ kind: "compartida", purpose: t.purpose, name: t.name, owner_id: me.id }).returning();
  await db().insert(box_members).values({ box_id: box.id, user_id: me.id, role: "titular" });
  await audit({ studioId: me.studioId ?? (await studioOf(me.id)), actor: me, action: "caja.compartida_crear", entityType: "caja", entityId: box.id, metadata: { para: t.purpose } });
  return box;
}

export async function activeMembers(boxId: string) {
  return db()
    .select({ id: users.id, name: users.name, role: box_members.role, joinedAt: box_members.joined_at })
    .from(box_members)
    .innerJoin(users, eq(users.id, box_members.user_id))
    .where(and(eq(box_members.box_id, boxId), eq(box_members.status, "activo")))
    .orderBy(asc(box_members.joined_at));
}

// ── Invitación por link o WhatsApp (para entrar hay que tener cuenta) ──

function inviteToken(boxId: string, at: Date) {
  const secret = process.env.BETTER_AUTH_SECRET || process.env.ENCRYPTION_KEY;
  if (!secret) throw new CajaError("Falta configurar el secreto del servidor.");
  return createHmac("sha256", secret).update(`caja-invitacion:${boxId}:${at.toISOString()}`).digest("base64url");
}
const hashOf = (token: string) => createHmac("sha256", "faro-caja").update(token).digest("base64url");

/** Enlace para sumarse (uno por caja; renovarlo invalida el anterior) */
export async function boxInviteLink(me: Me, boxId: string, renew = false) {
  const { box } = await needShared(me.id, boxId);
  let at = box.invite_created_at;
  if (!at || renew || !box.invite_token_hash) {
    at = new Date();
    await db().update(boxes).set({ invite_created_at: at, invite_token_hash: hashOf(`${box.id}.${inviteToken(box.id, at)}`) }).where(eq(boxes.id, box.id));
    await audit({ studioId: me.studioId ?? (await studioOf(me.id)), actor: me, action: renew ? "caja.enlace_renovado" : "caja.enlace", entityType: "caja", entityId: box.id });
  }
  return `${getSiteUrl()}/caja/${box.id}.${inviteToken(box.id, at)}`;
}

/** Caja de un enlace de invitación (solo lo necesario para decidir sumarse) */
export async function boxByInvite(token: string) {
  const [id, sig] = token.split(".");
  if (!id || !sig || !UUID.test(id)) return null;
  const [box] = await db().select().from(boxes).where(and(eq(boxes.id, id), eq(boxes.kind, "compartida"), isNull(boxes.archived_at)));
  if (!box?.invite_token_hash) return null;
  const a = Buffer.from(hashOf(token));
  const b = Buffer.from(box.invite_token_hash);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const [owner] = await db().select({ name: users.name }).from(users).where(eq(users.id, box.owner_id));
  const [{ n }] = await db().select({ n: sql<number>`count(*)::int` }).from(box_members).where(and(eq(box_members.box_id, box.id), eq(box_members.status, "activo")));
  return { box, inviter: owner?.name ?? null, members: n };
}

export async function joinBox(me: Me, token: string) {
  const inv = await boxByInvite(token);
  if (!inv) throw new CajaError("Ese enlace ya no sirve. Pedí uno nuevo.");
  if (inv.members >= MAX_MEMBERS) throw new CajaError("La caja ya tiene el máximo de integrantes.");
  await db()
    .insert(box_members)
    .values({ box_id: inv.box.id, user_id: me.id, role: "integrante" })
    .onConflictDoUpdate({ target: [box_members.box_id, box_members.user_id], set: { status: "activo", left_at: null, joined_at: new Date() } });
  await audit({ studioId: me.studioId ?? (await studioOf(me.id)), actor: me, action: "caja.unirse", entityType: "caja", entityId: inv.box.id });
  const others = (await activeMembers(inv.box.id)).filter((m) => m.id !== me.id).map((m) => m.id);
  await notify(others, { kind: "grupo", title: `${me.name ?? "Alguien"} se sumó a la caja ${inv.box.name}`, href: `/cajas/${inv.box.id}`, refId: inv.box.id }).catch(() => undefined);
  return inv.box;
}

/** Salir de la caja: no se puede con deudas pendientes (como en Grupos de gastos) */
export async function leaveBox(me: Me, boxId: string) {
  const { box } = await needShared(me.id, boxId);
  const b = await sharedBreakdown(me, box.id);
  const mine = b.members.find((m) => m.userId === me.id);
  if (mine && (mine.owes > 0 || mine.owed > 0)) throw new CajaError("Antes de salir tienen que quedar a mano: hay partes de gastos divididos sin pagar.");
  await db().update(box_members).set({ status: "salio", left_at: new Date() }).where(and(eq(box_members.box_id, box.id), eq(box_members.user_id, me.id)));
  await audit({ studioId: me.studioId ?? (await studioOf(me.id)), actor: me, action: "caja.salir", entityType: "caja", entityId: box.id });
}

// ── Cargar: una carga, uno o más destinos, dos finales ──────────────

interface SharedEntryInput {
  kind: "gasto" | "ahorro" | "ingreso";
  amount: number;
  date?: string;
  category?: string;
  description: string;
  note?: string | null;
  /** Quién pagó (un integrante); por defecto, quien carga */
  paidBy?: string | null;
  mode: "registrar" | "dividir";
  /** Para dividir: entre quiénes (integrantes); por defecto, todos */
  splitWith?: string[];
  /** También en la caja personal de quien pagó (solo si es quien carga) */
  alsoPersonal?: boolean;
  /** Categoría de la Bitácora para la carga personal (si no, «Otros») */
  personalCategoryId?: string | null;
  goalId?: string | null;
  source?: "manual" | "vigia" | "bitacora";
  copilotMessageId?: string | null;
}

export async function addSharedEntry(me: Me, boxId: string, i: SharedEntryInput) {
  const { box } = await needShared(me.id, boxId);
  const members = await activeMembers(box.id);
  const ids = new Set(members.map((m) => m.id));
  if (!["gasto", "ahorro", "ingreso"].includes(i.kind)) throw new CajaError("Elegí si es un gasto o un ahorro.");
  if (i.kind === "ingreso" && box.purpose !== "negocio") throw new CajaError("En esta caja se cargan gastos y ahorros.");
  if (!Number.isInteger(i.amount) || i.amount <= 0 || i.amount > 1e13) throw new CajaError("Revisá el monto.");
  const date = i.date ?? todayAR();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new CajaError("Revisá la fecha.");
  const description = i.description.trim().slice(0, 160);
  if (!description) throw new CajaError("Contá en qué fue.");
  const paidBy = i.paidBy || me.id;
  if (!ids.has(paidBy)) throw new CajaError("Quien pagó tiene que ser de la caja.");
  const mode = i.mode === "dividir" && i.kind === "gasto" ? "dividir" : "registrar";
  const cats = categoriesFor("compartida", box.purpose);
  const category = i.kind === "ahorro" ? "ahorro" : cats.some((c) => c.key === i.category && c.kind === i.kind) ? i.category! : (cats.find((c) => c.kind === i.kind)?.key ?? "otros");
  let goalId: string | null = null;
  if (i.goalId) {
    const [g] = UUID.test(i.goalId) ? await db().select({ id: box_goals.id }).from(box_goals).where(and(eq(box_goals.id, i.goalId), eq(box_goals.box_id, box.id))) : [];
    if (!g) throw new CajaError("Esa meta no es de esta caja.");
    goalId = g.id;
  }
  let shares: Record<string, number> = {};
  if (mode === "dividir") {
    const among = [...new Set((i.splitWith?.length ? i.splitWith : [...ids]).filter((x) => ids.has(x)))];
    if (!among.some((x) => x !== paidBy)) throw new CajaError("Para dividir hace falta al menos otra persona en la caja. Invitala con el enlace.");
    try {
      shares = splitExpense(i.amount, { method: "iguales", members: among });
    } catch (e) {
      if (e instanceof SplitError) throw new CajaError(e.message);
      throw e;
    }
  }
  // Lo que carga quien pagó queda confirmado; si lo carga otra persona, queda pendiente hasta que confirme
  const confirmed = paidBy === me.id;
  const [row] = await db()
    .insert(box_entries)
    .values({ box_id: box.id, created_by: me.id, paid_by: paidBy, kind: i.kind, amount: i.amount, date, category, description, note: i.note?.trim().slice(0, 500) || null, mode, status: confirmed ? "confirmado" : "pendiente", confirmed_at: confirmed ? new Date() : null, goal_id: goalId, source: i.source ?? "manual", copilot_message_id: i.copilotMessageId ?? null })
    .returning();
  if (mode === "dividir") await db().insert(box_entry_shares).values(Object.entries(shares).map(([userId, amount]) => ({ entry_id: row.id, user_id: userId, amount, paid_at: userId === paidBy ? new Date() : null })));
  // Una carga, varios destinos: también en la caja personal de quien pagó (su parte si se divide)
  let personalId: string | null = null;
  if (i.alsoPersonal && paidBy === me.id && i.kind !== "ingreso") {
    const mine = mode === "dividir" ? (shares[me.id] ?? 0) : i.amount;
    if (mine > 0) {
      const [own] = i.personalCategoryId && UUID.test(i.personalCategoryId) ? await db().select({ id: bitacora_categories.id }).from(bitacora_categories).where(and(eq(bitacora_categories.id, i.personalCategoryId), eq(bitacora_categories.user_id, me.id))) : [];
      const [cat] = own ? [own] : await db().select({ id: bitacora_categories.id }).from(bitacora_categories).where(and(eq(bitacora_categories.user_id, me.id), eq(bitacora_categories.key, "otros")));
      const [p] = await db()
        .insert(bitacora_entries)
        .values({ user_id: me.id, kind: "gasto", amount: mine, date, category_id: cat?.id ?? null, description: i.kind === "ahorro" ? `Ahorro en ${box.name}: ${description}` : description, note: `En la caja ${box.name}${mode === "dividir" ? " (tu parte)" : ""}`, source: i.source === "vigia" ? "copiloto" : "caja", box_entry_id: row.id, copilot_message_id: i.copilotMessageId ?? null })
        .returning({ id: bitacora_entries.id });
      personalId = p.id;
      await db().update(box_entries).set({ personal_entry_id: p.id }).where(eq(box_entries.id, row.id));
    }
  }
  await audit({ studioId: me.studioId ?? (await studioOf(me.id)), actor: me, action: "caja.compartida_cargar", entityType: "movimiento", entityId: row.id, metadata: { caja: box.id, monto: i.amount / 100, final: mode, pago: paidBy === me.id ? "yo" : "otro", personal: !!personalId } });
  const others = members.filter((m) => m.id !== me.id).map((m) => m.id);
  const who = me.name ?? "Alguien";
  if (!confirmed) await notify([paidBy], { kind: "gasto", title: `${who} cargó que pagaste ${description}`, body: "Confirmalo para que cuente en tu seguimiento.", href: `/cajas/${box.id}`, refId: row.id }).catch(() => undefined);
  else if (mode === "dividir") await notify(Object.keys(shares).filter((u) => u !== paidBy), { kind: "gasto", title: `${who} dividió ${description}`, body: "Cuando le pases tu parte, confirmalo en la caja.", href: `/cajas/${box.id}`, refId: row.id }).catch(() => undefined);
  else await notify(others, { kind: "gasto", title: `${who} cargó ${description} en ${box.name}`, href: `/cajas/${box.id}`, refId: row.id }).catch(() => undefined);
  return { ...row, personalEntryId: personalId };
}

async function entryOf(boxId: string, entryId: string) {
  if (!UUID.test(entryId)) throw new CajaError("Movimiento inválido.");
  const [e] = await db().select().from(box_entries).where(and(eq(box_entries.id, entryId), eq(box_entries.box_id, boxId), isNull(box_entries.deleted_at)));
  if (!e) throw new CajaError("No encontramos ese movimiento.");
  return e;
}

/** Quien pagó confirma lo que cargó otra persona a su nombre: recién ahí cuenta */
export async function confirmEntry(me: Me, boxId: string, entryId: string) {
  const { box } = await needShared(me.id, boxId);
  const e = await entryOf(box.id, entryId);
  if (e.paid_by !== me.id) throw new CajaError("Solo quien pagó puede confirmarlo.");
  if (e.status === "confirmado") return;
  await db().update(box_entries).set({ status: "confirmado", confirmed_at: new Date() }).where(eq(box_entries.id, e.id));
  await audit({ studioId: me.studioId ?? (await studioOf(me.id)), actor: me, action: "caja.confirmar_pago", entityType: "movimiento", entityId: e.id, metadata: { caja: box.id } });
}

/** Quien debe su parte de un gasto dividido confirma que ya la pagó */
export async function confirmSharePaid(me: Me, boxId: string, entryId: string) {
  const { box } = await needShared(me.id, boxId);
  const e = await entryOf(box.id, entryId);
  const [s] = await db().select().from(box_entry_shares).where(and(eq(box_entry_shares.entry_id, e.id), eq(box_entry_shares.user_id, me.id)));
  if (!s) throw new CajaError("No tenés una parte en ese gasto.");
  if (s.paid_at) return;
  await db().update(box_entry_shares).set({ paid_at: new Date() }).where(eq(box_entry_shares.id, s.id));
  await audit({ studioId: me.studioId ?? (await studioOf(me.id)), actor: me, action: "caja.confirmar_parte", entityType: "movimiento", entityId: e.id, metadata: { caja: box.id, monto: s.amount / 100 } });
  if (e.paid_by) await notify([e.paid_by], { kind: "pago", title: `${me.name ?? "Alguien"} te pasó su parte de ${e.description}`, href: `/cajas/${box.id}`, refId: e.id }).catch(() => undefined);
}

export async function deleteSharedEntry(me: Me, boxId: string, entryId: string) {
  const { box } = await needShared(me.id, boxId);
  const e = await entryOf(box.id, entryId);
  if (e.created_by !== me.id) throw new CajaError("Solo quien lo cargó puede borrarlo.");
  await db().update(box_entries).set({ deleted_at: new Date() }).where(eq(box_entries.id, e.id));
  if (e.personal_entry_id) await db().update(bitacora_entries).set({ deleted_at: new Date() }).where(and(eq(bitacora_entries.id, e.personal_entry_id), eq(bitacora_entries.user_id, me.id)));
  await audit({ studioId: me.studioId ?? (await studioOf(me.id)), actor: me, action: "caja.compartida_borrar", entityType: "movimiento", entityId: e.id, metadata: { caja: box.id } });
}

// ── Metas de ahorro dentro de la caja ───────────────────────────────

export async function createGoal(me: Me, boxId: string, name: string, target: number) {
  const { box } = await needShared(me.id, boxId);
  const n = name.trim().slice(0, 80);
  if (n.length < 2) throw new CajaError("Poné un nombre a la meta.");
  if (!Number.isInteger(target) || target <= 0) throw new CajaError("Revisá el objetivo.");
  const [g] = await db().insert(box_goals).values({ box_id: box.id, name: n, target, created_by: me.id }).returning();
  await audit({ studioId: me.studioId ?? (await studioOf(me.id)), actor: me, action: "caja.meta", entityType: "meta", entityId: g.id, metadata: { caja: box.id, objetivo: target / 100 } });
  return g;
}

// ── Lectura: movimientos y desglose ─────────────────────────────────

export async function sharedEntries(me: Me, boxId: string, limit = 100) {
  const { box } = await needShared(me.id, boxId);
  const rows = await db().select().from(box_entries).where(and(eq(box_entries.box_id, box.id), isNull(box_entries.deleted_at))).orderBy(desc(box_entries.date), desc(box_entries.created_at)).limit(limit);
  const shares = rows.length ? await db().select().from(box_entry_shares).where(inArray(box_entry_shares.entry_id, rows.map((r) => r.id))) : [];
  return rows.map((r) => ({ ...r, shares: shares.filter((s) => s.entry_id === r.id) }));
}

/** Desglose de la caja: quién se hizo cargo de qué, cuánto y cuándo, deudas, categorías, metas y si están parejos */
export async function sharedBreakdown(me: Me, boxId: string) {
  const { box } = await needShared(me.id, boxId);
  const [members, rows, goals] = await Promise.all([
    activeMembers(box.id),
    db().select().from(box_entries).where(and(eq(box_entries.box_id, box.id), isNull(box_entries.deleted_at))),
    db().select().from(box_goals).where(and(eq(box_goals.box_id, box.id), isNull(box_goals.archived_at))).orderBy(asc(box_goals.created_at)),
  ]);
  const shares = rows.length ? await db().select().from(box_entry_shares).where(inArray(box_entry_shares.entry_id, rows.map((r) => r.id))) : [];
  const ledger: LedgerEntry[] = rows.map((r) => ({ id: r.id, kind: r.kind, amount: r.amount, paidBy: r.paid_by ?? "", mode: r.mode === "dividir" ? "dividir" : "registrar", confirmed: r.status === "confirmado", shares: shares.filter((s) => s.entry_id === r.id).map((s) => ({ userId: s.user_id, amount: s.amount, paid: !!s.paid_at })) }));
  const b = breakdown(ledger, members.map((m) => m.id));
  const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? "Alguien que ya no está";
  const confirmedRows = rows.filter((r) => r.status === "confirmado");
  const byCategory = categoriesFor("compartida", box.purpose)
    .map((c) => ({ key: c.key, name: c.name, amount: confirmedRows.filter((r) => r.category === c.key).reduce((s, r) => s + r.amount, 0) }))
    .filter((c) => c.amount > 0)
    .sort((x, y) => y.amount - x.amount);
  const goalLines = goals.map((g) => {
    const saved = confirmedRows.filter((r) => r.goal_id === g.id).reduce((s, r) => s + r.amount, 0);
    const byMember = members.map((m) => ({ userId: m.id, name: m.name, amount: confirmedRows.filter((r) => r.goal_id === g.id && r.paid_by === m.id).reduce((s, r) => s + r.amount, 0) })).filter((x) => x.amount > 0);
    return { ...g, saved, pct: Math.min(100, Math.round((saved / g.target) * 100)), byMember };
  });
  return { box, ...b, members: b.members.map((m) => ({ ...m, name: nameOf(m.userId) })), debts: b.debts.map((d) => ({ ...d, fromName: nameOf(d.from), toName: nameOf(d.to) })), byCategory, goals: goalLines, people: members };
}

/** Las cajas compartidas de la persona (para elegir destino al cargar en la Bitácora o desde el Vigía) */
export async function mySharedBoxes(userId: string) {
  return db()
    .select({ id: boxes.id, name: boxes.name, purpose: boxes.purpose })
    .from(box_members)
    .innerJoin(boxes, eq(boxes.id, box_members.box_id))
    .where(and(eq(box_members.user_id, userId), eq(box_members.status, "activo"), eq(boxes.kind, "compartida"), isNull(boxes.archived_at)))
    .orderBy(asc(boxes.created_at));
}

/**
 * Hogar → caja de pareja: crea la caja compartida con las dos personas de un
 * Hogar activo. No mueve nada: el Hogar (la Bitácora compartida) sigue igual,
 * porque esos movimientos son personales de quien comparte (ver decisiones).
 */
export async function pairBoxFromHogar(me: Me, shareId: string) {
  if (!UUID.test(shareId)) throw new CajaError("Hogar inválido.");
  const [sh] = await db().select().from(bitacora_shares).where(and(eq(bitacora_shares.id, shareId), eq(bitacora_shares.owner_id, me.id), eq(bitacora_shares.status, "activa")));
  if (!sh?.member_id) throw new CajaError("Ese Hogar no está activo.");
  const box = await createSharedBox(me, "pareja");
  await db().insert(box_members).values({ box_id: box.id, user_id: sh.member_id, role: "integrante" }).onConflictDoNothing();
  await audit({ studioId: me.studioId ?? (await studioOf(me.id)), actor: me, action: "caja.desde_hogar", entityType: "caja", entityId: box.id, metadata: { hogar: sh.id } });
  await notify([sh.member_id], { kind: "grupo", title: `${me.name ?? "Tu pareja"} armó una caja de pareja con vos`, href: `/cajas/${box.id}`, refId: box.id }).catch(() => undefined);
  return box;
}

