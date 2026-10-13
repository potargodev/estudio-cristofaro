import "server-only";
import { createHash, randomBytes, randomInt } from "node:crypto";
import { and, desc, eq, gte, inArray, isNotNull, isNull, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { documents, memberships, organizations, request_messages, requests, users, webhook_events, whatsapp_accounts, whatsapp_contacts, whatsapp_messages, whatsapp_templates } from "@/db/schema";
import { audit } from "@/lib/audit";
import { decrypt, encrypt } from "@/lib/crypto";
import { hasModule } from "@/lib/faro/entitlements";
import { can, type Permission } from "@/lib/permissions";
import { storeUpload } from "@/lib/uploads";
import { emitEvent } from "@/modules/flows/events";
import { advances, maskPhone, normalizePhone, paramCount, parseWebhook, renderTemplate, verifySignature, type InboundMessage } from "./core";
import { UUID } from "@/lib/ids";

// WhatsApp Business Cloud API (módulo whatsapp, plan Avanzado). Faro tiene su
// número (Faro Manager) y cada estudio usa ese número compartido o conecta el
// suyo (Configuración → Avanzado). Los avisos salen solo con plantillas
// aprobadas por Meta y solo a números verificados con un código; lo que
// escriben los clientes entra como solicitud o, si es un comprobante, a la
// Lectura inteligente. Todo mensaje queda con fuente, ID externo, fecha,
// validación de la firma y el registro original.

export class WhatsAppError extends Error {}
type WaAccount = typeof whatsapp_accounts.$inferSelect;
type Actor = { id: string; email: string };
const db = () => getDb();
const API = () => (process.env.WHATSAPP_API_URL?.trim() || "https://graph.facebook.com/v21.0").replace(/\/+$/, "");
const hash = (s: string) => createHash("sha256").update(s).digest("hex");

// ───────────── Cuentas ─────────────

export async function platformAccount() {
  const [a] = await db().select().from(whatsapp_accounts).where(isNull(whatsapp_accounts.studio_id)).limit(1);
  return a ?? null;
}
export async function studioRow(studioId: string) {
  const [a] = await db().select().from(whatsapp_accounts).where(eq(whatsapp_accounts.studio_id, studioId));
  return a ?? null;
}
const ready = (a: WaAccount | null): a is WaAccount => !!a && a.status === "activa" && !!a.phone_number_id && !!a.access_token_enc;

/** Cuenta con la que sale un estudio: la propia o, si eligió compartida, la de Faro */
export async function accountFor(studioId: string) {
  if (!(await hasModule(studioId, "whatsapp"))) return null;
  const own = await studioRow(studioId);
  if (!own || own.status !== "activa") return null;
  if (own.mode === "propio") return ready(own) ? own : null;
  const p = await platformAccount();
  return ready(p) ? p : null;
}

interface AccountInput {
  phoneNumberId: string;
  wabaId: string;
  displayPhone: string;
  accessToken: string | null;
  appSecret: string | null;
}

/** Guarda la cuenta de Faro (studioId null) o la propia del estudio. Token y secreto, cifrados. */
export async function saveAccount(actor: Actor, studioId: string | null, mode: "propio" | "compartido", i: AccountInput | null) {
  if (studioId && !(await hasModule(studioId, "whatsapp"))) throw new WhatsAppError("WhatsApp viene con el plan Avanzado.");
  const current = studioId ? await studioRow(studioId) : await platformAccount();
  let v: Partial<typeof whatsapp_accounts.$inferInsert> = { mode, status: "activa", updated_by: actor.id, last_error: null };
  if (mode === "propio") {
    if (!i || !/^\d{6,20}$/.test(i.phoneNumberId.trim())) throw new WhatsAppError("Poné el Phone number ID (son solo números, está en Meta → WhatsApp → Configuración de la API).");
    if (!/^\d{6,20}$/.test(i.wabaId.trim())) throw new WhatsAppError("Poné el ID de la cuenta de WhatsApp Business (WABA).");
    if (!current?.access_token_enc && !i.accessToken) throw new WhatsAppError("Pegá el token de acceso permanente.");
    if (!current?.app_secret_enc && !i.appSecret) throw new WhatsAppError("Pegá el secreto de la app (para validar los webhooks).");
    v = {
      ...v,
      phone_number_id: i.phoneNumberId.trim(),
      waba_id: i.wabaId.trim(),
      display_phone: i.displayPhone.trim().slice(0, 30) || null,
      ...(i.accessToken ? { access_token_enc: encrypt(i.accessToken.trim()) } : {}),
      ...(i.appSecret ? { app_secret_enc: encrypt(i.appSecret.trim()) } : {}),
      verify_token: current?.verify_token ?? randomBytes(16).toString("hex"),
    };
  } else if (!studioId) throw new WhatsAppError("El número de Faro tiene que ser propio.");
  if (current) await db().update(whatsapp_accounts).set(v).where(eq(whatsapp_accounts.id, current.id));
  else await db().insert(whatsapp_accounts).values({ ...v, studio_id: studioId });
  await audit({ studioId, actor, action: "whatsapp.cuenta", entityType: "whatsapp", entityId: studioId ?? "faro", metadata: { modo: mode, telefono: v.display_phone ?? null, token_nuevo: !!i?.accessToken } });
  const saved = studioId ? await studioRow(studioId) : await platformAccount();
  if (saved && mode === "propio") await syncTemplates(saved).catch(() => undefined);
  return saved;
}

export async function pauseAccount(actor: Actor, studioId: string | null) {
  const a = studioId ? await studioRow(studioId) : await platformAccount();
  if (!a) return;
  await db().update(whatsapp_accounts).set({ status: a.status === "activa" ? "pausada" : "activa", updated_by: actor.id }).where(eq(whatsapp_accounts.id, a.id));
  await audit({ studioId, actor, action: "whatsapp.cuenta", entityType: "whatsapp", entityId: studioId ?? "faro", metadata: { estado: a.status === "activa" ? "pausada" : "activa" } });
}

async function graph(a: WaAccount, path: string, init?: RequestInit) {
  const r = await fetch(`${API()}/${path}`, { ...init, headers: { Authorization: `Bearer ${decrypt(a.access_token_enc!)}`, "Content-Type": "application/json", ...(init?.headers ?? {}) }, signal: AbortSignal.timeout(15000) });
  const body = (await r.json().catch(() => ({}))) as { error?: { message?: string } } & Record<string, unknown>;
  if (!r.ok) throw new WhatsAppError(body.error?.message ?? `WhatsApp respondió ${r.status}`);
  return body;
}

/** Trae las plantillas de Meta (con su estado de aprobación) */
export async function syncTemplates(a: WaAccount) {
  if (!ready(a) || !a.waba_id) throw new WhatsAppError("La cuenta no está completa.");
  try {
    const r = (await graph(a, `${a.waba_id}/message_templates?limit=100`)) as { data?: { id: string; name: string; language: string; category?: string; status: string; components?: { type: string; text?: string }[] }[] };
    for (const t of r.data ?? []) {
      const body = t.components?.find((c) => c.type === "BODY")?.text ?? "";
      const v = { account_id: a.id, name: t.name, language: t.language, category: t.category ?? null, body, params: paramCount(body), status: t.status, external_id: t.id, synced_at: new Date(), raw: t };
      await db().insert(whatsapp_templates).values(v).onConflictDoUpdate({ target: [whatsapp_templates.account_id, whatsapp_templates.name, whatsapp_templates.language], set: v });
    }
    await db().update(whatsapp_accounts).set({ last_error: null }).where(eq(whatsapp_accounts.id, a.id));
    return r.data?.length ?? 0;
  } catch (e) {
    await db().update(whatsapp_accounts).set({ last_error: (e as Error).message.slice(0, 300) }).where(eq(whatsapp_accounts.id, a.id));
    throw e;
  }
}

export async function templatesOf(accountId: string) {
  return db().select().from(whatsapp_templates).where(eq(whatsapp_templates.account_id, accountId)).orderBy(whatsapp_templates.name);
}

// ───────────── Envío ─────────────

interface SendInput {
  phone: string;
  template: string;
  params: string[];
  organizationId?: string | null;
  entity?: { type: string; id: string } | null;
  batchId?: string | null;
}

/** Envía una plantilla aprobada y deja el mensaje registrado */
async function sendTemplate(studioId: string | null, a: WaAccount, i: SendInput) {
  const [t] = await db().select().from(whatsapp_templates).where(and(eq(whatsapp_templates.account_id, a.id), eq(whatsapp_templates.name, i.template)));
  const base = { studio_id: studioId, organization_id: i.organizationId ?? null, account_id: a.id, direction: "saliente", phone: i.phone, kind: "plantilla", template: i.template, entity_type: i.entity?.type ?? null, entity_id: i.entity?.id ?? null, batch_id: i.batchId ?? null, validation: "firma_ok" };
  if (!t || t.status !== "APPROVED") {
    const [m] = await db().insert(whatsapp_messages).values({ ...base, body: null, status: "fallido", error: t ? "La plantilla todavía no está aprobada por Meta." : "La plantilla no existe en la cuenta (sincronizá las plantillas)." }).returning();
    return m;
  }
  const params = i.params.slice(0, t.params).map((p) => p.replace(/\s+/g, " ").slice(0, 300));
  const payload = { messaging_product: "whatsapp", to: i.phone, type: "template", template: { name: t.name, language: { code: t.language }, components: params.length ? [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }] : [] } };
  try {
    const r = (await graph(a, `${a.phone_number_id}/messages`, { method: "POST", body: JSON.stringify(payload) })) as { messages?: { id: string }[] };
    const [m] = await db().insert(whatsapp_messages).values({ ...base, body: renderTemplate(t.body, params), status: "enviado", external_id: r.messages?.[0]?.id ?? null, raw: { request: payload, response: r } }).returning();
    return m;
  } catch (e) {
    const [m] = await db().insert(whatsapp_messages).values({ ...base, body: renderTemplate(t.body, params), status: "fallido", error: (e as Error).message.slice(0, 300), raw: { request: payload } }).returning();
    return m;
  }
}

