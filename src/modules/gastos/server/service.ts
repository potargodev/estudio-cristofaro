import "server-only";
import { and, asc, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  accounting_expenses,
  expense_comments,
  expense_groups,
  expense_payers,
  expense_shares,
  expenses,
  group_activity,
  group_members,
  memberships,
  organizations,
  partner_movements,
  settlements,
  users,
} from "@/db/schema";
import { audit } from "@/lib/audit";
import { esc, sendMail } from "@/lib/email";
import { hasModule } from "@/lib/faro/entitlements";
import { mailLayout } from "@/lib/notify";
import { can } from "@/lib/permissions";
import { isStudioRole } from "@/lib/roles";
import { getSiteUrl } from "@/lib/runtime-config";
import { checkUpload, storeUpload } from "@/lib/uploads";
import { CATEGORIES, CURRENCIES, GROUP_COLORS, GROUP_TYPES, REMINDER_FREQUENCIES, formatMoney, todayAR, type GroupType } from "../constants";
import { balancesInBase, computeBalances, directDebts, simplifyDebts, type LedgerExpense, type LedgerSettlement, type Transfer } from "../core/balances";
import { SplitError, checkPayers, splitExpense, type SplitSpec } from "../core/split";
import { auditActor, memberOf, newGuestToken, type GastosActor, type GroupRow, type MemberRow } from "./actor";
import { fxRate } from "./fx";
import { paymentLinks } from "./mercadopago";

/** Error para mostrar tal cual a la persona */
export class GastosError extends Error {}

const NOT_FOUND = "No encontramos ese grupo o no sos parte.";

async function need(actor: GastosActor, groupId: string) {
  const r = await memberOf(actor, groupId);
  if (!r) {
    await audit({ studioId: actor.studioId, ...auditActor(actor), action: "gastos.acceso_denegado", entityType: "grupo_gastos", entityId: /^[0-9a-f-]{36}$/i.test(groupId) ? groupId : null, result: "denegado" });
    throw new GastosError(NOT_FOUND);
  }
  if (r.group.archived_at) throw new GastosError("El grupo está archivado.");
  return r;
}

const userActor = (actor: GastosActor) => {
  if (actor.kind !== "user") throw new GastosError("Para esto necesitás una cuenta de Faro.");
  return actor;
};

async function log(groupId: string, memberId: string | null, kind: string, text: string, refs: { expenseId?: string; settlementId?: string } = {}) {
  await getDb()
    .insert(group_activity)
    .values({ group_id: groupId, member_id: memberId, kind, text, expense_id: refs.expenseId ?? null, settlement_id: refs.settlementId ?? null });
}

async function groupAudit(actor: GastosActor, group: GroupRow, action: string, entityType: string, entityId: string | null, metadata: Record<string, unknown> = {}) {
  await audit({ studioId: group.studio_id, organizationId: group.organization_id, ...auditActor(actor), action, entityType, entityId, metadata: { grupo: group.id, ...metadata } });
}

async function activeMembers(groupId: string) {
  return getDb()
    .select()
    .from(group_members)
    .where(and(eq(group_members.group_id, groupId), eq(group_members.active, true)))
    .orderBy(asc(group_members.created_at));
}

// ── Grupos ─────────────────────────────────────────────────────────────────

/** Organizaciones que el actor puede elegir como contexto contable de un grupo */
export async function contextOptions(actor: GastosActor): Promise<{ organizations: { id: string; name: string }[]; tenant: boolean }> {
  if (actor.kind !== "user") return { organizations: [], tenant: false };
  const db = getDb();
  if (isStudioRole(actor.role)) {
    const orgs = await db
      .select({ id: organizations.id, name: organizations.name })
      .from(organizations)
      .where(and(eq(organizations.studio_id, actor.studioId), ne(organizations.status, "baja")))
      .orderBy(asc(organizations.name));
    return { organizations: orgs, tenant: false };
  }
  if (actor.role === "cliente") {
    const rows = await db
      .select({ id: organizations.id, name: organizations.name, role: memberships.role })
      .from(memberships)
      .innerJoin(organizations, eq(organizations.id, memberships.organization_id))
      .where(and(eq(memberships.user_id, actor.userId), eq(memberships.status, "activa"), eq(organizations.studio_id, actor.studioId), ne(organizations.status, "baja")));
    // Solo quien gestiona las finanzas de la organización conecta un grupo a su contabilidad
    return { organizations: rows.filter((r) => can(r.role, "finanzas.gestionar")).map(({ id, name }) => ({ id, name })), tenant: false };
  }
  return { organizations: [], tenant: actor.role === "autonomo" };
}

export interface NewGroup {
  name: string;
  type: string;
  baseCurrency: string;
  color?: string;
  /** "" | "tenant" | id de organización */
  context?: string;
  simplify?: boolean;
}

