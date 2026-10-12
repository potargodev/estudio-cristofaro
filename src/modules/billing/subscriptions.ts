import "server-only";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { faro_subscriptions, mp_payments, studios, users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { esc, sendMail } from "@/lib/email";
import { getPlans } from "@/lib/faro/entitlements";
import { ANNUAL_FREE_MONTHS, type FaroPlan } from "@/lib/faro/plans";
import { getUsdArs } from "@/lib/faro/pricing";
import { mailLayout } from "@/lib/notify";
import { getSiteUrl } from "@/lib/runtime-config";
import { notify } from "@/modules/notifications/server";
import { addMonths, GRACE_DAYS, graceEnds, nextStatus, periodPrice, refOf, TRIAL_DAYS, type SubStatus } from "./core";
import { BillingError, createPreapproval, createPreference, loadAccount, updatePreapproval, type MpPayment } from "./mp";
import { formatDate } from "@/lib/format";

// Suscripciones de Faro: cada tenant paga su plan con débito automático de
// Mercado Pago (cuenta de Faro). Prueba de 30 días, pago mensual o anual (2
// meses bonificados), cambios de plan (las subas se aplican ya; las bajas al
// terminar el período), cancelación al final del período y, si un cobro
// falla, 7 días de gracia antes de suspender. Todo queda auditado.

const db = () => getDb();
type Actor = { id: string; email: string; name?: string };
type Subscription = typeof faro_subscriptions.$inferSelect;
const DAY = 86400000;

async function tenant(studioId: string) {
  const [t] = await db().select().from(studios).where(eq(studios.id, studioId));
  if (!t) throw new BillingError("Cuenta inexistente.");
  return t;
}

/** Suscripción del tenant (la crea con su estado actual la primera vez) */
export async function ensureSubscription(studioId: string): Promise<Subscription> {
  const [s] = await db().select().from(faro_subscriptions).where(eq(faro_subscriptions.studio_id, studioId));
  if (s) return s;
  const t = await tenant(studioId);
  const plan = (await getPlans()).find((p) => p.key === t.plan_key);
  // Un plan gratis (Inicial incluido) nunca tiene prueba ni débito
  const status: SubStatus = plan?.free ? "activa" : t.status === "prueba" ? "prueba" : t.status === "suspendido" ? "suspendida" : "activa";
  const [row] = await db()
    .insert(faro_subscriptions)
    .values({ studio_id: studioId, plan_key: t.plan_key, status, amount: 0, trial_ends_at: t.trial_ends_at ?? (status === "prueba" ? new Date(Date.now() + TRIAL_DAYS * DAY) : null) })
    .onConflictDoNothing()
    .returning();
  if (row) return row;
  const [again] = await db().select().from(faro_subscriptions).where(eq(faro_subscriptions.studio_id, studioId));
  return again;
}

async function priceFor(plan: FaroPlan, interval: "mensual" | "anual") {
  return plan.free ? 0 : periodPrice(plan.priceUsd, await getUsdArs(), interval, ANNUAL_FREE_MONTHS);
}

const backUrl = (kind: string) => `${getSiteUrl()}${kind === "studio" ? "/admin/configuracion/plan" : "/personal/plan"}?pago=1`;

/**
 * Elegir plan e intervalo. Plan gratis: se aplica (o al final del período
 * pago). Plan pago sin débito autorizado: crea la suscripción en Mercado Pago
 * y devuelve el link para autorizarla. Con débito ya autorizado: sube ya o
 * baja al final del período, y actualiza el importe del débito.
 */
export async function choosePlan(studioId: string, actor: Actor, planKey: string, interval: "mensual" | "anual"): Promise<{ redirect?: string; message: string }> {
  const t = await tenant(studioId);
  const plan = (await getPlans()).find((p) => p.key === planKey && p.kind === t.kind);
  if (!plan) throw new BillingError("Ese plan no existe para tu tipo de cuenta.");
  const sub = await ensureSubscription(studioId);
  const amount = await priceFor(plan, interval);
  const paidNow = sub.status === "activa" && sub.amount > 0 && sub.current_period_end && sub.current_period_end > new Date();
  if (plan.free) {
    if (paidNow) {
      await db().update(faro_subscriptions).set({ pending_plan_key: plan.key, pending_interval: interval, cancel_at_period_end: false }).where(eq(faro_subscriptions.id, sub.id));
      if (sub.mp_preapproval_id) await cancelPreapproval(sub.mp_preapproval_id);
      await audit({ studioId, actor, action: "suscripcion.baja_de_plan", entityType: "suscripcion", entityId: sub.id, metadata: { a: plan.key, desde: sub.current_period_end } });
      return { message: `Pasás a ${plan.name} cuando termine el período pago (${formatDate(sub.current_period_end!, "numeric")}).` };
    }
    if (sub.mp_preapproval_id) await cancelPreapproval(sub.mp_preapproval_id);
    await db().update(faro_subscriptions).set({ plan_key: plan.key, interval, status: "activa", amount: 0, mp_preapproval_id: null, mp_status: null, init_point: null, pending_plan_key: null, past_due_since: null, cancel_at_period_end: false }).where(eq(faro_subscriptions.id, sub.id));
    await db().update(studios).set({ plan_key: plan.key, status: "activo", suspended_reason: null }).where(eq(studios.id, studioId));
    await audit({ studioId, actor, action: "suscripcion.plan", entityType: "suscripcion", entityId: sub.id, metadata: { plan: plan.key, gratis: true } });
    return { message: `Listo: estás en ${plan.name}.` };
  }
  const acc = await loadAccount(null);
  if (sub.mp_preapproval_id && sub.mp_status === "authorized" && paidNow) {
    const upgrade = amount / (interval === "anual" ? 12 : 1) > sub.amount / (sub.interval === "anual" ? 12 : 1);
    await updatePreapproval(acc, sub.mp_preapproval_id, { auto_recurring: { transaction_amount: amount / 100, currency_id: "ARS" } });
    if (upgrade && interval === sub.interval) {
      await db().update(faro_subscriptions).set({ plan_key: plan.key, amount, pending_plan_key: null }).where(eq(faro_subscriptions.id, sub.id));
      await db().update(studios).set({ plan_key: plan.key }).where(eq(studios.id, studioId));
      await audit({ studioId, actor, action: "suscripcion.plan", entityType: "suscripcion", entityId: sub.id, metadata: { plan: plan.key, de: sub.plan_key, suba: true } });
      return { message: `Listo: ya tenés ${plan.name}. El nuevo importe se debita desde el próximo período.` };
    }
    await db().update(faro_subscriptions).set({ pending_plan_key: plan.key, pending_interval: interval, amount }).where(eq(faro_subscriptions.id, sub.id));
    await audit({ studioId, actor, action: "suscripcion.cambio_programado", entityType: "suscripcion", entityId: sub.id, metadata: { plan: plan.key, intervalo: interval } });
    return { message: `Pasás a ${plan.name} (${interval}) cuando termine el período actual.` };
  }
  // Nuevo débito: si está en prueba, el primer cobro es al terminar la prueba
  const start = sub.status === "prueba" && sub.trial_ends_at && sub.trial_ends_at > new Date() ? sub.trial_ends_at : undefined;
  const [owner] = await db().select({ email: users.email }).from(users).where(eq(users.id, actor.id));
  const pa = await createPreapproval(acc, { reason: `Faro · plan ${plan.name} (${interval})`, amount, months: interval === "anual" ? 12 : 1, externalRef: refOf({ kind: "sub", id: sub.id }), payerEmail: owner?.email ?? actor.email, backUrl: backUrl(t.kind), startDate: start });
  await db().update(faro_subscriptions).set({ pending_plan_key: plan.key, pending_interval: interval, amount, mp_preapproval_id: pa.id, mp_status: pa.status, init_point: pa.init_point, cancel_at_period_end: false }).where(eq(faro_subscriptions.id, sub.id));
  await audit({ studioId, actor, action: "suscripcion.debito_creado", entityType: "suscripcion", entityId: sub.id, metadata: { plan: plan.key, intervalo: interval, importe: amount / 100, preapproval: pa.id } });
  return { redirect: pa.init_point, message: "Autorizá el débito en Mercado Pago." };
}

async function cancelPreapproval(id: string) {
  try {
    await updatePreapproval(await loadAccount(null), id, { status: "cancelled" });
    return true;
  } catch (e) {
    console.error("[suscripciones] no se pudo cancelar el débito", id, (e as Error).message);
    return false;
  }
}

/** Baja: sigue hasta el final del período pago (en prueba, termina ya) */
export async function cancelSubscription(studioId: string, actor: Actor) {
  const sub = await ensureSubscription(studioId);
  if (sub.mp_preapproval_id) await cancelPreapproval(sub.mp_preapproval_id);
  const now = new Date();
  const immediate = sub.status !== "activa" || !sub.current_period_end || sub.current_period_end <= now;
  await db().update(faro_subscriptions).set({ cancel_at_period_end: true, mp_status: "cancelled", canceled_at: now, ...(immediate ? { status: "cancelada" } : {}) }).where(eq(faro_subscriptions.id, sub.id));
  if (immediate) await applyCanceled(studioId);
  await audit({ studioId, actor, action: "suscripcion.cancelada", entityType: "suscripcion", entityId: sub.id, metadata: { inmediata: immediate, hasta: sub.current_period_end } });
  return immediate ? "Cancelaste la suscripción." : `Cancelaste la suscripción: seguís con tu plan hasta el ${formatDate(sub.current_period_end!, "numeric")}.`;
}

/** Al cancelar se vuelve al plan gratis del tipo de cuenta (estudios: Inicial); si no hubiera, se suspende */
async function applyCanceled(studioId: string) {
  const t = await tenant(studioId);
  const free = (await getPlans()).find((p) => p.kind === t.kind && p.free);
  if (free) {
    await db().update(studios).set({ plan_key: free.key, status: "activo", suspended_reason: null }).where(eq(studios.id, studioId));
    await db().update(faro_subscriptions).set({ plan_key: free.key, amount: 0 }).where(eq(faro_subscriptions.studio_id, studioId));
  } else await db().update(studios).set({ status: "suspendido", suspended_reason: "Suscripción cancelada" }).where(eq(studios.id, studioId));
}

/** Pagar lo adeudado ahora (desde la pantalla de cuenta suspendida o morosa): link de Checkout Pro */
export async function payNowLink(studioId: string) {
  const sub = await ensureSubscription(studioId);
  const plan = (await getPlans()).find((p) => p.key === (sub.pending_plan_key ?? sub.plan_key));
  if (!plan || plan.free) throw new BillingError("No hay nada para pagar.");
  const amount = sub.amount || (await priceFor(plan, sub.interval === "anual" ? "anual" : "mensual"));
  const t = await tenant(studioId);
  const pref = await createPreference(await loadAccount(null), { title: `Faro · plan ${plan.name}`, amount, externalRef: refOf({ kind: "sub", id: sub.id }), backUrl: backUrl(t.kind) });
  return pref.init_point;
}

async function owners(studioId: string) {
  return db().select({ id: users.id, email: users.email, name: users.name }).from(users).where(and(eq(users.studioId, studioId), inArray(users.role, ["dueno", "titular"]), eq(users.active, true)));
}

async function tell(studioId: string, title: string, body: string, href: string) {
  const list = await owners(studioId);
  await notify(list.map((u) => u.id), { kind: "pago", title, body, href });
  for (const u of list) await sendMail({ to: u.email, subject: title, html: mailLayout(title, `<p>${esc(body)}</p>`, { href: `${getSiteUrl()}${href}`, label: "Ver mi plan" }, "Faro") });
}

/** Pago informado por Mercado Pago para una suscripción */
export async function applySubscriptionPayment(subId: string, p: MpPayment) {
  const [sub] = await db().select().from(faro_subscriptions).where(eq(faro_subscriptions.id, subId));
  if (!sub) return "sin_suscripcion";
  const t = await tenant(sub.studio_id);
  const href = t.kind === "studio" ? "/admin/configuracion/plan" : "/personal/plan";
  if (p.status === "approved") {
    const interval = (sub.pending_interval ?? sub.interval) as "mensual" | "anual";
    const planKey = sub.pending_plan_key ?? sub.plan_key;
    const now = new Date();
    const start = sub.current_period_end && sub.current_period_end > now && !sub.past_due_since ? sub.current_period_end : now;
    const end = addMonths(start, interval === "anual" ? 12 : 1);
    await db()
      .update(faro_subscriptions)
      .set({ status: "activa", plan_key: planKey, interval, current_period_start: start, current_period_end: end, past_due_since: null, pending_plan_key: null, pending_interval: null, trial_ends_at: null, mp_status: p.preapproval_id ? "authorized" : sub.mp_status })
      .where(eq(faro_subscriptions.id, sub.id));
    await db().update(studios).set({ plan_key: planKey, status: "activo", suspended_reason: null, trial_ends_at: null }).where(eq(studios.id, sub.studio_id));
    await audit({ studioId: sub.studio_id, actorLabel: "Mercado Pago", action: "suscripcion.pago", entityType: "suscripcion", entityId: sub.id, metadata: { importe: p.transaction_amount, pago: p.id, hasta: end.toISOString().slice(0, 10) } });
    await tell(sub.studio_id, "Recibimos tu pago de Faro", `Tu plan sigue activo hasta el ${formatDate(end, "numeric")}. ¡Gracias!`, href);
    return "aplicado";
  }
  if (p.status === "rejected" || p.status === "cancelled") {
    const since = sub.past_due_since ?? new Date();
    await db().update(faro_subscriptions).set({ status: "morosa", past_due_since: since }).where(eq(faro_subscriptions.id, sub.id));
    await audit({ studioId: sub.studio_id, actorLabel: "Mercado Pago", action: "suscripcion.pago_fallido", entityType: "suscripcion", entityId: sub.id, metadata: { pago: p.id, detalle: p.status_detail ?? null } });
    await tell(sub.studio_id, "No pudimos cobrar tu plan de Faro", `Mercado Pago rechazó el débito. Tenés tiempo hasta el ${formatDate(graceEnds(since), "numeric")} para regularizarlo (pagá desde Plan y facturación o revisá tu medio de pago en Mercado Pago); después la cuenta se suspende.`, href);
    return "moroso";
  }
  return "ignorado";
}

/** Cambio de estado de la suscripción en Mercado Pago (autorizada, pausada, cancelada) */
export async function applyPreapprovalStatus(subId: string, status: string) {
  const [sub] = await db().select().from(faro_subscriptions).where(eq(faro_subscriptions.id, subId));
  if (!sub) return "sin_suscripcion";
  await db().update(faro_subscriptions).set({ mp_status: status, ...(status === "cancelled" && sub.status === "activa" ? { cancel_at_period_end: true } : {}) }).where(eq(faro_subscriptions.id, sub.id));
  // Autorizado durante la prueba: queda el plan elegido (el primer cobro llega al terminar la prueba)
  if (status === "authorized" && sub.status === "prueba" && sub.pending_plan_key) {
    await db().update(faro_subscriptions).set({ plan_key: sub.pending_plan_key, interval: sub.pending_interval ?? sub.interval }).where(eq(faro_subscriptions.id, sub.id));
    await db().update(studios).set({ plan_key: sub.pending_plan_key }).where(eq(studios.id, sub.studio_id));
  }
  await audit({ studioId: sub.studio_id, actorLabel: "Mercado Pago", action: "suscripcion.debito_estado", entityType: "suscripcion", entityId: sub.id, metadata: { estado: status } });
  return "aplicado";
}

/**
 * Un plan gratis no se cobra nunca: si una suscripción quedó en un plan gratis
 * con prueba, mora o un débito de Mercado Pago (por ejemplo, los estudios que
 * estaban en Inicial cuando era pago), pasa a activa sin cobro, se cancela el
 * débito y queda auditado. Devuelve cuántas se normalizaron.
 */
export async function normalizeFreeSubscriptions() {
  const plans = await getPlans();
  const freeKeys = plans.filter((p) => p.free).map((p) => p.key);
  if (!freeKeys.length) return 0;
  const subs = await db().select().from(faro_subscriptions).where(inArray(faro_subscriptions.plan_key, freeKeys));
  let n = 0;
  for (const s of subs) {
    const pendingPaid = s.pending_plan_key && !freeKeys.includes(s.pending_plan_key);
    // Con un pase a un plan pago en curso, el débito es de ese plan: no se toca
    if (pendingPaid) continue;
    const dirty = s.status === "prueba" || s.status === "morosa" || s.status === "suspendida" || s.amount > 0 || (s.mp_preapproval_id && s.mp_status !== "cancelled") || s.trial_ends_at;
    if (!dirty) continue;
    // Si Mercado Pago no responde, el débito queda marcado y se reintenta en la próxima corrida
    const hadDebit = !!s.mp_preapproval_id && s.mp_status !== "cancelled";
    const canceled = hadDebit ? await cancelPreapproval(s.mp_preapproval_id!) : false;
    const first = !s.notices.includes("plan-gratis");
    await db()
      .update(faro_subscriptions)
      .set({ status: "activa", amount: 0, trial_ends_at: null, past_due_since: null, mp_status: hadDebit && canceled ? "cancelled" : s.mp_status, init_point: null, pending_plan_key: null, pending_interval: null, cancel_at_period_end: false, notices: first ? [...s.notices, "plan-gratis"] : s.notices })
      .where(eq(faro_subscriptions.id, s.id));
    const [t] = await db().select().from(studios).where(eq(studios.id, s.studio_id));
    if (t && (t.status !== "activo" || t.trial_ends_at)) await db().update(studios).set({ status: "activo", trial_ends_at: null, suspended_reason: null }).where(eq(studios.id, s.studio_id));
    if (first || canceled)
      await audit({ studioId: s.studio_id, actorLabel: "Faro", action: "suscripcion.plan_gratis", entityType: "suscripcion", entityId: s.id, metadata: { plan: s.plan_key, estado_anterior: s.status, importe_anterior: s.amount / 100, debito_cancelado: canceled, debito_pendiente_de_cancelar: hadDebit && !canceled }, ip: null });
    n++;
  }
  return n;
}

/** Tarea periódica: vencimiento de pruebas, gracia, suspensión, cancelaciones y avisos */
export async function runSubscriptionJobs(now = new Date()) {
  await normalizeFreeSubscriptions();
  const freeKeys = new Set((await getPlans()).filter((p) => p.free).map((p) => p.key));
  const subs = await db().select().from(faro_subscriptions).where(inArray(faro_subscriptions.status, ["prueba", "activa", "morosa"]));
  let changed = 0;
  for (const s of subs) {
    // Plan gratis: sin avisos de prueba ni cobros
    if (freeKeys.has(s.plan_key) && !s.pending_plan_key) continue;
    const t = await tenant(s.studio_id);
    const href = t.kind === "studio" ? "/admin/configuracion/plan" : "/personal/plan";
    // Aviso de fin de prueba (7 y 1 días antes), una sola vez cada uno
    if (s.status === "prueba" && s.trial_ends_at) {
      const left = Math.ceil((s.trial_ends_at.getTime() - now.getTime()) / DAY);
      for (const d of [7, 1])
        if (left <= d && left > 0 && !s.notices.includes(`prueba-${d}`) && s.mp_status !== "authorized") {
          await tell(s.studio_id, `Tu prueba de Faro termina en ${left} día${left === 1 ? "" : "s"}`, "Elegí tu plan y autorizá el débito para seguir sin cortes.", href);
          await db().update(faro_subscriptions).set({ notices: [...s.notices, `prueba-${d}`] }).where(eq(faro_subscriptions.id, s.id));
          s.notices.push(`prueba-${d}`);
        }
      // Prueba con débito autorizado: el cobro llega solo; no se suspende mientras tanto
      if (s.mp_status === "authorized" && s.trial_ends_at <= now) continue;
    }
    const next = nextStatus({ status: s.status as SubStatus, trialEndsAt: s.trial_ends_at, currentPeriodEnd: s.current_period_end, pastDueSince: s.past_due_since, cancelAtPeriodEnd: s.cancel_at_period_end }, now);
    if (next === s.status) continue;
    changed++;
    await db().update(faro_subscriptions).set({ status: next }).where(eq(faro_subscriptions.id, s.id));
    if (next === "cancelada") await applyCanceled(s.studio_id);
    if (next === "suspendida") {
      const free = (await getPlans()).find((p) => p.kind === t.kind && p.free);
      if (free && s.status === "prueba") {
        // Al terminar la prueba sin pagar se vuelve al plan gratis (estudios: Inicial)
        await db().update(faro_subscriptions).set({ status: "activa", plan_key: free.key, amount: 0, trial_ends_at: null }).where(eq(faro_subscriptions.id, s.id));
        await db().update(studios).set({ plan_key: free.key, status: "activo", trial_ends_at: null }).where(eq(studios.id, s.studio_id));
      } else {
        await db().update(studios).set({ status: "suspendido", suspended_reason: s.status === "prueba" ? "Terminó la prueba de 30 días" : `Pago pendiente (más de ${GRACE_DAYS} días)` }).where(eq(studios.id, s.studio_id));
        await tell(s.studio_id, "Tu cuenta de Faro quedó suspendida", "Podés reactivarla pagando desde la pantalla de la cuenta. Tus datos están a salvo.", href);
      }
    }
    await audit({ studioId: s.studio_id, actorLabel: "Faro", action: "suscripcion.estado", entityType: "suscripcion", entityId: s.id, metadata: { de: s.status, a: next } });
  }
  return changed;
}

/** Faro Manager: altas, bajas, ingresos y morosos */
export async function subscriptionsOverview() {
  const first = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1, 3));
  const [rows, [income], usdArs] = await Promise.all([
    db()
      .select({ id: faro_subscriptions.id, studioId: studios.id, name: studios.name, kind: studios.kind, plan: faro_subscriptions.plan_key, status: faro_subscriptions.status, interval: faro_subscriptions.interval, amount: faro_subscriptions.amount, periodEnd: faro_subscriptions.current_period_end, trialEnds: faro_subscriptions.trial_ends_at, pastDue: faro_subscriptions.past_due_since, canceledAt: faro_subscriptions.canceled_at, createdAt: faro_subscriptions.created_at, mpStatus: faro_subscriptions.mp_status })
      .from(faro_subscriptions)
      .innerJoin(studios, eq(studios.id, faro_subscriptions.studio_id))
      .orderBy(desc(faro_subscriptions.updated_at)),
    db().select({ total: sql<string>`coalesce(sum(${mp_payments.amount}), 0)`, n: sql<number>`count(*)::int` }).from(mp_payments).where(and(eq(mp_payments.account, "faro"), eq(mp_payments.status, "approved"), gte(mp_payments.created_at, first))),
    getUsdArs(),
  ]);
  const count = (st: string) => rows.filter((r) => r.status === st).length;
  const mrr = rows.filter((r) => r.status === "activa").reduce((s, r) => s + (r.interval === "anual" ? r.amount / 12 : r.amount), 0);
  return {
    rows,
    counts: { prueba: count("prueba"), activa: count("activa"), morosa: count("morosa"), suspendida: count("suspendida"), cancelada: count("cancelada") },
    altas: rows.filter((r) => r.createdAt >= first && r.status !== "prueba").length,
    bajas: rows.filter((r) => r.canceledAt && r.canceledAt >= first).length,
    income: Number(income.total),
    payments: income.n,
    mrr: Math.round(mrr),
    usdArs,
  };
}