/**
 * A4: un documento compartido por la API de WhatsApp (plantilla
 * «faro_documento»: título, link y vencimiento). Solo si el estudio tiene la
 * cuenta activa; si no, quien envía usa el enlace wa.me.
 */
export async function sendDocument(studioId: string, i: { phone: string; title: string; url: string; expires: string; organizationId: string | null; linkId: string; batchId: string | null }) {
  const a = await accountFor(studioId);
  if (!a) return null;
  return sendTemplate(studioId, a, { phone: i.phone, template: "faro_documento", params: [i.title, i.url, i.expires], organizationId: i.organizationId, entity: { type: "share_link", id: i.linkId }, batchId: i.batchId });
}

/** Respuesta de texto libre (solo dentro de las 24 h desde el último mensaje del contacto) */
async function sendText(studioId: string | null, a: WaAccount, phone: string, body: string, organizationId: string | null) {
  const payload = { messaging_product: "whatsapp", to: phone, type: "text", text: { body } };
  try {
    const r = (await graph(a, `${a.phone_number_id}/messages`, { method: "POST", body: JSON.stringify(payload) })) as { messages?: { id: string }[] };
    await db().insert(whatsapp_messages).values({ studio_id: studioId, organization_id: organizationId, account_id: a.id, direction: "saliente", phone, kind: "texto", body, status: "enviado", external_id: r.messages?.[0]?.id ?? null, validation: "firma_ok", raw: { request: payload, response: r } });
  } catch (e) {
    await db().insert(whatsapp_messages).values({ studio_id: studioId, organization_id: organizationId, account_id: a.id, direction: "saliente", phone, kind: "texto", body, status: "fallido", error: (e as Error).message.slice(0, 300), validation: "firma_ok" });
  }
}

