import "server-only";
import { emitEvent } from "@/modules/flows/events";
import { and, asc, desc, eq, inArray, lte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { billing_settings, fee_charges, fee_plans, ipc_series, legal_entities, memberships, organizations, studios, users } from "@/db/schema";
import { audit } from "@/lib/audit";
import type { StaffUser } from "@/lib/auth";
import { esc, sendMail } from "@/lib/email";
import { hasModule } from "@/lib/faro/entitlements";
import { mailLayout } from "@/lib/notify";
import { can, type OrgRole } from "@/lib/permissions";
import { getSiteUrl } from "@/lib/runtime-config";
import { createDraft, getSettings, listPoints, orgIssuer } from "@/modules/arca/server";
import { notify } from "@/modules/notifications/server";
import { dueReminder, feeFor, refOf, reminderTone, type Adjustment } from "./core";
import { BillingError, createPreference, loadAccount, type MpPayment } from "./mp";
import { formatDate, formatMoney } from "@/lib/format";

// Cobranza de honorarios del estudio (módulo billing, pestaña Honorarios del
// grupo Negocio): abonos por organización con ajuste periódico, cargos del
// estado de cuenta, link de pago de Mercado Pago (cuenta del estudio),
// recordatorios escalonados, factura del estudio por ARCA (F3) y estado de
// cuenta visible en el portal. Todo filtra por estudio y organización.

const db = () => getDb();
const UUID = /^[0-9a-f-]{36}$/i;
type Actor = { id: string; email: string; name?: string };

export async function requireBilling(studioId: string) {
  if (!(await hasModule(studioId, "billing"))) throw new BillingError("La cobranza de honorarios viene con el plan Profesional.");
}

async function ownOrg(studioId: string, orgId: string) {
  if (!UUID.test(orgId)) throw new BillingError("Organización inválida.");
  const [o] = await db().select({ id: organizations.id, name: organizations.name, email: organizations.email }).from(organizations).where(and(eq(organizations.id, orgId), eq(organizations.studio_id, studioId)));
  if (!o) throw new BillingError("Esa organización no es del estudio.");
  return o;
}

// ───────────── Configuración ─────────────

export async function getBillingSettings(studioId: string) {
  const [s] = await db().select().from(billing_settings).where(eq(billing_settings.studio_id, studioId));
  return s ?? { studio_id: studioId, issuer_organization_id: null, reminders: true, due_day: 10, updated_by: null, updated_at: new Date() };
}

export async function saveBillingSettings(studioId: string, actor: Actor, i: { issuerOrganizationId: string | null; reminders: boolean; dueDay: number }) {
  if (i.issuerOrganizationId) await ownOrg(studioId, i.issuerOrganizationId);
  const v = { studio_id: studioId, issuer_organization_id: i.issuerOrganizationId, reminders: i.reminders, due_day: Math.min(28, Math.max(1, Math.trunc(i.dueDay) || 10)), updated_by: actor.id };
  await db().insert(billing_settings).values(v).onConflictDoUpdate({ target: billing_settings.studio_id, set: v });
  await audit({ studioId, actor, action: "honorarios.configuracion", entityType: "honorarios", metadata: { recordatorios: v.reminders, vencimiento: v.due_day } });
}

// ───────────── Abonos ─────────────

export async function listPlans(studioId: string) {
  return db().select({ p: fee_plans, org: organizations.name }).from(fee_plans).innerJoin(organizations, eq(organizations.id, fee_plans.organization_id)).where(eq(fee_plans.studio_id, studioId)).orderBy(asc(organizations.name));
}

export async function savePlan(studioId: string, actor: Actor, i: { id?: string | null; organizationId: string; concept: string; amount: number; startMonth: string; adjustKind: string; adjustEvery: number; adjustPercent: number | null; active: boolean }) {
  await requireBilling(studioId);
  const org = await ownOrg(studioId, i.organizationId);
  if (!(i.amount > 0)) throw new BillingError("Poné el importe del abono.");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(i.startMonth)) throw new BillingError("Elegí desde qué mes.");
  const kind = ["porcentaje", "ipc"].includes(i.adjustKind) ? i.adjustKind : "ninguno";
  if (kind === "porcentaje" && !(Number(i.adjustPercent) > 0)) throw new BillingError("Poné el porcentaje del ajuste.");
  const v = { studio_id: studioId, organization_id: org.id, concept: i.concept.trim().slice(0, 120) || "Honorarios", amount: Math.round(i.amount), start_month: i.startMonth, adjust_kind: kind, adjust_every: Math.min(12, Math.max(1, Math.trunc(i.adjustEvery) || 3)), adjust_percent: kind === "porcentaje" ? String(i.adjustPercent) : null, active: i.active, created_by: actor.id };
  let id = i.id && UUID.test(i.id) ? i.id : null;
  if (id) {
    const [u] = await db().update(fee_plans).set(v).where(and(eq(fee_plans.id, id), eq(fee_plans.studio_id, studioId))).returning({ id: fee_plans.id });
    if (!u) throw new BillingError("No encontramos ese abono.");
  } else id = (await db().insert(fee_plans).values(v).returning({ id: fee_plans.id }))[0].id;
  await audit({ studioId, organizationId: org.id, actor, action: "honorarios.abono", entityType: "abono", entityId: id, metadata: { importe: v.amount / 100, ajuste: kind, cada: v.adjust_every, porcentaje: v.adjust_percent } });
  return id;
}

