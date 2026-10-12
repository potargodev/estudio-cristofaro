import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { agreement_payments, faro_subscriptions, fee_charges, invoices, mp_payments, service_agreements, users, webhook_events } from "@/db/schema";
import { audit } from "@/lib/audit";
import { getSiteUrl } from "@/lib/runtime-config";
import { accountState } from "@/modules/flotas/server";
import { notify } from "@/modules/notifications/server";
import { parseRef, refOf, verifySignature } from "./core";
import { applyFeePayment } from "./fees";
import { BillingError, createPreapproval, createPreference, getPayment, getPreapproval, loadAccount, updatePreapproval } from "./mp";
import { applyPreapprovalStatus, applySubscriptionPayment } from "./subscriptions";
import { formatAmount } from "@/lib/format";
import { UUID } from "@/lib/ids";

// Débito de flotas, links de pago de facturas personales y el procesamiento
// de los webhooks de Mercado Pago (firma, idempotencia y despacho).

const db = () => getDb();
type Me = { id: string; email: string; name: string };

// ───────────── Flotas: débito automático individual ─────────────

async function myAgreement(me: Me, id: string) {
  if (!UUID.test(id)) throw new BillingError("Acuerdo inválido.");
  const [a] = await db().select().from(service_agreements).where(and(eq(service_agreements.id, id), eq(service_agreements.user_id, me.id)));
  if (!a) throw new BillingError("Ese acuerdo no es tuyo.");
  return a;
}

/** Adhiere el débito automático de la cuota de la persona (solo su parte, en la cuenta del estudio) */
export async function startFleetDebit(me: Me, agreementId: string) {
  const a = await myAgreement(me, agreementId);
  if (a.status !== "activo") throw new BillingError("El acuerdo no está activo.");
  if (a.debit_status === "autorizado") throw new BillingError("Ya tenés el débito automático.");
  const acc = await loadAccount(a.studio_id).catch(() => {
    throw new BillingError("El estudio todavía no conectó su cuenta de Mercado Pago. Seguí pagando como hasta ahora.");
  });
  const next = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 1));
  const pa = await createPreapproval(acc, { reason: `Servicio del estudio · ${a.terms.fleetName ?? "flota"}`, amount: a.monthly_price * 100, months: 1, externalRef: refOf({ kind: "flota", id: a.id }), payerEmail: me.email, backUrl: `${getSiteUrl()}/flotas/servicios?debito=1`, startDate: next });
  await db().update(service_agreements).set({ mp_preapproval_id: pa.id, debit_status: "pendiente", debit_url: pa.init_point }).where(eq(service_agreements.id, a.id));
  await audit({ studioId: a.studio_id, organizationId: a.organization_id, actor: me, action: "flota.debito_adherido", entityType: "acuerdo", entityId: a.id, metadata: { importe: a.monthly_price } });
  return pa.init_point;
}

export async function stopFleetDebit(me: Me, agreementId: string) {
  const a = await myAgreement(me, agreementId);
  if (a.mp_preapproval_id) {
    try {
      await updatePreapproval(await loadAccount(a.studio_id), a.mp_preapproval_id, { status: "cancelled" });
    } catch (e) {
      console.error("[flotas] no se pudo cancelar el débito", (e as Error).message);
    }
  }
  await db().update(service_agreements).set({ debit_status: "cancelado" }).where(eq(service_agreements.id, a.id));
  await audit({ studioId: a.studio_id, organizationId: a.organization_id, actor: me, action: "flota.debito_cancelado", entityType: "acuerdo", entityId: a.id });
}

/** Saldo pendiente (o la liquidación final): link de Checkout Pro por lo que debe la persona, nunca por otros */
export async function fleetBalanceLink(me: Me, agreementId: string) {
  const a = await myAgreement(me, agreementId);
  const st = await accountState(a);
  if (!st.pendingAmount) throw new BillingError("No tenés saldo pendiente.");
  const pref = await createPreference(await loadAccount(a.studio_id), { title: `Saldo del servicio · ${st.pendingPeriods.join(", ")}`, amount: st.pendingAmount * 100, externalRef: refOf({ kind: "flota", id: a.id }), payerEmail: me.email, backUrl: `${getSiteUrl()}/flotas/servicios?pago=1` });
  await audit({ studioId: a.studio_id, organizationId: a.organization_id, actor: me, action: "flota.link_saldo", entityType: "acuerdo", entityId: a.id, metadata: { importe: st.pendingAmount } });
  return pref.init_point;
}