type ClientEventKind = "documento" | "vencimientos" | "respuesta";
const EVENT_PERMISSION: Record<ClientEventKind, Permission> = { documento: "documentos.ver", vencimientos: "vencimientos.ver", respuesta: "solicitudes.ver" };

/**
 * Avisos al cliente por WhatsApp (además del mail): a los miembros con número
 * verificado, que aceptaron avisos y con permiso para ver eso. No es una
 * comunicación sensible: es el mismo aviso que sale por mail.
 */
export async function notifyOrgWhatsApp(studioId: string, organizationId: string, kind: ClientEventKind, detail: string) {
  const a = await accountFor(studioId);
  if (!a) return 0;
  const rows = await db()
    .select({ phone: whatsapp_contacts.phone, name: users.name, role: memberships.role })
    .from(whatsapp_contacts)
    .innerJoin(memberships, and(eq(memberships.user_id, whatsapp_contacts.user_id), eq(memberships.organization_id, whatsapp_contacts.organization_id), eq(memberships.status, "activa")))
    .innerJoin(users, eq(users.id, whatsapp_contacts.user_id))
    .where(and(eq(whatsapp_contacts.studio_id, studioId), eq(whatsapp_contacts.organization_id, organizationId), isNotNull(whatsapp_contacts.verified_at), eq(whatsapp_contacts.opt_in_avisos, true)));
  let n = 0;
  for (const r of rows.filter((x) => can(x.role, EVENT_PERMISSION[kind]))) {
    const first = r.name.split(" ")[0] || r.name;
    const m =
      kind === "respuesta"
        ? await sendTemplate(studioId, a, { phone: r.phone, template: "faro_respuesta_solicitud", params: [first, detail], organizationId })
        : await sendTemplate(studioId, a, { phone: r.phone, template: "faro_aviso_general", params: [first, detail], organizationId });
    if (m.status === "enviado") n++;
  }
  return n;
}

