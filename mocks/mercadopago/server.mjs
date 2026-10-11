// Simulador de la API de Mercado Pago para pruebas (nunca en producción).
//
//   node mocks/mercadopago/server.mjs     → http://localhost:4070
//
// En Faro: MERCADOPAGO_API_URL=http://localhost:4070 y
// MERCADOPAGO_AUTH_URL=http://localhost:4070 (con MP_CLIENT_ID/MP_CLIENT_SECRET
// cualquiera). Implementa:
// - OAuth: GET /authorization (redirige con code) y POST /oauth/token
//   (authorization_code, refresh_token y client_credentials).
// - GET /users/me y GET /v1/payments/search (movimientos de la cuenta: pagos
//   hechos y cobros recibidos), para Bitácora.
// - Checkout Pro y suscripciones (F7): POST /checkout/preferences,
//   GET /checkout/preferences/:id, POST /preapproval, GET/PUT /preapproval/:id,
//   GET /v1/payments/:id, y POST /__pay (simula que alguien paga una
//   preferencia o una cuota) que dispara el webhook firmado (x-signature) a
//   MP_MOCK_WEBHOOK_URL con el secreto MP_MOCK_WEBHOOK_SECRET.
// GET /__stats · POST /__reset

import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:http";

const PORT = Number(process.env.PORT ?? 4070);
const codes = new Map(); // code -> user
const tokens = new Map(); // access_token -> user
const refresh = new Map();
const preferences = new Map();
const preapprovals = new Map();
const payments = new Map();
let seq = 1000;
const stats = { tokens: 0, preferences: 0, preapprovals: 0, payments: 0, webhooks: 0, webhookErrors: 0 };

const USER = { id: 123456789, nickname: "PERSONAPRUEBA", email: "persona@ejemplo.com", first_name: "Persona" };
const day = (n) => new Date(Date.now() - n * 86400000).toISOString();
const ACCOUNT = [
  { id: 9001, date_created: day(1), description: "Kiosco El Faro", transaction_amount: 1500, currency_id: "ARS", status: "approved", operation_type: "regular_payment", payer: { id: USER.id }, collector_id: 555 },
  { id: 9002, date_created: day(2), description: "Transferencia de Ana", transaction_amount: 20000, currency_id: "ARS", status: "approved", operation_type: "money_transfer", payer: { id: 777 }, collector_id: USER.id },
  { id: 9003, date_created: day(3), description: "Spotify", transaction_amount: 3599, currency_id: "ARS", status: "approved", operation_type: "recurring_payment", payer: { id: USER.id }, collector_id: 556 },
  { id: 9004, date_created: day(4), description: "Pago rechazado", transaction_amount: 500, currency_id: "ARS", status: "rejected", operation_type: "regular_payment", payer: { id: USER.id }, collector_id: 557 },
];

const json = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};
const read = async (req) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return Object.fromEntries(new URLSearchParams(raw));
  }
};
const auth = (req) => tokens.get((req.headers.authorization ?? "").replace(/^Bearer\s+/, "")) ?? null;
const issue = (user) => {
  const access = `APP_USR-${randomBytes(12).toString("hex")}`;
  const rt = `TG-${randomBytes(12).toString("hex")}`;
  tokens.set(access, user);
  refresh.set(rt, user);
  stats.tokens++;
  return { access_token: access, token_type: "bearer", expires_in: 15552000, scope: "offline_access read write", user_id: user.id, refresh_token: rt, public_key: "APP_USR-mock" };
};