async function ipcLookup() {
  const rows = await db().select().from(ipc_series);
  const m = new Map(rows.map((r) => [r.month, Number(r.value)]));
  return (month: string) => m.get(month) ?? null;
}

/** Importe del abono para un período (con el ajuste) */
export async function planAmount(p: typeof fee_plans.$inferSelect, period: string, ipc?: (m: string) => number | null) {
  const adj: Adjustment = { kind: p.adjust_kind as Adjustment["kind"], everyMonths: p.adjust_every, percent: p.adjust_percent ? Number(p.adjust_percent) : undefined };
  return feeFor(p.amount, adj, p.start_month, period, ipc ?? (await ipcLookup()));
}

/** Genera los cargos del período para los abonos activos (no duplica) */
export async function generateCharges(studioId: string, period: string, actor?: Actor) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new BillingError("Período inválido.");
  const [plans, settings, ipc] = await Promise.all([db().select().from(fee_plans).where(and(eq(fee_plans.studio_id, studioId), eq(fee_plans.active, true), lte(fee_plans.start_month, period))), getBillingSettings(studioId), ipcLookup()]);
  let n = 0;
  for (const p of plans) {
    const amount = await planAmount(p, period, ipc);
    const r = await db()
      .insert(fee_charges)
      .values({ studio_id: studioId, organization_id: p.organization_id, fee_plan_id: p.id, period, concept: `${p.concept} · ${period.slice(5)}/${period.slice(0, 4)}`, amount, due_date: `${period}-${String(settings.due_day).padStart(2, "0")}`, created_by: actor?.id ?? null })
      .onConflictDoNothing()
      .returning({ id: fee_charges.id });
    n += r.length;
    if (r[0]) await emitEvent(studioId, "honorarios.cargo_generado", { cargo_id: r[0].id, organizacion_id: p.organization_id, importe: amount / 100, vence: `${period}-${String(settings.due_day).padStart(2, "0")}` }, r[0].id);
  }
  if (n && actor) await audit({ studioId, actor, action: "honorarios.cargos", entityType: "honorarios", metadata: { periodo: period, cargos: n } });
  return n;
}