/**
 * Aviso a una persona (el resumen de una rutina del Agente contable): a sus
 * números verificados que aceptaron avisos. Devuelve cuántos salieron.
 */
export async function notifyUserWhatsApp(studioId: string, userId: string, detail: string) {
  const a = await accountFor(studioId);
  if (!a) return 0;
  const rows = await db()
    .select({ phone: whatsapp_contacts.phone, name: users.name, org: whatsapp_contacts.organization_id })
    .from(whatsapp_contacts)
    .innerJoin(users, eq(users.id, whatsapp_contacts.user_id))
    .where(and(eq(whatsapp_contacts.studio_id, studioId), eq(whatsapp_contacts.user_id, userId), isNotNull(whatsapp_contacts.verified_at), eq(whatsapp_contacts.opt_in_avisos, true)));
  let n = 0;
  for (const r of rows) {
    const m = await sendTemplate(studioId, a, { phone: r.phone, template: "faro_aviso_general", params: [r.name.split(" ")[0] || r.name, detail], organizationId: r.org });
    if (m.status === "enviado") n++;
  }
  return n;
}

// ───────────── Contactos (verificación con código) ─────────────

type Member = { id: string; email: string; studioId: string; organizationId: string };

export async function contactOf(m: Member) {
  const [c] = await db().select().from(whatsapp_contacts).where(and(eq(whatsapp_contacts.organization_id, m.organizationId), eq(whatsapp_contacts.user_id, m.id), eq(whatsapp_contacts.studio_id, m.studioId)));
  return c ?? null;
}