export async function createGroup(actor: GastosActor, input: NewGroup) {
  const u = userActor(actor);
  if (!(await hasModule(u.studioId, "shared_expenses"))) throw new GastosError("Gastos compartidos no está incluido en tu plan.");
  const name = input.name.trim().slice(0, 80);
  if (name.length < 2) throw new GastosError("Ponele un nombre al grupo.");
  const type = (Object.keys(GROUP_TYPES).includes(input.type) ? input.type : "personal") as GroupType;
  const base = (CURRENCIES as readonly string[]).includes(input.baseCurrency) ? input.baseCurrency : "ARS";
  const color = (GROUP_COLORS as readonly string[]).includes(input.color ?? "") ? input.color! : GROUP_COLORS[0];
  let organizationId: string | null = null;
  let contextTenant = false;
  if (input.context) {
    const opts = await contextOptions(u);
    if (input.context === "tenant") {
      if (!opts.tenant) throw new GastosError("No podés conectar este grupo a esa contabilidad.");
      contextTenant = true;
    } else {
      if (!opts.organizations.some((o) => o.id === input.context)) {
        await audit({ studioId: u.studioId, ...auditActor(u), action: "gastos.acceso_denegado", entityType: "organizacion", entityId: /^[0-9a-f-]{36}$/i.test(input.context) ? input.context : null, result: "denegado" });
        throw new GastosError("No podés conectar este grupo a esa organización.");
      }
      organizationId = input.context;
    }
  }
  const db = getDb();
  const group = await db.transaction(async (tx) => {
    const [g] = await tx
      .insert(expense_groups)
      .values({ studio_id: u.studioId, name, type, base_currency: base, color, organization_id: organizationId, context_tenant: contextTenant, simplify_debts: input.simplify ?? true, created_by: u.userId })
      .returning();
    const [me] = await tx.insert(group_members).values({ group_id: g.id, user_id: u.userId, name: u.name || u.email, email: u.email, role: "admin" }).returning();
    await tx.insert(group_activity).values({ group_id: g.id, member_id: me.id, kind: "grupo", text: `${me.name} creó el grupo` });
    return g;
  });
  await groupAudit(u, group, "gastos.grupo_crear", "grupo_gastos", group.id, { tipo: type, contexto: organizationId ? "organizacion" : contextTenant ? "tenant" : null });
  return group;
}

export async function updateGroup(actor: GastosActor, groupId: string, input: { name?: string; simplify?: boolean; reminders?: string; color?: string }) {
  const { group, me } = await need(actor, groupId);
  if (me.role !== "admin") throw new GastosError("Solo quien administra el grupo puede cambiar su configuración.");
  const set: Partial<GroupRow> = {};
  if (input.name !== undefined) {
    const n = input.name.trim().slice(0, 80);
    if (n.length < 2) throw new GastosError("Ponele un nombre al grupo.");
    set.name = n;
  }
  if (input.simplify !== undefined) set.simplify_debts = input.simplify;
  if (input.reminders !== undefined && input.reminders in REMINDER_FREQUENCIES) set.reminder_frequency = input.reminders;
  if (input.color && (GROUP_COLORS as readonly string[]).includes(input.color)) set.color = input.color;
  await getDb().update(expense_groups).set(set).where(eq(expense_groups.id, group.id));
  await log(group.id, me.id, "grupo", `${me.name} cambió la configuración del grupo`);
  await groupAudit(actor, group, "gastos.grupo_editar", "grupo_gastos", group.id, { cambios: Object.keys(set) });
}

export async function archiveGroup(actor: GastosActor, groupId: string) {
  const { group, me } = await need(actor, groupId);
  if (me.role !== "admin") throw new GastosError("Solo quien administra el grupo puede archivarlo.");
  await getDb().update(expense_groups).set({ archived_at: new Date() }).where(eq(expense_groups.id, group.id));
  await groupAudit(actor, group, "gastos.grupo_archivar", "grupo_gastos", group.id);
}