/** Webhook firmado como Mercado Pago: x-signature "ts=…,v1=HMAC(id:<id>;request-id:<rid>;ts:<ts>;)" */
async function webhook(type, id) {
  const url = process.env.MP_MOCK_WEBHOOK_URL;
  if (!url) return;
  const ts = String(Date.now());
  const rid = randomUUID();
  const manifest = `id:${id};request-id:${rid};ts:${ts};`;
  const v1 = createHmac("sha256", process.env.MP_MOCK_WEBHOOK_SECRET ?? "mock-webhook-secret").update(manifest).digest("hex");
  try {
    const r = await fetch(`${url}${url.includes("?") ? "&" : "?"}data.id=${id}&type=${type}`, { method: "POST", headers: { "Content-Type": "application/json", "x-signature": `ts=${ts},v1=${v1}`, "x-request-id": rid }, body: JSON.stringify({ action: `${type}.updated`, api_version: "v1", data: { id: String(id) }, type, date_created: new Date().toISOString(), live_mode: false }) });
    stats.webhooks++;
    if (!r.ok) stats.webhookErrors++;
  } catch {
    stats.webhookErrors++;
  }
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = url.pathname;
  if (p === "/__stats") return json(res, 200, { ...stats, preferences: preferences.size, preapprovals: preapprovals.size, payments: payments.size });
  if (p === "/__reset") {
    [codes, tokens, refresh, preferences, preapprovals, payments].forEach((m) => m.clear());
    return json(res, 200, {});
  }
  if (p === "/authorization") {
    const code = `TG-code-${randomBytes(8).toString("hex")}`;
    codes.set(code, USER);
    const back = new URL(url.searchParams.get("redirect_uri"));
    back.searchParams.set("code", code);
    if (url.searchParams.get("state")) back.searchParams.set("state", url.searchParams.get("state"));
    res.writeHead(302, { Location: back.toString() });
    return res.end();
  }
  if (p === "/oauth/token" && req.method === "POST") {
    const b = await read(req);
    if (!b.client_id || !b.client_secret) return json(res, 400, { error: "invalid_client", message: "Faltan las credenciales de la aplicación" });
    if (b.grant_type === "authorization_code") {
      const u = codes.get(b.code);
      if (!u) return json(res, 400, { error: "invalid_grant", message: "Código inválido o vencido" });
      codes.delete(b.code);
      return json(res, 200, issue(u));
    }
    if (b.grant_type === "refresh_token") {
      const u = refresh.get(b.refresh_token);
      if (!u) return json(res, 400, { error: "invalid_grant" });
      return json(res, 200, issue(u));
    }
    if (b.grant_type === "client_credentials") return json(res, 200, issue({ id: 1, nickname: "FARO" }));
    return json(res, 400, { error: "unsupported_grant_type" });
  }
  // Las credenciales del vendedor (access token de la aplicación o del estudio) también valen como "APP_USR-…"
  const user = auth(req) ?? ((req.headers.authorization ?? "").includes("APP_USR-") || (req.headers.authorization ?? "").includes("TEST-") ? { id: 1, nickname: "VENDEDOR" } : null);
  if (!user) return json(res, 401, { message: "invalid access token", error: "unauthorized", status: 401 });
  if (p === "/users/me") return json(res, 200, user.id === USER.id ? USER : { id: user.id, nickname: user.nickname, email: "vendedor@ejemplo.com" });
  if (p === "/v1/payments/search") {
    const own = user.id === USER.id ? ACCOUNT : [...payments.values()];
    return json(res, 200, { results: own, paging: { total: own.length, limit: 50, offset: 0 } });
  }
  if (p.startsWith("/v1/payments/")) {
    const pay = payments.get(Number(p.split("/").pop()));
    return pay ? json(res, 200, pay) : json(res, 404, { message: "Payment not found", status: 404 });
  }
  if (p === "/checkout/preferences" && req.method === "POST") {
    const b = await read(req);
    if (!Array.isArray(b.items) || !b.items.length) return json(res, 400, { message: "items requeridos", status: 400 });
    const id = `${user.id}-${randomUUID()}`;
    const pref = { id, ...b, init_point: `http://localhost:${PORT}/checkout/v1/redirect?pref_id=${id}`, sandbox_init_point: `http://localhost:${PORT}/checkout/v1/redirect?pref_id=${id}`, date_created: new Date().toISOString() };
    preferences.set(id, pref);
    stats.preferences++;
    return json(res, 201, pref);
  }
  if (p.startsWith("/checkout/preferences/")) {
    const pref = preferences.get(p.split("/").pop());
    return pref ? json(res, 200, pref) : json(res, 404, { message: "not found" });
  }
  if (p === "/checkout/v1/redirect") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(`<!doctype html><title>Mercado Pago (simulador)</title><p>Checkout de prueba de la preferencia ${url.searchParams.get("pref_id")}. Usá POST /__pay para simular el pago.</p>`);
  }
  if (p === "/preapproval" && req.method === "POST") {
    const b = await read(req);
    if (!b.auto_recurring?.transaction_amount) return json(res, 400, { message: "auto_recurring.transaction_amount requerido", status: 400 });
    const id = randomBytes(12).toString("hex");
    const pa = { id, status: "pending", init_point: `http://localhost:${PORT}/checkout/v1/redirect?preapproval_id=${id}`, date_created: new Date().toISOString(), next_payment_date: null, ...b };
    preapprovals.set(id, pa);
    stats.preapprovals++;
    return json(res, 201, pa);
  }
  if (p.startsWith("/preapproval/")) {
    const id = p.split("/").pop();
    const pa = preapprovals.get(id);
    if (!pa) return json(res, 404, { message: "not found" });
    if (req.method === "PUT") {
      const b = await read(req);
      Object.assign(pa, b);
      setTimeout(() => webhook("subscription_preapproval", id), 50);
    }
    return json(res, 200, pa);
  }
  if (p === "/__pay" && req.method === "POST") {
    const b = await read(req);
    const status = b.status ?? "approved";
    let pay;
    if (b.preference_id) {
      const pref = preferences.get(b.preference_id);
      if (!pref) return json(res, 404, { message: "preferencia inexistente" });
      const amount = pref.items.reduce((s, i) => s + Number(i.unit_price) * Number(i.quantity ?? 1), 0);
      pay = { id: ++seq, status, status_detail: status === "approved" ? "accredited" : "cc_rejected_other_reason", transaction_amount: amount, currency_id: pref.items[0].currency_id ?? "ARS", external_reference: pref.external_reference, metadata: pref.metadata ?? {}, date_approved: status === "approved" ? new Date().toISOString() : null, date_created: new Date().toISOString(), operation_type: "regular_payment", preference_id: pref.id };
    } else if (b.preapproval_id) {
      const pa = preapprovals.get(b.preapproval_id);
      if (!pa) return json(res, 404, { message: "suscripción inexistente" });
      if (b.authorize) pa.status = "authorized";
      pay = { id: ++seq, status, status_detail: status === "approved" ? "accredited" : "cc_rejected_insufficient_amount", transaction_amount: pa.auto_recurring.transaction_amount, currency_id: pa.auto_recurring.currency_id ?? "ARS", external_reference: pa.external_reference, metadata: { preapproval_id: pa.id }, date_approved: status === "approved" ? new Date().toISOString() : null, date_created: new Date().toISOString(), operation_type: "recurring_payment", preapproval_id: pa.id };
      if (b.authorize) setTimeout(() => webhook("subscription_preapproval", pa.id), 20);
    } else return json(res, 400, { message: "preference_id o preapproval_id" });
    payments.set(pay.id, pay);
    stats.payments++;
    await webhook("payment", pay.id);
    if (b.duplicate) await webhook("payment", pay.id);
    return json(res, 200, pay);
  }
  json(res, 404, { message: `no encontrado: ${p}` });
}).listen(PORT, () => console.log(`Simulador de Mercado Pago en http://localhost:${PORT}`));