/** El cliente carga su número y le mandamos un código por WhatsApp */
export async function startVerification(m: Member, input: string) {
  const a = await accountFor(m.studioId);
  if (!a) throw new WhatsAppError("Tu estudio todavía no activó WhatsApp.");
  const phone = normalizePhone(input);
  if (!phone) throw new WhatsAppError("Revisá el número: código de área y número, sin el 0 ni el 15 (ej.: 11 2233 4455).");
  const current = await contactOf(m);
  if (current?.code_expires_at && current.code_expires_at.getTime() - 9 * 60_000 > Date.now()) throw new WhatsAppError("Ya te mandamos un código hace menos de un minuto. Esperá un poco para pedir otro.");
  const code = String(randomInt(100000, 1000000));
  const v = { phone, code_hash: hash(`${m.id}:${code}`), code_expires_at: new Date(Date.now() + 10 * 60_000), attempts: 0, verified_at: null };
  if (current) await db().update(whatsapp_contacts).set(v).where(eq(whatsapp_contacts.id, current.id));
  else await db().insert(whatsapp_contacts).values({ ...v, studio_id: m.studioId, organization_id: m.organizationId, user_id: m.id });
  const sent = await sendTemplate(m.studioId, a, { phone, template: "faro_codigo", params: [code], organizationId: m.organizationId, entity: { type: "verificacion", id: m.id } });
  await audit({ studioId: m.studioId, organizationId: m.organizationId, actor: m, action: "whatsapp.codigo", entityType: "whatsapp_contacto", entityId: m.id, result: sent.status === "enviado" ? "ok" : "error", metadata: { telefono: maskPhone(phone) } });
  if (sent.status !== "enviado") throw new WhatsAppError("No pudimos mandar el código por WhatsApp. Probá más tarde.");
  return maskPhone(phone);
}

export async function confirmVerification(m: Member, code: string) {
  const c = await contactOf(m);
  if (!c?.code_hash || !c.code_expires_at) throw new WhatsAppError("Pedí un código primero.");
  if (c.attempts >= 5) throw new WhatsAppError("Probaste demasiadas veces. Pedí un código nuevo.");
  if (c.code_expires_at.getTime() < Date.now()) throw new WhatsAppError("El código venció. Pedí uno nuevo.");
  if (hash(`${m.id}:${code.trim()}`) !== c.code_hash) {
    await db().update(whatsapp_contacts).set({ attempts: c.attempts + 1 }).where(eq(whatsapp_contacts.id, c.id));
    throw new WhatsAppError("El código no coincide.");
  }
  await db().update(whatsapp_contacts).set({ verified_at: new Date(), code_hash: null, code_expires_at: null, attempts: 0 }).where(eq(whatsapp_contacts.id, c.id));
  await audit({ studioId: m.studioId, organizationId: m.organizationId, actor: m, action: "whatsapp.verificado", entityType: "whatsapp_contacto", entityId: m.id, metadata: { telefono: maskPhone(c.phone) } });
}

export async function setOptIn(m: Member, on: boolean) {
  const c = await contactOf(m);
  if (!c) return;
  await db().update(whatsapp_contacts).set({ opt_in_avisos: on }).where(eq(whatsapp_contacts.id, c.id));
  await audit({ studioId: m.studioId, organizationId: m.organizationId, actor: m, action: "whatsapp.avisos", entityType: "whatsapp_contacto", entityId: m.id, metadata: { avisos: on } });
}

export async function removeContact(m: Member) {
  const c = await contactOf(m);
  if (!c) return;
  await db().delete(whatsapp_contacts).where(eq(whatsapp_contacts.id, c.id));
  await audit({ studioId: m.studioId, organizationId: m.organizationId, actor: m, action: "whatsapp.quitado", entityType: "whatsapp_contacto", entityId: m.id });
}

// ───────────── Webhook (lo que llega de Meta) ─────────────

/** Verificación de la suscripción del webhook (GET con hub.verify_token) */
export async function webhookChallenge(token: string | null) {
  if (!token) return false;
  const [a] = await db().select({ id: whatsapp_accounts.id }).from(whatsapp_accounts).where(eq(whatsapp_accounts.verify_token, token));
  return !!a;
}

async function logEvent(account: string, topic: string, dataId: string | null, ok: boolean, result: string, error: string | null, raw: unknown) {
  await db().insert(webhook_events).values({ provider: "whatsapp", account, topic, data_id: dataId, signature_ok: ok, result, error, raw: raw as object });
}