// ── Integrantes ───────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function inviteMember(actor: GastosActor, groupId: string, input: { name: string; email?: string }) {
  const { group, me } = await need(actor, groupId);
  if (actor.kind !== "user") throw new GastosError("Las personas invitadas no pueden sumar integrantes.");
  const name = input.name.trim().slice(0, 80);
  const email = input.email?.trim().toLowerCase() || null;
  if (name.length < 2) throw new GastosError("Escribí el nombre de la persona.");
  if (email && !EMAIL_RE.test(email)) throw new GastosError("El email no es válido.");
  const db = getDb();
  const members = await activeMembers(group.id);
  if (members.length >= 50) throw new GastosError("El grupo llegó al máximo de 50 integrantes.");
  if (email && members.some((m) => m.email?.toLowerCase() === email)) throw new GastosError("Esa persona ya está en el grupo.");
  // Si tiene cuenta en este mismo tenant, se suma con su usuario; si no, como invitada con link mágico
  const [existing] = email ? await db.select({ id: users.id, name: users.name }).from(users).where(and(eq(users.email, email), eq(users.studioId, group.studio_id), eq(users.active, true))) : [];
  const token = existing ? null : newGuestToken();
  const [member] = await db
    .insert(group_members)
    .values({ group_id: group.id, user_id: existing?.id ?? null, name, email, role: "miembro", guest_token_hash: token?.hash ?? null, invited_by: me.id })
    .returning();
  const link = token ? `${getSiteUrl()}/gastos/invitado/${token.token}` : `${getSiteUrl()}/gastos/g/${group.id}`;
  let mailed = false;
  if (email)
    mailed = await sendMail({
      to: email,
      subject: `${me.name} te sumó a "${group.name}" en Faro`,
      html: mailLayout(
        `Te sumaron a ${group.name}`,
        `<p>${esc(me.name)} te sumó al grupo de gastos compartidos <strong>${esc(group.name)}</strong>. Ahí ves quién pagó qué y cuánto debe cada uno.</p>${token ? "<p>No necesitás crear una cuenta: el enlace es personal y solo abre este grupo.</p>" : ""}`,
        { href: link, label: "Ver el grupo" },
      ),
    });
  await log(group.id, me.id, "integrante", `${me.name} sumó a ${name}${token ? " como invitado" : ""}`);
  await groupAudit(actor, group, "gastos.integrante_invitar", "integrante_gastos", member.id, { invitado: !existing, email });
  return { member, link: token ? link : null, mailed };
}

/** Genera un link nuevo para un invitado (el anterior deja de valer) */
export async function renewGuestLink(actor: GastosActor, groupId: string, memberId: string) {
  const { group, me } = await need(actor, groupId);
  if (actor.kind !== "user") throw new GastosError("Las personas invitadas no pueden hacer esto.");
  const [m] = await getDb().select().from(group_members).where(and(eq(group_members.id, memberId), eq(group_members.group_id, group.id), eq(group_members.active, true)));
  if (!m || m.user_id) throw new GastosError("Esa persona no es una invitada del grupo.");
  const token = newGuestToken();
  await getDb().update(group_members).set({ guest_token_hash: token.hash }).where(eq(group_members.id, m.id));
  await groupAudit(actor, group, "gastos.integrante_link", "integrante_gastos", m.id, { por: me.id });
  return `${getSiteUrl()}/gastos/invitado/${token.token}`;
}

export async function updateMyMember(actor: GastosActor, groupId: string, input: { alias?: string; cvu?: string; optOut?: boolean; name?: string }) {
  const { group, me } = await need(actor, groupId);
  const set: Partial<MemberRow> = {};
  if (input.alias !== undefined) {
    const a = input.alias.trim();
    if (a && !/^[a-zA-Z0-9.\-]{6,20}$/.test(a)) throw new GastosError("El alias tiene que tener entre 6 y 20 caracteres (letras, números, puntos o guiones).");
    set.payment_alias = a || null;
  }
  if (input.cvu !== undefined) {
    const c = input.cvu.replace(/\D/g, "");
    if (c && c.length !== 22) throw new GastosError("El CVU o CBU tiene 22 números.");
    set.payment_cvu = c || null;
  }
  if (input.optOut !== undefined) set.reminders_opt_out = input.optOut;
  if (input.name !== undefined && input.name.trim().length >= 2) set.name = input.name.trim().slice(0, 80);
  await getDb().update(group_members).set(set).where(eq(group_members.id, me.id));
  await groupAudit(actor, group, "gastos.integrante_datos", "integrante_gastos", me.id, { cambios: Object.keys(set) });
}

export async function removeMember(actor: GastosActor, groupId: string, memberId: string) {
  const { group, me } = await need(actor, groupId);
  if (me.role !== "admin" && me.id !== memberId) throw new GastosError("Solo quien administra el grupo puede sacar integrantes.");
  const [m] = await getDb().select().from(group_members).where(and(eq(group_members.id, memberId), eq(group_members.group_id, group.id), eq(group_members.active, true)));
  if (!m) throw new GastosError("Esa persona no está en el grupo.");
  const { balances } = await ledgerBalances(group);
  if (Object.values(balances).some((b) => (b[m.id] ?? 0) !== 0)) throw new GastosError("Primero hay que saldar las cuentas de esa persona.");
  await getDb().update(group_members).set({ active: false, guest_token_hash: null }).where(eq(group_members.id, m.id));
  await log(group.id, me.id, "integrante", me.id === m.id ? `${m.name} salió del grupo` : `${me.name} sacó a ${m.name} del grupo`);
  await groupAudit(actor, group, "gastos.integrante_quitar", "integrante_gastos", m.id);
}