export async function addCharge(studioId: string, actor: Actor, i: { organizationId: string; concept: string; amount: number; dueDate: string }) {
  await requireBilling(studioId);
  const org = await ownOrg(studioId, i.organizationId);
  if (!(i.amount > 0) || !i.concept.trim()) throw new BillingError("Poné el concepto y el importe.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(i.dueDate)) throw new BillingError("Poné el vencimiento.");
  const [c] = await db().insert(fee_charges).values({ studio_id: studioId, organization_id: org.id, concept: i.concept.trim().slice(0, 160), amount: Math.round(i.amount), due_date: i.dueDate, created_by: actor.id }).returning();
  await audit({ studioId, organizationId: org.id, actor, action: "honorarios.cargo", entityType: "cargo", entityId: c.id, metadata: { importe: c.amount / 100, concepto: c.concept } });
  return c;
}

export async function getCharge(studioId: string, id: string) {
  if (!UUID.test(id)) return null;
  const [c] = await db().select().from(fee_charges).where(and(eq(fee_charges.id, id), eq(fee_charges.studio_id, studioId)));
  return c ?? null;
}

export async function listCharges(studioId: string, f: { status?: string; organizationId?: string } = {}) {
  return db()
    .select({ c: fee_charges, org: organizations.name })
    .from(fee_charges)
    .innerJoin(organizations, eq(organizations.id, fee_charges.organization_id))
    .where(and(eq(fee_charges.studio_id, studioId), f.status ? eq(fee_charges.status, f.status) : undefined, f.organizationId ? eq(fee_charges.organization_id, f.organizationId) : undefined))
    .orderBy(desc(fee_charges.due_date), asc(organizations.name))
    .limit(300);
}

/** Estado de cuenta de una organización (lo ve el estudio y el portal con finanzas.ver) */
export async function accountStatement(studioId: string, organizationId: string) {
  const rows = await db().select().from(fee_charges).where(and(eq(fee_charges.studio_id, studioId), eq(fee_charges.organization_id, organizationId), inArray(fee_charges.status, ["pendiente", "pagado"]))).orderBy(desc(fee_charges.due_date)).limit(60);
  const today = new Date().toISOString().slice(0, 10);
  const pending = rows.filter((r) => r.status === "pendiente");
  return { rows, pending: pending.reduce((s, r) => s + r.amount, 0), overdue: pending.filter((r) => r.due_date < today).reduce((s, r) => s + r.amount, 0), paid: rows.filter((r) => r.status === "pagado").reduce((s, r) => s + (r.paid_amount ?? r.amount), 0) };
}

/** Link de pago de Mercado Pago (cuenta del estudio) para un cargo */
export async function chargeLink(studioId: string, chargeId: string, actor?: Actor | null) {
  const c = await getCharge(studioId, chargeId);
  if (!c || c.status !== "pendiente") throw new BillingError("Ese cargo no está pendiente.");
  if (c.payment_url) return c.payment_url;
  const [st] = await db().select({ name: studios.name }).from(studios).where(eq(studios.id, studioId));
  const pref = await createPreference(await loadAccount(studioId), { title: `${st?.name ?? "Estudio"} · ${c.concept}`, amount: c.amount, externalRef: refOf({ kind: "hon", id: c.id }), backUrl: `${getSiteUrl()}/portal/estado-de-cuenta?pago=1` });
  await db().update(fee_charges).set({ payment_url: pref.init_point, mp_preference_id: pref.id }).where(eq(fee_charges.id, c.id));
  if (actor) await audit({ studioId, organizationId: c.organization_id, actor, action: "honorarios.link", entityType: "cargo", entityId: c.id });
  return pref.init_point;
}

export async function markPaid(studioId: string, actor: Actor, chargeId: string, method: string, amount?: number | null) {
  const c = await getCharge(studioId, chargeId);
  if (!c || c.status !== "pendiente") throw new BillingError("Ese cargo no está pendiente.");
  await db().update(fee_charges).set({ status: "pagado", paid_at: new Date(), paid_amount: amount && amount > 0 ? Math.round(amount) : c.amount, payment_method: ["transferencia", "efectivo", "mercadopago", "otro"].includes(method) ? method : "otro" }).where(eq(fee_charges.id, c.id));
  await audit({ studioId, organizationId: c.organization_id, actor, action: "honorarios.pago_manual", entityType: "cargo", entityId: c.id, metadata: { medio: method, importe: (amount ?? c.amount) / 100 } });
}

export async function voidCharge(studioId: string, actor: Actor, chargeId: string) {
  const c = await getCharge(studioId, chargeId);
  if (!c || c.status !== "pendiente") throw new BillingError("Ese cargo no está pendiente.");
  await db().update(fee_charges).set({ status: "anulado" }).where(eq(fee_charges.id, c.id));
  await audit({ studioId, organizationId: c.organization_id, actor, action: "honorarios.anulado", entityType: "cargo", entityId: c.id });
}

/** Quiénes reciben los cobros: miembros activos con finanzas.ver (o el mail de la organización) */
async function recipients(studioId: string, organizationId: string) {
  const rows = await db().select({ id: users.id, email: users.email, role: memberships.role }).from(memberships).innerJoin(users, eq(users.id, memberships.user_id)).where(and(eq(memberships.studio_id, studioId), eq(memberships.organization_id, organizationId), eq(memberships.status, "activa")));
  const list = rows.filter((r) => can(r.role as OrgRole, "finanzas.ver"));
  const [org] = await db().select({ email: organizations.email }).from(organizations).where(eq(organizations.id, organizationId));
  const emails = [...new Set([...list.map((r) => r.email), ...(list.length ? [] : org?.email ? [org.email] : [])])];
  return { users: list.map((r) => r.id), emails };
}


/**
 * Manda el cobro (mail y aviso en el portal) con el link de pago. Lo usan el
 * botón del estudio, los recordatorios automáticos y, solo después de
 * aprobarse, el Vigía (herramienta sensible).
 */
export async function sendCharge(studioId: string, chargeId: string, actor: Actor | null, step: number | null = null) {
  const c = await getCharge(studioId, chargeId);
  if (!c || c.status !== "pendiente") throw new BillingError("Ese cargo no está pendiente.");
  let link: string | null = null;
  try {
    link = await chargeLink(studioId, c.id, actor);
  } catch (e) {
    if (!(e instanceof BillingError)) throw e;
  }
  const [st] = await db().select({ name: studios.name }).from(studios).where(eq(studios.id, studioId));
  const to = await recipients(studioId, c.organization_id);
  if (!to.emails.length && !to.users.length) throw new BillingError("La organización no tiene a nadie con acceso a pagos ni un mail cargado.");
  const tone = step == null ? "manual" : reminderTone(step);
  const due = formatDate(c.due_date, "numeric");
  const title = tone === "previo" ? `Vence el ${due}: ${c.concept}` : tone === "vence_hoy" ? `Vence hoy: ${c.concept}` : tone === "vencido" ? `Quedó pendiente: ${c.concept}` : tone === "ultimo_aviso" ? `Último aviso: ${c.concept}` : `${st?.name ?? "Tu estudio"}: ${c.concept}`;
  const body = `<p>${esc(st?.name ?? "Tu estudio")} te envía el cobro de <strong>${esc(c.concept)}</strong> por <strong>${formatMoney(c.amount)}</strong>, con vencimiento el ${due}.</p>${link ? "<p>Podés pagarlo con Mercado Pago desde el botón.</p>" : "<p>Coordiná el pago con el estudio.</p>"}<p>También lo ves en tu portal, en Empresa → Estado de cuenta.</p>`;
  for (const e of to.emails) await sendMail({ to: e, subject: title, html: mailLayout(title, body, { href: link ?? `${getSiteUrl()}/portal/estado-de-cuenta`, label: link ? "Pagar" : "Ver estado de cuenta" }, st?.name ?? "Faro") });
  await notify(to.users, { kind: "pago", title, body: `${formatMoney(c.amount)} · vence el ${due}`, href: "/portal/estado-de-cuenta" });
  await db().update(fee_charges).set({ reminders_sent: step == null ? c.reminders_sent : [...c.reminders_sent, step], last_reminder_at: new Date() }).where(eq(fee_charges.id, c.id));
  await audit({ studioId, organizationId: c.organization_id, actor, actorLabel: actor ? undefined : "Recordatorio automático", action: "honorarios.enviado", entityType: "cargo", entityId: c.id, metadata: { destinatarios: to.emails.length, paso: step, tono: tone } });
  return { link, sentTo: to.emails.length };
}

/** Prepara la factura del estudio por ARCA (borrador): se emite con confirmación desde Facturación */
export async function prepareInvoice(user: StaffUser, chargeId: string) {
  const c = await getCharge(user.studioId, chargeId);
  if (!c) throw new BillingError("No encontramos ese cargo.");
  if (c.invoice_id) {
    const s = await getBillingSettings(user.studioId);
    return `/admin/organizaciones/${s.issuer_organization_id}/arca/${c.invoice_id}`;
  }
  const settings = await getBillingSettings(user.studioId);
  if (!settings.issuer_organization_id) throw new BillingError("Elegí en Configuración qué organización representa al estudio para facturar (con su CUIT y la delegación en Faro).");
  const scope = await orgIssuer(user, settings.issuer_organization_id);
  const points = await listPoints(scope);
  if (!points.length) throw new BillingError("Traé los puntos de venta en la pestaña ARCA de la organización del estudio.");
  const [le] = await db().select().from(legal_entities).where(and(eq(legal_entities.organization_id, c.organization_id), eq(legal_entities.studio_id, user.studioId))).orderBy(asc(legal_entities.created_at)).limit(1);
  const [org] = await db().select({ name: organizations.name, email: organizations.email }).from(organizations).where(eq(organizations.id, c.organization_id));
  const cuit = (le?.cuit ?? "").replace(/\D/g, "");
  const iva = le?.regime === "monotributo" ? "monotributo" : le?.regime === "responsable_inscripto" || le?.regime === "sociedad" ? "responsable_inscripto" : le?.regime === "exento" ? "exento" : "consumidor_final";
  const issuerIva = (await getSettings(scope)).iva_condition;
  const ri = issuerIva === "responsable_inscripto";
  const draft = await createDraft(
    scope,
    {
      pointOfSale: points[0].number,
      issueDate: new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10),
      concept: 2,
      serviceFrom: c.period ? `${c.period}-01` : null,
      serviceTo: c.period ? new Date(Date.UTC(Number(c.period.slice(0, 4)), Number(c.period.slice(5)), 0)).toISOString().slice(0, 10) : null,
      paymentDue: c.due_date,
      customer: { docType: cuit.length === 11 ? 80 : 99, docNumber: cuit || "0", name: le?.business_name ?? org?.name ?? "Cliente", ivaCondition: cuit.length === 11 ? iva : "consumidor_final", email: org?.email ?? null, address: le?.tax_address ?? null },
      items: [{ description: c.concept, quantity: 1, unitPrice: ri ? Math.round((c.amount / 100 / 1.21) * 100) / 100 : c.amount / 100, ivaRate: ri ? 21 : null }],
      notes: c.payment_url ? `Pagá en línea: ${c.payment_url}` : null,
    },
    { id: user.id, email: user.email, name: user.name, role: user.role },
  );
  await db().update(fee_charges).set({ invoice_id: draft.id }).where(eq(fee_charges.id, c.id));
  await audit({ studioId: user.studioId, organizationId: c.organization_id, actor: user, action: "honorarios.factura_preparada", entityType: "cargo", entityId: c.id, metadata: { borrador: draft.id } });
  return `${scope.base}/${draft.id}`;
}

