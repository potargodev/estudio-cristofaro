import "server-only";
import { eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { mp_accounts } from "@/db/schema";
import { audit } from "@/lib/audit";
import { decrypt, encrypt, encryptionEnabled } from "@/lib/crypto";
import { getSiteUrl } from "@/lib/runtime-config";

// Cliente de Mercado Pago (API REST): Checkout Pro (preferencias), suscripciones
// (preapproval) y consulta de pagos. Cada cobro sale de una cuenta: la de Faro
// (suscripciones de los planes) o la de un tenant (honorarios, débitos de
// flotas y links de pago de facturas). MERCADOPAGO_API_URL apunta al
// simulador en pruebas (mocks/mercadopago).

export class BillingError extends Error {}
const api = () => (process.env.MERCADOPAGO_API_URL?.trim() || "https://api.mercadopago.com").replace(/\/$/, "");

interface MpAccount {
  key: string; // "faro" o el id del tenant
  token: string;
  secret: string | null;
  nickname: string | null;
}

/** Clave de la cuenta para la URL del webhook */
const accountKey = (studioId: string | null) => studioId ?? "faro";
export const notificationUrl = (studioId: string | null) => `${getSiteUrl()}/api/mercadopago/webhook?cuenta=${accountKey(studioId)}`;

async function row(studioId: string | null) {
  const [r] = await getDb()
    .select()
    .from(mp_accounts)
    .where(studioId ? eq(mp_accounts.studio_id, studioId) : isNull(mp_accounts.studio_id));
  return r ?? null;
}

/** Cuenta que cobra (la de Faro puede venir de MP_ACCESS_TOKEN y MP_WEBHOOK_SECRET) */
export async function loadAccount(studioId: string | null): Promise<MpAccount> {
  const r = await row(studioId);
  if (r) return { key: accountKey(studioId), token: decrypt(r.access_token_enc), secret: r.webhook_secret_enc ? decrypt(r.webhook_secret_enc) : null, nickname: r.nickname };
  if (!studioId && process.env.MP_ACCESS_TOKEN?.trim()) return { key: "faro", token: process.env.MP_ACCESS_TOKEN.trim(), secret: process.env.MP_WEBHOOK_SECRET?.trim() || null, nickname: null };
  throw new BillingError(studioId ? "Todavía no conectaste tu cuenta de Mercado Pago." : "Faro todavía no tiene configurada su cuenta de Mercado Pago.");
}

export async function accountSummary(studioId: string | null) {
  const r = await row(studioId);
  if (!r) return studioId || !process.env.MP_ACCESS_TOKEN ? null : { status: "ok", nickname: "Variables de entorno", testedAt: null, lastError: null, hasSecret: !!process.env.MP_WEBHOOK_SECRET, fromEnv: true };
  return { status: r.status, nickname: r.nickname, testedAt: r.tested_at, lastError: r.last_error, hasSecret: !!r.webhook_secret_enc, fromEnv: false };
}

async function call<T>(token: string, path: string, init: { method?: string; body?: unknown; idempotencyKey?: string } = {}): Promise<T> {
  const res = await fetch(`${api()}${path}`, {
    method: init.method ?? "GET",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.idempotencyKey ? { "X-Idempotency-Key": init.idempotencyKey } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(20000),
  }).catch(() => {
    throw new BillingError("No pudimos comunicarnos con Mercado Pago. Probá de nuevo en un rato.");
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new BillingError(`Mercado Pago respondió: ${String(data.message ?? data.error ?? res.status)}`);
  return data as T;
}

/** Guarda (y prueba) las credenciales de una cuenta */
export async function saveAccount(studioId: string | null, actor: { id: string; email: string }, i: { accessToken: string; publicKey?: string | null; webhookSecret?: string | null }) {
  if (!encryptionEnabled()) throw new BillingError("Falta ENCRYPTION_KEY en el servidor para guardar credenciales.");
  const token = i.accessToken.trim();
  if (!/^(APP_USR|TEST)-[\w-]{10,}$/.test(token)) throw new BillingError("El access token de Mercado Pago empieza con APP_USR- (producción) o TEST- (pruebas).");
  let me: { id?: number; nickname?: string } = {};
  let status = "ok";
  let lastError: string | null = null;
  try {
    me = await call(token, "/users/me");
  } catch (e) {
    status = "error";
    lastError = (e as Error).message;
  }
  const prev = await row(studioId);
  const values = { studio_id: studioId, access_token_enc: encrypt(token), public_key: i.publicKey?.trim() || null, webhook_secret_enc: i.webhookSecret?.trim() ? encrypt(i.webhookSecret.trim()) : (prev?.webhook_secret_enc ?? null), mp_user_id: me.id ? String(me.id) : null, nickname: me.nickname ?? null, status, last_error: lastError, tested_at: new Date(), updated_by: actor.id };
  if (prev) await getDb().update(mp_accounts).set(values).where(eq(mp_accounts.id, prev.id));
  else await getDb().insert(mp_accounts).values(values);
  await audit({ studioId, actor, action: studioId ? "cobros.cuenta_mp" : "faro.cuenta_mp", entityType: "cuenta_mp", metadata: { resultado: status, cuenta: me.nickname ?? null } });
  if (status === "error") throw new BillingError(`Guardamos las credenciales pero la prueba falló: ${lastError}`);
  return me;
}

export async function deleteAccount(studioId: string | null, actor: { id: string; email: string }) {
  await getDb().delete(mp_accounts).where(studioId ? eq(mp_accounts.studio_id, studioId) : isNull(mp_accounts.studio_id));
  await audit({ studioId, actor, action: studioId ? "cobros.cuenta_mp_borrada" : "faro.cuenta_mp_borrada", entityType: "cuenta_mp" });
}

interface Preference {
  id: string;
  init_point: string;
}

/** Checkout Pro: link de pago de un importe (centavos) */
export async function createPreference(acc: MpAccount, i: { title: string; amount: number; externalRef: string; payerEmail?: string | null; backUrl: string }) {
  return call<Preference>(acc.token, "/checkout/preferences", {
    method: "POST",
    idempotencyKey: `${i.externalRef}:${i.amount}`,
    body: {
      items: [{ title: i.title.slice(0, 250), quantity: 1, unit_price: i.amount / 100, currency_id: "ARS" }],
      external_reference: i.externalRef,
      payer: i.payerEmail ? { email: i.payerEmail } : undefined,
      back_urls: { success: i.backUrl, pending: i.backUrl, failure: i.backUrl },
      auto_return: "approved",
      notification_url: notificationUrl(acc.key === "faro" ? null : acc.key),
      metadata: { external_reference: i.externalRef },
    },
  });
}

interface Preapproval {
  id: string;
  status: string;
  init_point: string;
  external_reference?: string;
  next_payment_date?: string | null;
  auto_recurring?: { transaction_amount: number };
}

/** Suscripción con débito automático (cada `months` meses) */
export async function createPreapproval(acc: MpAccount, i: { reason: string; amount: number; months: number; externalRef: string; payerEmail: string; backUrl: string; startDate?: Date }) {
  return call<Preapproval>(acc.token, "/preapproval", {
    method: "POST",
    body: {
      reason: i.reason.slice(0, 250),
      external_reference: i.externalRef,
      payer_email: i.payerEmail,
      back_url: i.backUrl,
      notification_url: notificationUrl(acc.key === "faro" ? null : acc.key),
      status: "pending",
      auto_recurring: { frequency: i.months, frequency_type: "months", transaction_amount: i.amount / 100, currency_id: "ARS", ...(i.startDate ? { start_date: i.startDate.toISOString() } : {}) },
    },
  });
}

export const updatePreapproval = (acc: MpAccount, id: string, body: Record<string, unknown>) => call<Preapproval>(acc.token, `/preapproval/${encodeURIComponent(id)}`, { method: "PUT", body });
export const getPreapproval = (acc: MpAccount, id: string) => call<Preapproval>(acc.token, `/preapproval/${encodeURIComponent(id)}`);

export interface MpPayment {
  id: number;
  status: string;
  status_detail?: string;
  transaction_amount: number;
  currency_id: string;
  external_reference?: string | null;
  preapproval_id?: string | null;
  metadata?: Record<string, unknown>;
  date_approved?: string | null;
}
export const getPayment = (acc: MpAccount, id: string) => call<MpPayment>(acc.token, `/v1/payments/${encodeURIComponent(id)}`);