// ── Gastos ─────────────────────────────────────────────────────────────────

export interface NewExpense {
  description: string;
  amount: number; // centavos
  currency: string;
  date: string;
  category: string;
  payers: Record<string, number>;
  split: SplitSpec;
  fx?: { source: "oficial" | "mep" | "manual"; rate?: number | null } | null;
  notes?: string;
  isCompany?: boolean;
  isDeductible?: boolean;
  recurrence?: string | null;
  receipt?: File | null;
}

const RECURRENCE_STEP: Record<string, (d: Date) => void> = {
  semanal: (d) => d.setUTCDate(d.getUTCDate() + 7),
  mensual: (d) => d.setUTCMonth(d.getUTCMonth() + 1),
  anual: (d) => d.setUTCFullYear(d.getUTCFullYear() + 1),
};
export function nextDate(date: string, recurrence: string) {
  const d = new Date(`${date}T12:00:00Z`);
  RECURRENCE_STEP[recurrence]?.(d);
  return d.toISOString().slice(0, 10);
}

function splitMembers(spec: SplitSpec): string[] {
  switch (spec.method) {
    case "iguales":
      return spec.members;
    case "porcentaje":
      return Object.keys(spec.percents);
    case "partes":
      return Object.keys(spec.parts);
    case "montos":
      return Object.keys(spec.amounts);
    case "items":
      return [...new Set(spec.items.flatMap((i) => i.members))];
  }
}

/** Valida y calcula un gasto sin guardarlo (lo usan el formulario, la IA y createExpense) */
export async function prepareExpense(group: GroupRow, members: MemberRow[], input: NewExpense) {
  const description = input.description.trim().slice(0, 140);
  if (description.length < 2) throw new GastosError("Escribí en qué se gastó.");
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) throw new GastosError("El importe tiene que ser mayor a cero.");
  if (input.amount > 1_000_000_000_00) throw new GastosError("El importe es demasiado grande.");
  const currency = (CURRENCIES as readonly string[]).includes(input.currency) ? input.currency : null;
  if (!currency) throw new GastosError("Elegí una moneda válida.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new GastosError("La fecha no es válida.");
  const ids = new Set(members.map((m) => m.id));
  const involved = [...Object.keys(input.payers), ...splitMembers(input.split)];
  if (involved.some((id) => !ids.has(id))) throw new GastosError("Hay personas que no son parte del grupo.");
  let shares: Record<string, number>;
  try {
    checkPayers(input.amount, input.payers);
    shares = splitExpense(input.amount, input.split);
  } catch (e) {
    if (e instanceof SplitError) throw new GastosError(e.message);
    throw e;
  }
  let fx: { rate: number; source: string } | null = null;
  if (currency !== group.base_currency && input.fx) {
    if (input.fx.source === "manual") {
      const r = Number(input.fx.rate);
      if (!(r > 0) || !Number.isFinite(r)) throw new GastosError("Escribí la cotización manual.");
      fx = { rate: r, source: "manual" };
    } else {
      const r = input.fx.rate && input.fx.rate > 0 ? input.fx.rate : await fxRate(currency, group.base_currency, input.fx.source);
      if (!r) throw new GastosError("No pudimos traer la cotización. Cargala a mano.");
      fx = { rate: r, source: input.fx.source };
    }
  }
  const recurrence = input.recurrence && input.recurrence in RECURRENCE_STEP ? input.recurrence : null;
  return {
    description,
    currency,
    shares,
    fx,
    recurrence,
    category: input.category in CATEGORIES ? input.category : "otros",
    notes: input.notes?.trim().slice(0, 1000) || null,
  };
}