/** Pago de la cuota (o del saldo): registra los períodos pendientes que cubre el importe, y si no, el próximo */
async function applyFleetPayment(studioId: string, agreementId: string, amountPesos: number, paymentId: number) {
  const [a] = await db().select().from(service_agreements).where(and(eq(service_agreements.id, agreementId), eq(service_agreements.studio_id, studioId)));
  if (!a) return "sin_acuerdo";
  const st = await accountState(a);
  const periods = [...st.pendingPeriods];
  if (!periods.length) {
    const d = new Date();
    periods.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  const n = Math.max(1, Math.floor(amountPesos / Math.max(1, a.monthly_price)));
  for (const period of periods.slice(0, n)) await db().insert(agreement_payments).values({ agreement_id: a.id, period, amount: a.monthly_price, method: "mercadopago" }).onConflictDoNothing();
  await audit({ studioId, organizationId: a.organization_id, actorLabel: "Mercado Pago", action: "flota.pago", entityType: "acuerdo", entityId: a.id, metadata: { periodos: periods.slice(0, n), pago: paymentId } });
  await notify([a.user_id], { kind: "pago", title: "Recibimos tu pago del servicio", body: formatAmount(amountPesos, "ARS", { decimals: "auto" }), href: "/flotas/servicios" });
  return "aplicado";
}

// ───────────── Facturas de Faro Personal: link de pago ─────────────

/** Link de pago para una factura autorizada del autónomo (cuenta de Mercado Pago del autónomo) */
export async function invoicePaymentLink(scope: { studioId: string; organizationId: string }, actor: Me, invoiceId: string) {
  if (!UUID.test(invoiceId)) throw new BillingError("Comprobante inválido.");
  const [inv] = await db().select().from(invoices).where(and(eq(invoices.id, invoiceId), eq(invoices.studio_id, scope.studioId), eq(invoices.organization_id, scope.organizationId)));
  if (!inv || inv.status !== "autorizada") throw new BillingError("Solo se cobran comprobantes autorizados.");
  if (inv.payment_url) return inv.payment_url;
  const pref = await createPreference(await loadAccount(scope.studioId), { title: `Factura ${String(inv.point_of_sale).padStart(5, "0")}-${String(inv.number ?? 0).padStart(8, "0")}`, amount: Math.round(Number(inv.total) * 100), externalRef: refOf({ kind: "fac", id: inv.id }), backUrl: `${getSiteUrl()}/` });
  await db().update(invoices).set({ payment_url: pref.init_point, mp_preference_id: pref.id }).where(eq(invoices.id, inv.id));
  await audit({ studioId: scope.studioId, organizationId: scope.organizationId, actor, action: "factura.link_pago", entityType: "factura", entityId: inv.id });
  return pref.init_point;
}

async function applyInvoicePayment(studioId: string, invoiceId: string, paymentId: number) {
  const [inv] = await db().select().from(invoices).where(and(eq(invoices.id, invoiceId), eq(invoices.studio_id, studioId)));
  if (!inv) return "sin_factura";
  if (inv.paid_at) return "repetido";
  await db().update(invoices).set({ paid_at: new Date() }).where(eq(invoices.id, inv.id));
  await audit({ studioId, organizationId: inv.organization_id, actorLabel: "Mercado Pago", action: "factura.pagada", entityType: "factura", entityId: inv.id, metadata: { pago: paymentId } });
  const owners = await db().select({ id: users.id }).from(users).where(and(eq(users.studioId, studioId), eq(users.active, true)));
  await notify(owners.map((o) => o.id), { kind: "pago", title: `${inv.customer_name} pagó la factura`, body: formatAmount(Number(inv.total), "ARS", { decimals: "auto" }), href: "/facturacion" });
  return "aplicado";
}

// ───────────── Webhooks ─────────────

interface WebhookInput {
  account: string; // faro | <studio_id>
  topic: string | null;
  dataId: string | null;
  requestId: string | null;
  signature: string | null;
  body: unknown;
}

/**
 * Procesa un webhook de Mercado Pago: verifica la firma con el secreto de la
 * cuenta, consulta el pago (nunca confía en el cuerpo), lo guarda una sola vez
 * y lo aplica a lo que corresponde según external_reference, validando que
 * pertenezca a la cuenta que lo cobró. Devuelve el código HTTP. De los
 * rechazados no se guarda el cuerpo (cualquiera puede mandarlos).
 */
export async function handleWebhook(w: WebhookInput): Promise<{ status: number; result: string }> {
  const log = (result: string, ok: boolean, error?: string) => db().insert(webhook_events).values({ provider: "mercadopago", account: w.account, topic: w.topic, data_id: w.dataId, request_id: w.requestId, signature_ok: ok, result, error: error?.slice(0, 300) ?? null, raw: ok ? (w.body as Record<string, unknown>) : {} });
  if (w.account !== "faro" && !UUID.test(w.account)) {
    await log("rechazado", false, "cuenta inválida");
    return { status: 400, result: "cuenta inválida" };
  }
  const studioId = w.account === "faro" ? null : w.account;
  let acc;
  try {
    acc = await loadAccount(studioId);
  } catch {
    await log("rechazado", false, "cuenta sin configurar");
    return { status: 404, result: "cuenta sin configurar" };
  }
  if (!w.dataId || !acc.secret || !verifySignature(w.signature, w.requestId, w.dataId, acc.secret)) {
    await log("rechazado", false, !acc.secret ? "sin secreto de webhook" : "firma inválida");
    return { status: 401, result: "firma inválida" };
  }
  try {
    if (w.topic === "payment" || w.topic === "merchant_order" || !w.topic) {
      const p = await getPayment(acc, w.dataId);
      const ref = parseRef(p.external_reference);
      const [prev] = await db().select().from(mp_payments).where(and(eq(mp_payments.account, acc.key), eq(mp_payments.mp_payment_id, String(p.id))));
      if (prev && prev.applied && prev.status === p.status) {
        await log("repetido", true);
        return { status: 200, result: "repetido" };
      }
      // La referencia tiene que ser de esta cuenta: las suscripciones solo en la de Faro; lo demás, en la del tenant dueño
      let owner: string | null = null;
      if (ref && ref.kind !== "sub") owner = await ownerOf(ref.kind, ref.id);
      if (ref && ref.kind !== "sub" && owner !== studioId) {
        await log("rechazado", true, "referencia de otra cuenta");
        return { status: 200, result: "referencia de otra cuenta" };
      }
      const values = { account: acc.key, studio_id: ref?.kind === "sub" ? await subStudio(ref.id) : studioId, kind: ref?.kind ?? null, ref_id: ref?.id ?? null, mp_payment_id: String(p.id), status: p.status, status_detail: p.status_detail ?? null, amount: Math.round(p.transaction_amount * 100), currency: p.currency_id ?? "ARS", raw: p as unknown as Record<string, unknown>, synced_at: new Date() };
      const [row] = prev ? await db().update(mp_payments).set(values).where(eq(mp_payments.id, prev.id)).returning() : await db().insert(mp_payments).values(values).onConflictDoNothing().returning();
      if (!row) {
        await log("repetido", true);
        return { status: 200, result: "repetido" };
      }
      let result = "sin_referencia";
      if (ref?.kind === "sub" && acc.key === "faro") result = await applySubscriptionPayment(ref.id, p);
      else if (ref?.kind === "hon" && studioId) result = await applyFeePayment(studioId, ref.id, p);
      else if (ref?.kind === "flota" && studioId && p.status === "approved") result = await applyFleetPayment(studioId, ref.id, p.transaction_amount, p.id);
      else if (ref?.kind === "fac" && studioId && p.status === "approved") result = await applyInvoicePayment(studioId, ref.id, p.id);
      await db().update(mp_payments).set({ applied: true }).where(eq(mp_payments.id, row.id));
      await log("procesado", true, result);
      return { status: 200, result };
    }
    if (w.topic === "subscription_preapproval" || w.topic === "preapproval") {
      const pa = await getPreapproval(acc, w.dataId);
      const ref = parseRef(pa.external_reference);
      let result = "sin_referencia";
      if (ref?.kind === "sub" && acc.key === "faro") result = await applyPreapprovalStatus(ref.id, pa.status);
      else if (ref?.kind === "flota" && studioId) {
        const [a] = await db().update(service_agreements).set({ debit_status: pa.status === "authorized" ? "autorizado" : pa.status === "cancelled" ? "cancelado" : "pendiente" }).where(and(eq(service_agreements.id, ref.id), eq(service_agreements.studio_id, studioId))).returning({ id: service_agreements.id });
        result = a ? "aplicado" : "sin_acuerdo";
      }
      await log("procesado", true, result);
      return { status: 200, result };
    }
    await log("ignorado", true);
    return { status: 200, result: "ignorado" };
  } catch (e) {
    await log("error", true, (e as Error).message);
    // 500: Mercado Pago reintenta
    return { status: 500, result: "error" };
  }
}

async function ownerOf(kind: string, id: string): Promise<string | null> {
  if (kind === "hon") {
    const [c] = await db().select({ s: fee_charges.studio_id }).from(fee_charges).where(eq(fee_charges.id, id));
    return c?.s ?? null;
  }
  if (kind === "flota") {
    const [a] = await db().select({ s: service_agreements.studio_id }).from(service_agreements).where(eq(service_agreements.id, id));
    return a?.s ?? null;
  }
  if (kind === "fac") {
    const [i] = await db().select({ s: invoices.studio_id }).from(invoices).where(eq(invoices.id, id));
    return i?.s ?? null;
  }
  return null;
}

async function subStudio(id: string) {
  const [s] = await db().select({ s: faro_subscriptions.studio_id }).from(faro_subscriptions).where(eq(faro_subscriptions.id, id));
  return s?.s ?? null;
}