/** Pago informado por Mercado Pago para un cargo de honorarios */
export async function applyFeePayment(studioId: string, chargeId: string, p: MpPayment) {
  const c = await getCharge(studioId, chargeId);
  if (!c) return "sin_cargo";
  if (p.status !== "approved") return "ignorado";
  if (c.status === "pagado") return "repetido";
  await db().update(fee_charges).set({ status: "pagado", paid_at: new Date(), paid_amount: Math.round(p.transaction_amount * 100), payment_method: "mercadopago" }).where(eq(fee_charges.id, c.id));
  await emitEvent(studioId, "honorarios.pagado", { cargo_id: c.id, organizacion_id: c.organization_id, importe: p.transaction_amount }, c.id);
  await audit({ studioId, organizationId: c.organization_id, actorLabel: "Mercado Pago", action: "honorarios.pagado", entityType: "cargo", entityId: c.id, metadata: { pago: p.id, importe: p.transaction_amount } });
  const staff = await db().select({ id: users.id }).from(users).where(and(eq(users.studioId, studioId), inArray(users.role, ["dueno", "contador"]), eq(users.active, true)));
  const [org] = await db().select({ name: organizations.name }).from(organizations).where(eq(organizations.id, c.organization_id));
  await notify(staff.map((s) => s.id), { kind: "pago", title: `${org?.name ?? "Una organización"} pagó ${c.concept}`, body: formatMoney(Math.round(p.transaction_amount * 100)), href: "/admin/honorarios?tab=cobros" });
  return "aplicado";
}