export async function createExpense(actor: GastosActor, groupId: string, input: NewExpense, opts: { origin?: "web" | "asistente" | "recurrente" } = {}) {
  const { group, me } = await need(actor, groupId);
  const members = await activeMembers(group.id);
  const p = await prepareExpense(group, members, input);
  let receipt: { name: string; storagePath: string; mimeType: string } | null = null;
  if (input.receipt) {
    const check = await checkUpload(input.receipt);
    if (!check.ok) throw new GastosError(check.error);
    receipt = await storeUpload(input.receipt, group.studio_id, `gastos-${group.id}`);
  }
  const db = getDb();
  const row = await db.transaction(async (tx) => {
    const [e] = await tx
      .insert(expenses)
      .values({
        group_id: group.id,
        description: p.description,
        amount: input.amount,
        currency: p.currency,
        fx_rate: p.fx ? String(p.fx.rate) : null,
        fx_source: p.fx?.source ?? null,
        fx_date: p.fx ? todayAR() : null,
        date: input.date,
        category: p.category,
        split_method: input.split.method,
        split_spec: input.split as unknown as Record<string, unknown>,
        receipt_path: receipt?.storagePath ?? null,
        receipt_name: receipt?.name ?? null,
        receipt_mime: receipt?.mimeType ?? null,
        notes: p.notes,
        is_company: !!input.isCompany,
        is_deductible: !!input.isDeductible,
        recurrence: p.recurrence,
        recurrence_next: p.recurrence ? nextDate(input.date, p.recurrence) : null,
        created_by: me.id,
      })
      .returning();
    await tx.insert(expense_payers).values(Object.entries(input.payers).filter(([, v]) => v > 0).map(([member_id, amount]) => ({ expense_id: e.id, member_id, amount })));
    await tx.insert(expense_shares).values(Object.entries(p.shares).filter(([, v]) => v > 0).map(([member_id, amount]) => ({ expense_id: e.id, member_id, amount })));
    return e;
  });
  const payerNames = members.filter((m) => input.payers[m.id]).map((m) => m.name);
  await log(group.id, me.id, "gasto", `${payerNames.join(" y ")} pagó ${formatMoney(input.amount, p.currency)} · ${p.description}`, { expenseId: row.id });
  await syncAccounting(group, row);
  await groupAudit(actor, group, "gastos.gasto_crear", "gasto", row.id, { importe: input.amount, moneda: p.currency, metodo: input.split.method, origen: opts.origin ?? "web" });
  return row;
}

export async function deleteExpense(actor: GastosActor, groupId: string, expenseId: string) {
  const { group, me } = await need(actor, groupId);
  const [e] = await getDb().select().from(expenses).where(and(eq(expenses.id, expenseId), eq(expenses.group_id, group.id), isNull(expenses.deleted_at)));
  if (!e) throw new GastosError("Ese gasto no existe.");
  if (e.created_by !== me.id && me.role !== "admin") throw new GastosError("Solo quien cargó el gasto (o quien administra el grupo) puede borrarlo.");
  await getDb().update(expenses).set({ deleted_at: new Date(), recurrence_next: null }).where(eq(expenses.id, e.id));
  await getDb().delete(accounting_expenses).where(and(eq(accounting_expenses.source, "gasto_compartido"), eq(accounting_expenses.source_id, e.id)));
  await log(group.id, me.id, "gasto_borrado", `${me.name} borró ${e.description} (${formatMoney(e.amount, e.currency)})`, { expenseId: e.id });
  await groupAudit(actor, group, "gastos.gasto_borrar", "gasto", e.id);
}

/** Corta la recurrencia de un gasto (las copias ya creadas quedan) */
export async function stopRecurrence(actor: GastosActor, groupId: string, expenseId: string) {
  const { group, me } = await need(actor, groupId);
  const r = await getDb()
    .update(expenses)
    .set({ recurrence: null, recurrence_next: null })
    .where(and(eq(expenses.id, expenseId), eq(expenses.group_id, group.id)))
    .returning({ id: expenses.id, description: expenses.description });
  if (!r.length) throw new GastosError("Ese gasto no existe.");
  await log(group.id, me.id, "gasto_editado", `${me.name} dejó de repetir ${r[0].description}`, { expenseId });
  await groupAudit(actor, group, "gastos.recurrencia_cortar", "gasto", expenseId);
}

/**
 * Gastos de la empresa o deducibles de un grupo con contexto contable: quedan
 * en los gastos de la organización (o del autónomo) con su comprobante.
 */
async function syncAccounting(group: GroupRow, e: typeof expenses.$inferSelect) {
  if (!(e.is_company || e.is_deductible) || (!group.organization_id && !group.context_tenant)) return;
  // El importe contable va en pesos si hay cotización; si no, en la moneda del gasto
  const amount = e.fx_rate && group.base_currency === "ARS" ? Math.round(e.amount * Number(e.fx_rate)) : e.amount;
  const currency = e.fx_rate && group.base_currency === "ARS" ? "ARS" : e.currency;
  await getDb()
    .insert(accounting_expenses)
    .values({
      studio_id: group.studio_id,
      organization_id: group.organization_id,
      source: "gasto_compartido",
      source_id: e.id,
      description: `${e.description} · ${group.name}`,
      amount,
      currency,
      date: e.date,
      category: e.category,
      deductible: e.is_deductible,
      receipt_path: e.receipt_path,
      receipt_name: e.receipt_name,
      receipt_mime: e.receipt_mime,
    })
    .onConflictDoNothing();
}

// ── Pagos (saldar) ────────────────────────────────────────────────────────

export interface NewSettlement {
  from: string;
  to: string;
  amount: number;
  currency: string;
  method: "efectivo" | "transferencia" | "mercado_pago";
  note?: string;
  receipt?: File | null;
}

