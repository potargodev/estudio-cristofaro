import "server-only";
import { randomBytes } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb } from "@/db";
import { bitacora_connections, bitacora_entries, bitacora_proposals } from "@/db/schema";
import { decrypt, encrypt, encryptionEnabled } from "@/lib/crypto";
import { getSiteUrl } from "@/lib/runtime-config";
import { listCategories } from "./server";
import { bitacoraPlan } from "./plus";
import { detectFromMail } from "./smart";

// Conexiones de Bitácora (Plus): Mercado Pago (lee los movimientos de tu
// cuenta con OAuth) y Gmail (solo lectura: detecta facturas de servicios,
// suscripciones y resúmenes y los PROPONE; nada se carga sin que lo aceptes).
// Tokens cifrados; cada movimiento guarda fuente, ID externo y registro original.
// Simuladores: MERCADOPAGO_API_URL/MERCADOPAGO_AUTH_URL (mocks/mercadopago) y
// GOOGLE_API_MOCK_URL (mocks/google).

const db = () => getDb();
export class ConnectionError extends Error {}
export type Provider = "mercadopago" | "gmail";
const STATE_COOKIE = "faro_bitacora_oauth";

const mp = () => ({
  api: (process.env.MERCADOPAGO_API_URL?.trim() || "https://api.mercadopago.com").replace(/\/$/, ""),
  auth: (process.env.MERCADOPAGO_AUTH_URL?.trim() || "https://auth.mercadopago.com").replace(/\/$/, ""),
  id: process.env.MP_CLIENT_ID?.trim() || "",
  secret: process.env.MP_CLIENT_SECRET?.trim() || "",
});
const google = () => {
  const m = process.env.GOOGLE_API_MOCK_URL?.trim();
  return {
    auth: m ? `${m}/o/oauth2/v2/auth` : "https://accounts.google.com/o/oauth2/v2/auth",
    token: m ? `${m}/token` : "https://oauth2.googleapis.com/token",
    gmail: m ? `${m}/gmail/v1` : "https://gmail.googleapis.com/gmail/v1",
    userinfo: m ? `${m}/oauth2/v3/userinfo` : "https://openidconnect.googleapis.com/v1/userinfo",
    id: process.env.GOOGLE_CLIENT_ID?.trim() || (m ? "mock-client" : ""),
    secret: process.env.GOOGLE_CLIENT_SECRET?.trim() || (m ? "mock-secret" : ""),
  };
};

export const available = (p: Provider) => encryptionEnabled() && (p === "mercadopago" ? !!(mp().id && mp().secret) : !!(google().id && google().secret));
const redirectUri = (p: Provider) => `${getSiteUrl()}/api/bitacora/conexiones/${p}/callback`;

/** URL de consentimiento (guarda el state en una cookie) */
export async function authUrl(user: { id: string; studioId: string }, p: Provider) {
  if (!(await bitacoraPlan(user)).plus) throw new ConnectionError("Las conexiones con Mercado Pago y Gmail son de Bitácora Plus.");
  if (!available(p)) throw new ConnectionError(p === "mercadopago" ? "La conexión con Mercado Pago todavía no está configurada en Faro." : "La conexión con Gmail todavía no está configurada en Faro.");
  const state = `${p}.${randomBytes(16).toString("base64url")}`;
  (await cookies()).set(STATE_COOKIE, state, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 600 });
  if (p === "mercadopago") {
    const u = new URL(`${mp().auth}/authorization`);
    u.search = new URLSearchParams({ client_id: mp().id, response_type: "code", platform_id: "mp", redirect_uri: redirectUri(p), state }).toString();
    return u.toString();
  }
  const u = new URL(google().auth);
  u.search = new URLSearchParams({ client_id: google().id, redirect_uri: redirectUri(p), response_type: "code", scope: "https://www.googleapis.com/auth/gmail.readonly openid email", access_type: "offline", prompt: "consent", state }).toString();
  return u.toString();
}

async function tokenPost(url: string, body: Record<string, string>, json = false) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": json ? "application/json" : "application/x-www-form-urlencoded", Accept: "application/json" }, body: json ? JSON.stringify(body) : new URLSearchParams(body) });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new ConnectionError(`No se pudo conectar (${String(data.message ?? data.error ?? res.status)}).`);
  return data as { access_token: string; refresh_token?: string; expires_in?: number; user_id?: number };
}