/** Contacto verificado para un número que escribió a una cuenta */
async function senderOf(a: WaAccount, phone: string) {
  const studios = a.studio_id
    ? [a.studio_id]
    : (await db().select({ id: whatsapp_accounts.studio_id }).from(whatsapp_accounts).where(and(eq(whatsapp_accounts.mode, "compartido"), eq(whatsapp_accounts.status, "activa"), isNotNull(whatsapp_accounts.studio_id)))).map((r) => r.id!);
  if (!studios.length) return null;
  const [c] = await db()
    .select({ c: whatsapp_contacts, email: users.email, name: users.name, org: organizations.name, role: memberships.role })
    .from(whatsapp_contacts)
    .innerJoin(users, and(eq(users.id, whatsapp_contacts.user_id), eq(users.active, true)))
    .innerJoin(organizations, and(eq(organizations.id, whatsapp_contacts.organization_id), ne(organizations.status, "baja")))
    .innerJoin(memberships, and(eq(memberships.user_id, whatsapp_contacts.user_id), eq(memberships.organization_id, whatsapp_contacts.organization_id), eq(memberships.status, "activa")))
    .where(and(eq(whatsapp_contacts.phone, phone), isNotNull(whatsapp_contacts.verified_at), inArray(whatsapp_contacts.studio_id, studios)))
    .orderBy(desc(whatsapp_contacts.verified_at))
    .limit(1);
  return c ?? null;
}