export async function recordSettlement(actor: GastosActor, groupId: string, input: NewSettlement) {
  const { group, me } = await need(actor, groupId);
  const members = await activeMembers(group.id);
  const from = members.find((m) => m.id === input.from);
  const to = members.find((m) => m.id === input.to);
  if (!from || !to || from.id === to.id) throw new GastosError("Elegí quién paga y a quién.");
  if (me.id !== from.id && me.id !== to.id && me.role !== "admin") throw new GastosError("Solo quien paga o quien cobra puede registrar el pago.");
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) throw new GastosError("El importe tiene que ser mayor a cero.");
  if (!(CURRENCIES as readonly string[]).includes(input.currency)) throw new GastosError("Elegí una moneda válida.");
  if (!["efectivo", "transferencia", "mercado_pago"].includes(input.method)) throw new GastosError("Elegí cómo se pagó.");
  let receipt: { name: string; storagePath: string } | null = null;
  if (input.receipt) {
    const check = await checkUpload(input.receipt);
    if (!check.ok) throw new GastosError(check.error);
    receipt = await storeUpload(input.receipt, group.studio_id, `gastos-${group.id}`);
  }
  let paymentLink: string | null = null;
  if (input.method === "mercado_pago") {
    const link = await paymentLinks().createLink({ amount: input.amount, currency: input.currency, description: `${group.name}: ${from.name} → ${to.name}`, payee: { name: to.name, alias: to.payment_alias } });
    paymentLink = link.url;
  }
  const [s] = await getDb()
    .insert(settlements)
    .values({
      group_id: group.id,
      from_member: from.id,
      to_member: to.id,
      amount: input.amount,
      currency: input.currency,
      method: input.method,
      status: "informado",
      confirmed_by_from: me.id === from.id,
      confirmed_by_to: me.id === to.id,
      payment_link: paymentLink,
      receipt_path: receipt?.storagePath ?? null,
      receipt_name: receipt?.name ?? null,
      note: input.note?.trim().slice(0, 500) || null,
      created_by: me.id,
    })
    .returning();
  await log(group.id, me.id, "pago", `${from.name} le pagó ${formatMoney(input.amount, input.currency)} a ${to.name}`, { settlementId: s.id });
  await groupAudit(actor, group, "gastos.pago_registrar", "pago_gastos", s.id, { importe: input.amount, moneda: input.currency, medio: input.method });
  return s;
}

/** La otra parte confirma (o rechaza) un pago informado */
export async function answerSettlement(actor: GastosActor, groupId: string, settlementId: string, accept: boolean) {
  const { group, me } = await need(actor, groupId);
  const [s] = await getDb().select().from(settlements).where(and(eq(settlements.id, settlementId), eq(settlements.group_id, group.id)));
  if (!s) throw new GastosError("Ese pago no existe.");
  if (me.id !== s.from_member && me.id !== s.to_member) throw new GastosError("Solo quien paga o quien cobra puede confirmar el pago.");
  if (s.status !== "informado") throw new GastosError("Ese pago ya fue respondido.");
  const set: Partial<typeof settlements.$inferSelect> = accept
    ? { confirmed_by_from: s.confirmed_by_from || me.id === s.from_member, confirmed_by_to: s.confirmed_by_to || me.id === s.to_member }
    : { status: "rechazado" };
  if (accept && set.confirmed_by_from && set.confirmed_by_to) {
    set.status = "confirmado";
    set.confirmed_at = new Date();
  }
  await getDb().update(settlements).set(set).where(eq(settlements.id, s.id));
  await log(group.id, me.id, accept ? "pago_confirmado" : "pago_rechazado", `${me.name} ${accept ? "confirmó" : "rechazó"} el pago de ${formatMoney(s.amount, s.currency)}`, { settlementId: s.id });
  await groupAudit(actor, group, accept ? "gastos.pago_confirmar" : "gastos.pago_rechazar", "pago_gastos", s.id);
}

// ── Socios: aportes y retiros ─────────────────────────────────────────────

export async function addPartnerMovement(actor: GastosActor, groupId: string, input: { memberId: string; kind: "aporte" | "retiro"; amount: number; currency: string; date: string; note?: string }) {
  const { group, me } = await need(actor, groupId);
  if (group.type !== "socios") throw new GastosError("Los aportes y retiros son para grupos de socios.");
  const members = await activeMembers(group.id);
  if (!members.some((m) => m.id === input.memberId)) throw new GastosError("Esa persona no es parte del grupo.");
  if (input.kind !== "aporte" && input.kind !== "retiro") throw new GastosError("Elegí aporte o retiro.");
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) throw new GastosError("El importe tiene que ser mayor a cero.");
  if (!(CURRENCIES as readonly string[]).includes(input.currency)) throw new GastosError("Elegí una moneda válida.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new GastosError("La fecha no es válida.");
  const [m] = await getDb()
    .insert(partner_movements)
    .values({ group_id: group.id, member_id: input.memberId, kind: input.kind, amount: input.amount, currency: input.currency, date: input.date, note: input.note?.trim().slice(0, 300) || null, created_by: me.id })
    .returning();
  const who = members.find((x) => x.id === input.memberId)!;
  await log(group.id, me.id, input.kind, `${who.name} ${input.kind === "aporte" ? "aportó" : "retiró"} ${formatMoney(input.amount, input.currency)}`);
  await groupAudit(actor, group, `gastos.socio_${input.kind}`, "movimiento_socio", m.id, { importe: input.amount, moneda: input.currency });
  return m;
}