/** Vuelta del consentimiento: valida el state, cambia el código por tokens y guarda la conexión */
export async function finishOAuth(userId: string, p: Provider, code: string, state: string) {
  const jar = await cookies();
  const saved = jar.get(STATE_COOKIE)?.value;
  jar.delete(STATE_COOKIE);
  if (!saved || saved !== state || !state.startsWith(`${p}.`)) throw new ConnectionError("El pedido de conexión venció o no es tuyo. Probá de nuevo.");
  let t;
  let label: string | null = null;
  let external: string | null = null;
  if (p === "mercadopago") {
    t = await tokenPost(`${mp().api}/oauth/token`, { client_id: mp().id, client_secret: mp().secret, grant_type: "authorization_code", code, redirect_uri: redirectUri(p) }, true);
    const me = (await fetch(`${mp().api}/users/me`, { headers: { Authorization: `Bearer ${t.access_token}` } }).then((r) => (r.ok ? r.json() : {}))) as { id?: number; nickname?: string; email?: string };
    label = me.email ?? me.nickname ?? null;
    external = String(me.id ?? t.user_id ?? "");
  } else {
    t = await tokenPost(google().token, { client_id: google().id, client_secret: google().secret, grant_type: "authorization_code", code, redirect_uri: redirectUri(p) });
    const me = (await fetch(google().userinfo, { headers: { Authorization: `Bearer ${t.access_token}` } }).then((r) => (r.ok ? r.json() : {}))) as { email?: string };
    label = me.email ?? null;
  }
  const values = { user_id: userId, provider: p, account_label: label, external_user_id: external, access_token_enc: encrypt(t.access_token), refresh_token_enc: t.refresh_token ? encrypt(t.refresh_token) : null, expires_at: new Date(Date.now() + (t.expires_in ?? 3600) * 1000), status: "activa", last_error: null };
  await db().insert(bitacora_connections).values(values).onConflictDoUpdate({ target: [bitacora_connections.user_id, bitacora_connections.provider], set: values });
}

export async function listConnections(userId: string) {
  return db().select({ provider: bitacora_connections.provider, label: bitacora_connections.account_label, status: bitacora_connections.status, lastSync: bitacora_connections.last_sync_at, lastError: bitacora_connections.last_error }).from(bitacora_connections).where(eq(bitacora_connections.user_id, userId));
}

export async function disconnect(userId: string, p: Provider) {
  await db().delete(bitacora_connections).where(and(eq(bitacora_connections.user_id, userId), eq(bitacora_connections.provider, p)));
}

async function connection(userId: string, p: Provider) {
  const [c] = await db().select().from(bitacora_connections).where(and(eq(bitacora_connections.user_id, userId), eq(bitacora_connections.provider, p)));
  if (!c) throw new ConnectionError("No está conectado.");
  let token = decrypt(c.access_token_enc);
  if (c.expires_at && c.expires_at.getTime() < Date.now() + 60_000 && c.refresh_token_enc) {
    const rt = decrypt(c.refresh_token_enc);
    const t = p === "mercadopago" ? await tokenPost(`${mp().api}/oauth/token`, { client_id: mp().id, client_secret: mp().secret, grant_type: "refresh_token", refresh_token: rt }, true) : await tokenPost(google().token, { client_id: google().id, client_secret: google().secret, grant_type: "refresh_token", refresh_token: rt });
    token = t.access_token;
    await db().update(bitacora_connections).set({ access_token_enc: encrypt(token), refresh_token_enc: t.refresh_token ? encrypt(t.refresh_token) : c.refresh_token_enc, expires_at: new Date(Date.now() + (t.expires_in ?? 3600) * 1000) }).where(eq(bitacora_connections.id, c.id));
  }
  return { c, token };
}

const markSync = (userId: string, p: Provider, error: string | null) =>
  db().update(bitacora_connections).set({ last_sync_at: new Date(), status: error ? "error" : "activa", last_error: error }).where(and(eq(bitacora_connections.user_id, userId), eq(bitacora_connections.provider, p)));

/** Mercado Pago: movimientos aprobados de los últimos 30 días (pagos hechos = gastos; cobros = ingresos) */
export async function syncMercadoPago(userId: string) {
  const { c, token } = await connection(userId, "mercadopago");
  try {
    const begin = new Date(Date.now() - 30 * 86400000).toISOString();
    const url = `${mp().api}/v1/payments/search?sort=date_created&criteria=desc&range=date_created&begin_date=${encodeURIComponent(begin)}&end_date=NOW&limit=100`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new ConnectionError(`Mercado Pago respondió ${res.status}.`);
    const data = (await res.json()) as { results: { id: number; date_created: string; description?: string; transaction_amount: number; currency_id: string; status: string; payer?: { id?: number }; collector_id?: number }[] };
    const cats = await listCategories(userId);
    const otros = cats.find((x) => x.key === "otros")?.id ?? null;
    const ingresos = cats.find((x) => x.key === "ingresos")?.id ?? null;
    const me = Number(c.external_user_id);
    const existing = new Set((await db().select({ e: bitacora_entries.external_id }).from(bitacora_entries).where(and(eq(bitacora_entries.user_id, userId), eq(bitacora_entries.source, "mercadopago")))).map((r) => r.e));
    const rows = data.results
      .filter((p) => p.status === "approved" && !existing.has(`mp:${p.id}`) && (p.payer?.id === me || p.collector_id === me))
      .map((p) => {
        const kind = p.collector_id === me ? ("ingreso" as const) : ("gasto" as const);
        return { user_id: userId, kind, amount: Math.round(p.transaction_amount * 100), currency: p.currency_id === "USD" ? "USD" : "ARS", date: p.date_created.slice(0, 10), category_id: kind === "ingreso" ? ingresos : otros, description: (p.description || "Mercado Pago").slice(0, 160), payment_method: "mercado_pago" as const, source: "mercadopago", external_id: `mp:${p.id}`, raw: p, validation: "sincronizado", synced_at: new Date() };
      });
    if (rows.length) await db().insert(bitacora_entries).values(rows);
    await markSync(userId, "mercadopago", null);
    return rows.length;
  } catch (e) {
    await markSync(userId, "mercadopago", (e as Error).message);
    throw e instanceof ConnectionError ? e : new ConnectionError("No se pudieron leer los movimientos de Mercado Pago.");
  }
}