async function downloadMedia(a: WaAccount, mediaId: string) {
  const meta = (await graph(a, mediaId)) as { url?: string; mime_type?: string };
  if (!meta.url) throw new WhatsAppError("WhatsApp no devolvió el archivo.");
  const r = await fetch(meta.url, { headers: { Authorization: `Bearer ${decrypt(a.access_token_enc!)}` }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new WhatsAppError(`No se pudo bajar el archivo (${r.status}).`);
  const data = Buffer.from(await r.arrayBuffer());
  if (data.length > 10 * 1024 * 1024) throw new WhatsAppError("El archivo supera los 10 MB.");
  return { data, mime: meta.mime_type ?? "application/octet-stream" };
}

const EXT: Record<string, string> = { "image/jpeg": ".jpg", "image/png": ".png", "application/pdf": ".pdf" };

async function handleInbound(a: WaAccount, m: InboundMessage, ok: boolean) {
  const [dupe] = await db().select({ id: whatsapp_messages.id }).from(whatsapp_messages).where(eq(whatsapp_messages.external_id, m.id));
  if (dupe) return "repetido";
  const sender = await senderOf(a, m.from);
  const kind = m.type;
  const base = { account_id: a.id, direction: "entrante", phone: m.from, kind, body: m.text, media_mime: m.mime, external_id: m.id, validation: ok ? "firma_ok" : "firma_invalida", raw: m.raw as object, synced_at: new Date() };
  if (!sender) {
    await db().insert(whatsapp_messages).values({ ...base, studio_id: a.studio_id, status: "sin_contacto" }).onConflictDoNothing();
    await sendText(a.studio_id, a, m.from, "Hola. Este número no está registrado en Faro. Verificalo desde tu portal (Mi cuenta → WhatsApp) y volvé a escribirnos.", null);
    return "sin_contacto";
  }
  const { c } = sender;
  const studioId = c.studio_id;
  const orgId = c.organization_id;
  const actor = { id: c.user_id, email: sender.email, name: sender.name };
  const [msg] = await db().insert(whatsapp_messages).values({ ...base, studio_id: studioId, organization_id: orgId, status: "recibido" }).onConflictDoNothing().returning();
  if (!msg) return "repetido";
  let link: { type: string; id: string } | null = null;
  let reply = "";
  if ((kind === "imagen" || kind === "documento") && m.mediaId && m.mime && EXT[m.mime]) {
    const file = await downloadMedia(a, m.mediaId);
    const name = m.filename?.replace(/[^\w.\- ]/g, "").slice(0, 80) || `whatsapp-${new Date().toISOString().slice(0, 10)}${EXT[m.mime]}`;
    const f = new File([new Uint8Array(file.data)], name.endsWith(EXT[m.mime]) ? name : `${name}${EXT[m.mime]}`, { type: m.mime });
    const smart = can(sender.role, "documentos.subir") && (await hasModule(studioId, "smart_docs"));
    if (smart) {
      const { readUpload } = await import("@/modules/smart-docs/server");
      const doc = await readUpload({ studioId, organizationId: orgId, ownerUserId: null, scope: "organizacion", canConfirm: false }, actor, f, "whatsapp");
      link = { type: "lectura", id: doc.id };
      reply = "¡Recibido! Leímos tu comprobante y el estudio lo revisa. Lo ves en tu portal.";
    } else {
      const stored = await storeUpload(f, studioId, orgId);
      const [d] = await db()
        .insert(documents)
        .values({ studio_id: studioId, organization_id: orgId, name: stored.name, storage_path: stored.storagePath, mime_type: stored.mimeType, size_bytes: stored.sizeBytes, category: "comprobantes", source: "cliente", uploaded_by: c.user_id, external_source: "whatsapp" })
        .returning({ id: documents.id });
      link = { type: "documento", id: d.id };
      reply = "¡Recibido! Guardamos el archivo en tus documentos y el estudio lo revisa.";
    }
    await db().update(whatsapp_messages).set({ media_path: null, entity_type: link.type, entity_id: link.id }).where(eq(whatsapp_messages.id, msg.id));
  } else if (kind === "texto" && m.text?.trim()) {
    // Texto: se suma a la conversación de WhatsApp abierta (7 días) o abre una solicitud nueva
    const since = new Date(Date.now() - 7 * 86400000);
    const open = (await db().select().from(requests).where(and(eq(requests.studio_id, studioId), eq(requests.organization_id, orgId), eq(requests.created_by, c.user_id), ne(requests.status, "resuelta"), gte(requests.created_at, since))).orderBy(desc(requests.created_at))).find((r) => (r.data as { canal?: string } | null)?.canal === "whatsapp");
    let requestId = open?.id;
    if (!requestId) {
      const [r] = await db().insert(requests).values({ studio_id: studioId, organization_id: orgId, type: "consulta", subject: `Mensaje por WhatsApp: ${m.text.trim().slice(0, 60)}`, data: { canal: "whatsapp" }, created_by: c.user_id }).returning({ id: requests.id });
      requestId = r.id;
      await emitEvent(studioId, "solicitud.creada", { solicitud_id: r.id, organizacion_id: orgId, tipo: "consulta", asunto: "Mensaje por WhatsApp" }, r.id);
    } else await db().update(requests).set({ status: open!.status }).where(eq(requests.id, requestId));
    await db().insert(request_messages).values({ request_id: requestId, author_id: c.user_id, from_client: true, body: m.text.trim().slice(0, 5000) });
    link = { type: "solicitud", id: requestId };
    reply = open ? "" : "¡Recibido! Le pasamos tu mensaje al estudio. La respuesta te llega a tu portal.";
    await db().update(whatsapp_messages).set({ entity_type: link.type, entity_id: link.id }).where(eq(whatsapp_messages.id, msg.id));
    const { notifyStudio } = await import("@/lib/notify");
    await notifyStudio({ kind: "solicitud", organizationId: orgId, organizationName: sender.org, subject: "Mensaje por WhatsApp", message: m.text.trim().slice(0, 1000) });
  } else {
    reply = "Por WhatsApp podemos recibir mensajes de texto, fotos y PDF de tus comprobantes.";
  }
  await audit({ studioId, organizationId: orgId, actorLabel: `WhatsApp ${maskPhone(m.from)}`, action: "whatsapp.recibido", entityType: link?.type ?? "whatsapp", entityId: link?.id ?? msg.id, metadata: { tipo: kind, firma: ok } });
  await emitEvent(studioId, "whatsapp.recibido", { mensaje_id: msg.id, organizacion_id: orgId, tipo: kind, texto: m.text ?? "" }, msg.id);
  if (reply) await sendText(studioId, a, m.from, reply, orgId);
  return "procesado";
}

/** Procesa el webhook: firma con el secreto de la cuenta del número, idempotente por ID de mensaje */
export async function handleWebhook(raw: string, signature: string | null) {
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    await logEvent("?", "invalido", null, false, "rechazado", "JSON inválido", null);
    return { status: 400 };
  }
  const { messages, statuses } = parseWebhook(body);
  const pnid = messages[0]?.phoneNumberId ?? ((body as { entry?: { changes?: { value?: { metadata?: { phone_number_id?: string } } }[] }[] }).entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id ?? null);
  const [a] = pnid ? await db().select().from(whatsapp_accounts).where(eq(whatsapp_accounts.phone_number_id, pnid)) : [];
  const accountLabel = a ? (a.studio_id ?? "faro") : "?";
  if (!a || !a.app_secret_enc) {
    await logEvent(accountLabel, "mensajes", pnid, false, "ignorado", "Número desconocido", null);
    return { status: 200 };
  }
  const ok = verifySignature(decrypt(a.app_secret_enc), raw, signature);
  if (!ok) {
    await logEvent(accountLabel, "mensajes", pnid, false, "rechazado", "Firma inválida", null);
    return { status: 401 };
  }
  for (const s of statuses) {
    const [m] = await db().select().from(whatsapp_messages).where(eq(whatsapp_messages.external_id, s.id));
    if (m && advances(m.status, s.status)) await db().update(whatsapp_messages).set({ status: s.status, error: s.error, synced_at: new Date() }).where(eq(whatsapp_messages.id, m.id));
  }
  for (const m of messages) {
    try {
      const result = await handleInbound(a, m, ok);
      await logEvent(accountLabel, `mensaje.${m.type}`, m.id, ok, result === "repetido" ? "repetido" : "procesado", null, m.raw);
    } catch (e) {
      await logEvent(accountLabel, `mensaje.${m.type}`, m.id, ok, "error", (e as Error).message.slice(0, 300), m.raw);
    }
  }
  if (!messages.length && statuses.length) await logEvent(accountLabel, "estados", statuses[0].id, ok, "procesado", null, body);
  return { status: 200 };
}

// ───────────── Consultas para pantallas ─────────────

export async function recentMessages(studioId: string | null, limit = 30) {
  return db()
    .select({ m: whatsapp_messages, org: organizations.name })
    .from(whatsapp_messages)
    .leftJoin(organizations, eq(organizations.id, whatsapp_messages.organization_id))
    .where(studioId ? eq(whatsapp_messages.studio_id, studioId) : isNull(whatsapp_messages.studio_id))
    .orderBy(desc(whatsapp_messages.created_at))
    .limit(limit);
}

/** Aviso manual a una organización (lo usa la herramienta del Vigía, que siempre pasa por Aprobaciones) */
export async function sendToOrganization(studioId: string, organizationId: string, message: string) {
  if (!UUID.test(organizationId)) throw new WhatsAppError("Organización inválida.");
  const a = await accountFor(studioId);
  if (!a) throw new WhatsAppError("El estudio no tiene WhatsApp activo.");
  const contacts = await db()
    .select({ phone: whatsapp_contacts.phone, name: users.name })
    .from(whatsapp_contacts)
    .innerJoin(organizations, and(eq(organizations.id, whatsapp_contacts.organization_id), eq(organizations.studio_id, studioId)))
    .innerJoin(users, eq(users.id, whatsapp_contacts.user_id))
    .where(and(eq(whatsapp_contacts.studio_id, studioId), eq(whatsapp_contacts.organization_id, organizationId), isNotNull(whatsapp_contacts.verified_at), eq(whatsapp_contacts.opt_in_avisos, true)));
  if (!contacts.length) throw new WhatsAppError("Nadie de esa organización verificó su WhatsApp o aceptó avisos.");
  const out = [];
  for (const c of contacts) out.push(await sendTemplate(studioId, a, { phone: c.phone, template: "faro_aviso_general", params: [c.name.split(" ")[0] || c.name, message], organizationId }));
  return { enviados: out.filter((m) => m.status === "enviado").length, fallidos: out.filter((m) => m.status !== "enviado").map((m) => m.error) };
}