// ── Comentarios ───────────────────────────────────────────────────────────

export async function addComment(actor: GastosActor, groupId: string, input: { expenseId?: string | null; body: string }) {
  const { group, me } = await need(actor, groupId);
  const body = input.body.trim().slice(0, 1000);
  if (!body) throw new GastosError("Escribí el comentario.");
  let expenseId: string | null = null;
  if (input.expenseId) {
    const [e] = await getDb().select({ id: expenses.id, description: expenses.description }).from(expenses).where(and(eq(expenses.id, input.expenseId), eq(expenses.group_id, group.id)));
    if (!e) throw new GastosError("Ese gasto no existe.");
    expenseId = e.id;
  }
  await getDb().insert(expense_comments).values({ group_id: group.id, expense_id: expenseId, member_id: me.id, body });
  await log(group.id, me.id, "comentario", `${me.name} comentó: “${body.slice(0, 80)}”`, { expenseId: expenseId ?? undefined });
  await groupAudit(actor, group, "gastos.comentar", "gasto", expenseId);
}

// ── Lectura ───────────────────────────────────────────────────────────────

async function loadLedger(groupIds: string[]) {
  if (!groupIds.length) return { exp: [], pays: [], shares: [], sets: [] };
  const db = getDb();
  const exp = await db
    .select()
    .from(expenses)
    .where(and(inArray(expenses.group_id, groupIds), isNull(expenses.deleted_at)))
    .orderBy(desc(expenses.date), desc(expenses.created_at));
  const ids = exp.map((e) => e.id);
  const [pays, shares, sets] = await Promise.all([
    ids.length ? db.select().from(expense_payers).where(inArray(expense_payers.expense_id, ids)) : [],
    ids.length ? db.select().from(expense_shares).where(inArray(expense_shares.expense_id, ids)) : [],
    db.select().from(settlements).where(and(inArray(settlements.group_id, groupIds), ne(settlements.status, "rechazado"))).orderBy(desc(settlements.created_at)),
  ]);
  return { exp, pays, shares, sets };
}

function toLedger(l: Awaited<ReturnType<typeof loadLedger>>, groupId: string) {
  const byExp = (rows: { expense_id: string; member_id: string; amount: number }[]) => {
    const m = new Map<string, Record<string, number>>();
    for (const r of rows) {
      const o = m.get(r.expense_id) ?? {};
      o[r.member_id] = r.amount;
      m.set(r.expense_id, o);
    }
    return m;
  };
  const payers = byExp(l.pays);
  const shares = byExp(l.shares);
  const ledger: LedgerExpense[] = l.exp
    .filter((e) => e.group_id === groupId)
    .map((e) => ({ id: e.id, currency: e.currency, fxRate: e.fx_rate ? Number(e.fx_rate) : null, payers: payers.get(e.id) ?? {}, shares: shares.get(e.id) ?? {} }));
  const sets: LedgerSettlement[] = l.sets.filter((s) => s.group_id === groupId).map((s) => ({ currency: s.currency, from: s.from_member, to: s.to_member, amount: s.amount }));
  return { ledger, sets, payers, shares };
}

async function ledgerBalances(group: GroupRow) {
  const l = await loadLedger([group.id]);
  const { ledger, sets } = toLedger(l, group.id);
  return { balances: computeBalances(ledger, sets), ledger, sets };
}

export interface GroupSummary {
  id: string;
  name: string;
  type: string;
  color: string;
  baseCurrency: string;
  members: number;
  /** Mi saldo por moneda: positivo = me deben */
  mine: Record<string, number>;
  lastActivity: Date | null;
}