/** Gmail: detecta facturas, suscripciones y resúmenes de los últimos 30 días y los deja como propuestas */
export async function syncGmail(userId: string) {
  const { token } = await connection(userId, "gmail");
  try {
    const q = encodeURIComponent("newer_than:30d (factura OR resumen OR recibo OR suscripción OR vencimiento)");
    const list = (await fetch(`${google().gmail}/users/me/messages?q=${q}&maxResults=30`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => {
      if (!r.ok) throw new ConnectionError(`Gmail respondió ${r.status}.`);
      return r.json();
    })) as { messages?: { id: string }[] };
    let created = 0;
    for (const m of list.messages ?? []) {
      const msg = (await fetch(`${google().gmail}/users/me/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => (r.ok ? r.json() : null))) as { id: string; snippet: string; internalDate: string; payload: { headers: { name: string; value: string }[] } } | null;
      if (!msg) continue;
      const h = (n: string) => msg.payload.headers.find((x) => x.name.toLowerCase() === n.toLowerCase())?.value ?? "";
      const found = detectFromMail({ from: h("From"), subject: h("Subject"), snippet: msg.snippet });
      if (!found) continue;
      const [row] = await db()
        .insert(bitacora_proposals)
        .values({ user_id: userId, source: "gmail", external_id: msg.id, detected: found.detected, description: found.description, amount: found.amount, date: new Date(Number(msg.internalDate)).toISOString().slice(0, 10), category_hint: found.categoryHint, raw: { from: h("From"), subject: h("Subject"), date: h("Date"), snippet: msg.snippet } })
        .onConflictDoNothing()
        .returning({ id: bitacora_proposals.id });
      if (row) created++;
    }
    await markSync(userId, "gmail", null);
    return created;
  } catch (e) {
    await markSync(userId, "gmail", (e as Error).message);
    throw e instanceof ConnectionError ? e : new ConnectionError("No se pudieron leer los mails.");
  }
}

export async function listProposals(userId: string) {
  return db().select().from(bitacora_proposals).where(and(eq(bitacora_proposals.user_id, userId), eq(bitacora_proposals.status, "pendiente"))).orderBy(desc(bitacora_proposals.created_at)).limit(50);
}

/** Acepta (crea el movimiento) o descarta una propuesta */
export async function decideProposal(userId: string, id: string, accept: boolean, amountOverride?: number | null) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  const [p] = await db().select().from(bitacora_proposals).where(and(eq(bitacora_proposals.id, id), eq(bitacora_proposals.user_id, userId), eq(bitacora_proposals.status, "pendiente")));
  if (!p) return;
  if (!accept) {
    await db().update(bitacora_proposals).set({ status: "descartada" }).where(eq(bitacora_proposals.id, p.id));
    return;
  }
  const amount = amountOverride ?? p.amount;
  if (!amount || amount <= 0) throw new ConnectionError("Poné el importe para cargarlo.");
  const cats = await listCategories(userId);
  const cat = cats.find((c) => c.key === p.category_hint) ?? cats.find((c) => c.key === "otros");
  const [e] = await db()
    .insert(bitacora_entries)
    .values({ user_id: userId, kind: "gasto", amount, currency: p.currency, date: p.date ?? new Date().toISOString().slice(0, 10), category_id: cat?.id ?? null, description: p.description, source: p.source, external_id: `${p.source}:${p.external_id}`, raw: p.raw, validation: "confirmado", synced_at: new Date() })
    .returning({ id: bitacora_entries.id });
  await db().update(bitacora_proposals).set({ status: "aceptada", entry_id: e.id, amount }).where(eq(bitacora_proposals.id, p.id));
}
