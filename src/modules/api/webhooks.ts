import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { and, asc, desc, eq, lte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { webhook_deliveries, webhook_endpoints } from "@/db/schema";
import { audit } from "@/lib/audit";
import { decrypt, encrypt } from "@/lib/crypto";
import { isUuid } from "@/lib/ids";
import { assertPublicUrl, safeFetch } from "@/lib/safe-fetch";
import { isWebhookEvent, nextAttempt, signWebhook } from "./core";

// Webhooks salientes (§2.p, B9): cada evento de Faro (los mismos de los
// flujos) se manda firmado a las URL que el tenant suscribe. Entrega con
// reintentos (1, 5, 30 min, 2 y 12 h), una sola vez por evento y destino, y
// nunca hacia la red interna (safeFetch).

const db = () => getDb();
export class WebhookError extends Error {}
type Actor = { id: string; email: string };

export async function createEndpoint(studioId: string, actor: Actor, i: { url: string; events: string[] }) {
  const url = i.url.trim();
  if (!/^https:\/\//i.test(url) && process.env.ALLOW_PRIVATE_URLS !== "true") throw new WebhookError("La URL tiene que empezar con https://.");
  try {
    await assertPublicUrl(url);
  } catch {
    throw new WebhookError("Esa URL no es pública: Faro no manda webhooks a redes internas.");
  }
  const events = [...new Set(i.events.filter(isWebhookEvent))];
  if (!events.length) throw new WebhookError("Elegí al menos un evento.");
  const secret = `whsec_${randomBytes(24).toString("base64url")}`;
  const [row] = await db().insert(webhook_endpoints).values({ studio_id: studioId, url: url.slice(0, 500), secret_enc: encrypt(secret), events, created_by: actor.id }).returning();
  await audit({ studioId, actor, action: "api.webhook_crear", entityType: "webhook", entityId: row.id, metadata: { url: row.url, eventos: events } });
  return { secret, row };
}

export async function listEndpoints(studioId: string) {
  const eps = await db().select().from(webhook_endpoints).where(eq(webhook_endpoints.studio_id, studioId)).orderBy(desc(webhook_endpoints.created_at));
  const recent = await db().select().from(webhook_deliveries).where(eq(webhook_deliveries.studio_id, studioId)).orderBy(desc(webhook_deliveries.created_at)).limit(30);
  return eps.map((e) => ({ ...e, secret_enc: undefined, deliveries: recent.filter((d) => d.endpoint_id === e.id).slice(0, 8) }));
}

export async function setEndpoint(studioId: string, actor: Actor, id: string, op: "pausar" | "activar" | "borrar") {
  if (!isUuid(id)) return;
  const w = and(eq(webhook_endpoints.id, id), eq(webhook_endpoints.studio_id, studioId));
  if (op === "borrar") await db().delete(webhook_endpoints).where(w);
  else await db().update(webhook_endpoints).set({ active: op === "activar" }).where(w);
  await audit({ studioId, actor, action: `api.webhook_${op}`, entityType: "webhook", entityId: id });
}

/** Encola el evento para cada destino suscripto (lo llama emitEvent) */
export async function enqueueWebhooks(studioId: string, event: string, payload: Record<string, unknown>, dedupeKey: string) {
  if (!isWebhookEvent(event)) return 0;
  const eps = await db().select({ id: webhook_endpoints.id }).from(webhook_endpoints).where(and(eq(webhook_endpoints.studio_id, studioId), eq(webhook_endpoints.active, true), sql`${event} = any(${webhook_endpoints.events})`));
  if (!eps.length) return 0;
  const body = { id: randomUUID(), evento: event, creado: new Date().toISOString(), datos: payload };
  const r = await db()
    .insert(webhook_deliveries)
    .values(eps.map((e) => ({ endpoint_id: e.id, studio_id: studioId, event, dedupe_key: `${event}:${dedupeKey}`, payload: body })))
    .onConflictDoNothing()
    .returning({ id: webhook_deliveries.id });
  return r.length;
}

/** Evento de prueba a un destino (lo pide una persona desde la pantalla) */
export async function sendTest(studioId: string, actor: Actor, id: string) {
  if (!isUuid(id)) throw new WebhookError("Webhook inválido.");
  const [e] = await db().select().from(webhook_endpoints).where(and(eq(webhook_endpoints.id, id), eq(webhook_endpoints.studio_id, studioId)));
  if (!e) throw new WebhookError("No encontramos ese webhook.");
  const dedupe = `prueba:${randomUUID()}`;
  const [d] = await db().insert(webhook_deliveries).values({ endpoint_id: e.id, studio_id: studioId, event: "prueba", dedupe_key: dedupe, payload: { id: randomUUID(), evento: "prueba", creado: new Date().toISOString(), datos: { mensaje: "Evento de prueba de Faro" } } }).returning();
  await audit({ studioId, actor, action: "api.webhook_prueba", entityType: "webhook", entityId: e.id });
  return deliver(d.id);
}

async function deliver(id: string) {
  const [d] = await db().select({ d: webhook_deliveries, e: webhook_endpoints }).from(webhook_deliveries).innerJoin(webhook_endpoints, eq(webhook_endpoints.id, webhook_deliveries.endpoint_id)).where(eq(webhook_deliveries.id, id));
  if (!d || d.d.status !== "pendiente") return d?.d.status ?? "no_existe";
  const body = JSON.stringify(d.d.payload);
  const attempts = d.d.attempts + 1;
  let status: number | null = null;
  let error: string | null = null;
  try {
    const r = await safeFetch(d.e.url, { method: "POST", headers: { "Content-Type": "application/json", "User-Agent": "Faro-Webhooks/1", "X-Faro-Event": d.d.event, "X-Faro-Delivery": d.d.id, "X-Faro-Signature": signWebhook(decrypt(d.e.secret_enc), body) }, body, signal: AbortSignal.timeout(10_000) });
    status = r.status;
    if (!r.ok) error = `Respondió ${r.status}`;
  } catch (e) {
    error = (e as Error).message.slice(0, 200);
  }
  const next = error ? nextAttempt(attempts) : null;
  const final = !error ? "entregado" : next ? "pendiente" : "fallido";
  await db().update(webhook_deliveries).set({ status: final, attempts, last_status: status, last_error: error, delivered_at: error ? null : new Date(), next_attempt_at: next ?? new Date() }).where(eq(webhook_deliveries.id, id));
  return final;
}

/** Tarea interna: entrega lo pendiente que ya toca */
export async function deliverWebhooks(max = 100) {
  const due = await db().select({ id: webhook_deliveries.id }).from(webhook_deliveries).where(and(eq(webhook_deliveries.status, "pendiente"), lte(webhook_deliveries.next_attempt_at, new Date()))).orderBy(asc(webhook_deliveries.next_attempt_at)).limit(max);
  const out = { entregados: 0, reintentos: 0, fallidos: 0 };
  for (const x of due) {
    const r = await deliver(x.id);
    if (r === "entregado") out.entregados++;
    else if (r === "fallido") out.fallidos++;
    else out.reintentos++;
  }
  return out;
}