export async function listGroups(actor: GastosActor): Promise<GroupSummary[]> {
  const db = getDb();
  const rows = await db
    .select({ group: expense_groups, meId: group_members.id })
    .from(group_members)
    .innerJoin(expense_groups, eq(expense_groups.id, group_members.group_id))
    .where(
      and(
        eq(group_members.active, true),
        eq(expense_groups.studio_id, actor.studioId),
        isNull(expense_groups.archived_at),
        actor.kind === "user" ? eq(group_members.user_id, actor.userId) : eq(group_members.id, actor.memberId),
      ),
    );
  if (!rows.length) return [];
  const ids = rows.map((r) => r.group.id);
  const [l, counts, last] = await Promise.all([
    loadLedger(ids),
    db.select({ g: group_members.group_id, n: sql<number>`count(*)::int` }).from(group_members).where(and(inArray(group_members.group_id, ids), eq(group_members.active, true))).groupBy(group_members.group_id),
    db.select({ g: group_activity.group_id, at: sql<Date>`max(${group_activity.created_at})` }).from(group_activity).where(inArray(group_activity.group_id, ids)).groupBy(group_activity.group_id),
  ]);
  return rows
    .map(({ group, meId }) => {
      const { ledger, sets } = toLedger(l, group.id);
      const b = computeBalances(ledger, sets);
      const mine: Record<string, number> = {};
      for (const [cur, per] of Object.entries(b)) if (per[meId]) mine[cur] = per[meId];
      const at = last.find((x) => x.g === group.id)?.at;
      return {
        id: group.id,
        name: group.name,
        type: group.type,
        color: group.color,
        baseCurrency: group.base_currency,
        members: counts.find((c) => c.g === group.id)?.n ?? 1,
        mine,
        lastActivity: at ? new Date(at) : null,
      };
    })
    .sort((a, b) => (b.lastActivity?.getTime() ?? 0) - (a.lastActivity?.getTime() ?? 0));
}

export interface MemberView {
  id: string;
  name: string;
  email: string | null;
  role: "admin" | "miembro";
  guest: boolean;
  alias: string | null;
  cvu: string | null;
  optOut: boolean;
  active: boolean;
}

export async function getGroupView(actor: GastosActor, groupId: string) {
  const { group, me } = await need(actor, groupId);
  const db = getDb();
  const [allMembers, l, activity, comments, movements] = await Promise.all([
    db.select().from(group_members).where(eq(group_members.group_id, group.id)).orderBy(asc(group_members.created_at)),
    loadLedger([group.id]),
    db.select().from(group_activity).where(eq(group_activity.group_id, group.id)).orderBy(desc(group_activity.created_at)).limit(200),
    db.select().from(expense_comments).where(eq(expense_comments.group_id, group.id)).orderBy(asc(expense_comments.created_at)),
    db.select().from(partner_movements).where(eq(partner_movements.group_id, group.id)).orderBy(desc(partner_movements.date)),
  ]);
  const { ledger, sets, payers, shares } = toLedger(l, group.id);
  const balances = computeBalances(ledger, sets);
  const inBase = balancesInBase(ledger, sets, group.base_currency);
  const transfers: Record<string, Transfer[]> = {};
  for (const cur of Object.keys(balances)) transfers[cur] = group.simplify_debts ? simplifyDebts(balances[cur]) : directDebts(ledger, sets, cur);
  const baseTransfers = inBase.unconverted === 0 && inBase.balances[group.base_currency] ? simplifyDebts(inBase.balances[group.base_currency]) : null;

  // Gráficos: por categoría y por mes, en la moneda base (los gastos sin cotización quedan afuera)
  const byCategory: Record<string, number> = {};
  const byMonth: Record<string, number> = {};
  for (const e of l.exp) {
    const v = e.currency === group.base_currency ? e.amount : e.fx_rate ? Math.round(e.amount * Number(e.fx_rate)) : null;
    if (v === null) continue;
    byCategory[e.category] = (byCategory[e.category] ?? 0) + v;
    const month = e.date.slice(0, 7);
    byMonth[month] = (byMonth[month] ?? 0) + v;
  }

  // Socios: saldo por socio y moneda (aportes − retiros)
  const partners: Record<string, Record<string, number>> = {};
  for (const m of movements) {
    partners[m.currency] ??= {};
    partners[m.currency][m.member_id] = (partners[m.currency][m.member_id] ?? 0) + (m.kind === "aporte" ? m.amount : -m.amount);
  }

  const members: MemberView[] = allMembers.map((m) => ({
    id: m.id,
    name: m.name,
    email: m.email,
    role: m.role,
    guest: !m.user_id,
    alias: m.payment_alias,
    cvu: m.payment_cvu,
    optOut: m.reminders_opt_out,
    active: m.active,
  }));
  let organizationName: string | null = null;
  if (group.organization_id) {
    const [o] = await db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, group.organization_id));
    organizationName = o?.name ?? null;
  }
  return {
    group,
    me,
    organizationName,
    members: members.filter((m) => allMembers.find((x) => x.id === m.id)?.active),
    allMembers: members,
    expenses: l.exp.map((e) => ({ ...e, payers: payers.get(e.id) ?? {}, shares: shares.get(e.id) ?? {} })),
    settlements: l.sets,
    activity,
    comments,
    movements,
    balances,
    inBase,
    transfers,
    baseTransfers,
    byCategory,
    byMonth,
    partners,
  };
}
export type GroupView = Awaited<ReturnType<typeof getGroupView>>;