/** Tarea periódica: cargos del mes (desde el día 1) y recordatorios escalonados */
export async function runFeeJobs(now = new Date()) {
  const ar = new Date(now.getTime() - 3 * 3600_000);
  const period = ar.toISOString().slice(0, 7);
  const today = ar.toISOString().slice(0, 10);
  const studiosWithPlans = await db().selectDistinct({ id: fee_plans.studio_id }).from(fee_plans).where(eq(fee_plans.active, true));
  let charges = 0;
  let reminders = 0;
  for (const s of studiosWithPlans) {
    if (!(await hasModule(s.id, "billing"))) continue;
    charges += await generateCharges(s.id, period);
  }
  const pending = await db().select({ c: fee_charges, reminders: billing_settings.reminders }).from(fee_charges).leftJoin(billing_settings, eq(billing_settings.studio_id, fee_charges.studio_id)).where(and(eq(fee_charges.status, "pendiente"), sql`${fee_charges.due_date} >= ${new Date(ar.getTime() - 30 * 86400000).toISOString().slice(0, 10)}`));
  for (const { c, reminders: on } of pending) {
    if (on === false) continue;
    const step = dueReminder(c.due_date, c.reminders_sent, today);
    if (step == null) continue;
    try {
      await sendCharge(c.studio_id, c.id, null, step);
      reminders++;
    } catch (e) {
      console.error("[honorarios] recordatorio", c.id, (e as Error).message);
    }
  }
  return { charges, reminders };
}
