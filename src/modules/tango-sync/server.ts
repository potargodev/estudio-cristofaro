import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { invoices, organizations, tango_conflicts, tango_documents, tango_links, tango_norm_rules, tango_records } from "@/db/schema";
import { audit } from "@/lib/audit";
import { decrypt, encrypt } from "@/lib/crypto";
import { TANGO_PROCESS } from "@/lib/integrations/tango/constants";
import { getMapping, pick } from "@/lib/integrations/tango/mapping";
import { CBTE_TYPES } from "@/modules/arca/config";
import { applyRules, normKey, suggest } from "./normalize";

// Tango en los dos sentidos (principios §14), contra la API de Tango (hoy el
// simulador de mocks/tango). Una sola verdad:
//   · De Faro a Tango: lo que se factura en Faro se escribe en Tango por la
//     API con los nombres estándar (bandeja de salida con reintentos).
//   · De Tango a Faro: webhooks si la versión los ofrece; si no, sondeo
//     periódico. Lo que llega se normaliza y se guarda con su original.
// Cada comprobante sabe dónde nació, su ID en el otro sistema y cuándo se
// sincronizó. Si algo no coincide queda en conflicto para una persona: nunca
// se pisan datos en silencio. Todo sigue funcionando con archivos (export).

export class TangoSyncError extends Error {}

const db = () => getDb();
const UUID = /^[0-9a-f-]{36}$/i;
const PROCESS = TANGO_PROCESS.comprobantesVenta;
type Actor = { id: string; email?: string | null; studioId: string };
type TangoDoc = typeof tango_documents.$inferSelect;

// ── Enlace ───────────────────────────────────────────────────────────

export async function getLink(studioId: string) {
  const [l] = await db().select().from(tango_links).where(eq(tango_links.studio_id, studioId));
  return l ?? null;
}

export async function saveLink(actor: Actor, input: { apiUrl: string; token?: string; companyId?: string; webhookSecret?: string; writeEnabled: boolean }) {
  const url = input.apiUrl.trim().replace(/\/+$/, "");
  if (!/^https?:\/\/[^\s]+$/.test(url)) throw new TangoSyncError("Revisá la URL de la API de Tango.");
  const current = await getLink(actor.studioId);
  if (!current && !input.token?.trim()) throw new TangoSyncError("Cargá el token de la API.");
  const values = {
    api_url: url,
    company_id: input.companyId?.trim() || current?.company_id || "1",
    token_enc: input.token?.trim() ? encrypt(input.token.trim()) : current!.token_enc,
    webhook_secret_enc: input.webhookSecret?.trim() ? encrypt(input.webhookSecret.trim()) : (current?.webhook_secret_enc ?? null),
    write_enabled: input.writeEnabled,
    status: "activo",
    last_error: null,
  };
  if (current) await db().update(tango_links).set(values).where(eq(tango_links.id, current.id));
  else await db().insert(tango_links).values({ studio_id: actor.studioId, created_by: actor.id, ...values });
  await audit({ studioId: actor.studioId, actor, action: "tango.enlace", entityType: "integracion", metadata: { url, escritura: input.writeEnabled } });
}

async function call(link: typeof tango_links.$inferSelect, method: string, path: string, body?: unknown) {
  const r = await fetch(`${link.api_url}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ApiAuthorization: decrypt(link.token_enc), Company: link.company_id },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const j = (await r.json().catch(() => null)) as { succeeded?: boolean; message?: string; resultData?: Record<string, unknown> } | null;
  if (!r.ok || !j?.succeeded) {
    const e = new TangoSyncError(j?.message || `Tango respondió ${r.status}`);
    (e as TangoSyncError & { status: number }).status = r.status;
    throw e;
  }
  return j.resultData ?? {};
}

/** Registrar el aviso (webhook) en Tango. Si la versión no los ofrece, queda la sincronización periódica */
export async function registerWebhook(actor: Actor, callbackUrl: string) {
  const link = await getLink(actor.studioId);
  if (!link?.webhook_secret_enc) throw new TangoSyncError("Cargá primero el secreto de los webhooks.");
  try {
    await call(link, "POST", "/Api/Webhooks", { url: callbackUrl, secret: decrypt(link.webhook_secret_enc) });
    await db().update(tango_links).set({ webhooks: true }).where(eq(tango_links.id, link.id));
    await audit({ studioId: actor.studioId, actor, action: "tango.webhook", entityType: "integracion", metadata: { ok: true } });
    return true;
  } catch (e) {
    await db().update(tango_links).set({ webhooks: false }).where(eq(tango_links.id, link.id));
    await audit({ studioId: actor.studioId, actor, action: "tango.webhook", entityType: "integracion", result: "error", metadata: { motivo: (e as Error).message } });
    return false;
  }
}

// ── Normalización: reglas con revisión humana ────────────────────────

async function approvedRules(studioId: string, field: "cliente" | "cuenta" | "categoria") {
  return db().select({ raw_key: tango_norm_rules.raw_key, standard: tango_norm_rules.standard }).from(tango_norm_rules).where(and(eq(tango_norm_rules.studio_id, studioId), eq(tango_norm_rules.field, field), eq(tango_norm_rules.status, "aprobada")));
}

/** Sugerencias automáticas a partir de lo que llegó de Tango (clientes, comprobantes y categorías) */
export async function suggestRules(actor: Actor) {
  const studioId = actor.studioId;
  const [clients, docs] = await Promise.all([
    db().select({ raw: tango_records.raw }).from(tango_records).where(and(eq(tango_records.studio_id, studioId), eq(tango_records.process, TANGO_PROCESS.clientes))).limit(5000),
    db().select({ customer: tango_documents.customer_raw, category: tango_documents.category_raw }).from(tango_documents).where(eq(tango_documents.studio_id, studioId)).limit(5000),
  ]);
  const mapping = getMapping(null);
  const names = [...clients.map((c) => pick(c.raw, mapping.name) ?? ""), ...docs.map((d) => d.customer)];
  const cats = docs.map((d) => d.category ?? "").filter(Boolean);
  let n = 0;
  for (const [field, list] of [["cliente", suggest(names)], ["categoria", suggest(cats)]] as const) {
    for (const s of list) {
      const [row] = await db().insert(tango_norm_rules).values({ studio_id: studioId, field, raw_key: s.key, examples: s.variants.slice(0, 8), standard: s.standard, status: "sugerida", origin: "auto" }).onConflictDoNothing().returning({ id: tango_norm_rules.id });
      if (row) n++;
    }
  }
  await audit({ studioId, actor, action: "tango.normalizacion_sugerida", entityType: "integracion", metadata: { nuevas: n } });
  return n;
}

export async function listRules(studioId: string) {
  return db().select().from(tango_norm_rules).where(eq(tango_norm_rules.studio_id, studioId)).orderBy(asc(tango_norm_rules.status), asc(tango_norm_rules.field), asc(tango_norm_rules.standard));
}

/** Una persona aprueba (con el nombre que quiera), rechaza o carga una regla a mano */
export async function reviewRule(actor: Actor, id: string, decision: "aprobada" | "rechazada", standard?: string) {
  if (!UUID.test(id)) throw new TangoSyncError("Regla inválida.");
  const [r] = await db().select().from(tango_norm_rules).where(and(eq(tango_norm_rules.id, id), eq(tango_norm_rules.studio_id, actor.studioId)));
  if (!r) throw new TangoSyncError("No encontramos esa regla.");
  const std = (standard ?? r.standard).trim().slice(0, 160);
  if (decision === "aprobada" && std.length < 2) throw new TangoSyncError("Escribí el nombre estándar.");
  await db().update(tango_norm_rules).set({ status: decision, standard: std, reviewed_by: actor.id, reviewed_at: new Date() }).where(eq(tango_norm_rules.id, r.id));
  if (decision === "aprobada") await reapply(actor.studioId);
  await audit({ studioId: actor.studioId, actor, action: decision === "aprobada" ? "tango.regla_aprobada" : "tango.regla_rechazada", entityType: "regla_tango", entityId: r.id, metadata: { campo: r.field, ejemplos: r.examples, estandar: std } });
}

export async function addRule(actor: Actor, field: string, raw: string, standard: string) {
  if (!["cliente", "cuenta", "categoria"].includes(field)) throw new TangoSyncError("Campo inválido.");
  const key = normKey(raw);
  if (!key || standard.trim().length < 2) throw new TangoSyncError("Completá cómo viene y cómo tiene que quedar.");
  await db()
    .insert(tango_norm_rules)
    .values({ studio_id: actor.studioId, field, raw_key: key, examples: [raw.trim()], standard: standard.trim().slice(0, 160), status: "aprobada", origin: "manual", reviewed_by: actor.id, reviewed_at: new Date() })
    .onConflictDoUpdate({ target: [tango_norm_rules.studio_id, tango_norm_rules.field, tango_norm_rules.raw_key], set: { standard: standard.trim().slice(0, 160), status: "aprobada", reviewed_by: actor.id, reviewed_at: new Date() } });
  await reapply(actor.studioId);
  await audit({ studioId: actor.studioId, actor, action: "tango.regla_manual", entityType: "regla_tango", metadata: { campo: field, original: raw, estandar: standard } });
}

/** Al aprobar una regla, lo normalizado se recalcula desde el original (que nunca se toca) */
async function reapply(studioId: string) {
  const [clients, cats] = await Promise.all([approvedRules(studioId, "cliente"), approvedRules(studioId, "categoria")]);
  const docs = await db().select({ id: tango_documents.id, c: tango_documents.customer_raw, k: tango_documents.category_raw }).from(tango_documents).where(eq(tango_documents.studio_id, studioId));
  for (const d of docs) await db().update(tango_documents).set({ customer_std: applyRules(d.c, clients), category_std: d.k ? applyRules(d.k, cats) : null }).where(eq(tango_documents.id, d.id));
}

// ── De Faro a Tango ──────────────────────────────────────────────────

const fullNumber = (pos: number, n: number | null) => `${String(pos).padStart(5, "0")}-${String(n ?? 0).padStart(8, "0")}`;

/** Un comprobante autorizado en Faro entra en la bandeja de salida (una sola vez) */
export async function enqueueInvoice(studioId: string, invoiceId: string) {
  const link = await getLink(studioId);
  if (!link || !link.write_enabled || link.status === "pausado") return null;
  const [inv] = await db().select().from(invoices).where(and(eq(invoices.id, invoiceId), eq(invoices.studio_id, studioId)));
  if (!inv || inv.status !== "autorizada") return null;
  const [rules] = await Promise.all([approvedRules(studioId, "cliente")]);
  const [row] = await db()
    .insert(tango_documents)
    .values({ studio_id: studioId, organization_id: inv.organization_id, origin: "faro", invoice_id: inv.id, company_id: link.company_id, doc_type: CBTE_TYPES[inv.cbte_type]?.label ?? String(inv.cbte_type), number: fullNumber(inv.point_of_sale, inv.number), date: inv.issue_date, customer_raw: inv.customer_name, customer_std: applyRules(inv.customer_name, rules), customer_cuit: inv.customer_doc_number, total: inv.total, currency: inv.currency === "PES" ? "ARS" : inv.currency, status: "pendiente" })
    .onConflictDoNothing()
    .returning();
  return row ?? null;
}

const toTango = (d: TangoDoc) => ({ TIPO_COMP: d.doc_type, N_COMP: d.number, FECHA_EMIS: d.date, RAZON_SOCI: d.customer_std, CUIT: d.customer_cuit, CATEGORIA: d.category_std, IMPORTE_TOTAL: Number(d.total), MONEDA: d.currency, ORIGEN: "Faro" });

/** Bandeja de salida: escribe en Tango lo pendiente, con reintentos y sin duplicar */
export async function pushPending(studioId?: string) {
  const rows = await db()
    .select()
    .from(tango_documents)
    .where(and(eq(tango_documents.origin, "faro"), inArray(tango_documents.status, ["pendiente", "error"]), lte(tango_documents.attempts, 5), studioId ? eq(tango_documents.studio_id, studioId) : undefined))
    .orderBy(asc(tango_documents.created_at))
    .limit(100);
  let sent = 0;
  for (const d of rows) {
    const link = await getLink(d.studio_id);
    if (!link || !link.write_enabled || link.status === "pausado") continue;
    try {
      const r = await call(link, "POST", `/Api/Create?process=${PROCESS}`, toTango(d));
      await db().update(tango_documents).set({ status: "sincronizado", external_id: String(r.ID_GVA12 ?? ""), raw: r, synced_at: new Date(), last_error: null, attempts: d.attempts + 1 }).where(eq(tango_documents.id, d.id));
      sent++;
    } catch (e) {
      const status = (e as { status?: number }).status;
      // Ya existe en Tango: no se pisa ni se duplica, queda para que lo mire una persona
      const conflict = status === 409;
      await db().update(tango_documents).set({ status: conflict ? "conflicto" : "error", last_error: (e as Error).message.slice(0, 300), attempts: d.attempts + 1 }).where(eq(tango_documents.id, d.id));
      if (conflict) await db().insert(tango_conflicts).values({ studio_id: d.studio_id, document_id: d.id, fields: [{ field: "comprobante", faro: d.number, tango: (e as Error).message }] });
    }
  }
  return sent;
}

// ── De Tango a Faro ──────────────────────────────────────────────────

const fieldsOf = (raw: Record<string, unknown>) => ({
  doc_type: String(raw.TIPO_COMP ?? "Comprobante"),
  number: String(raw.N_COMP ?? ""),
  date: String(raw.FECHA_EMIS ?? new Date().toISOString().slice(0, 10)).slice(0, 10),
  customer_raw: String(raw.RAZON_SOCI ?? "").trim() || "Sin nombre",
  customer_cuit: raw.CUIT ? String(raw.CUIT).replace(/\D/g, "") : null,
  category_raw: raw.CATEGORIA ? String(raw.CATEGORIA) : null,
  total: Number(raw.IMPORTE_TOTAL ?? 0).toFixed(2),
  currency: String(raw.MONEDA ?? "ARS"),
});

/**
 * Lo que llega de Tango (por webhook o sondeo). Nuevo: se guarda normalizado
 * y con el original. Ya conocido: si cambió algo que importa respecto de lo
 * que Faro tiene, queda en conflicto (no se pisa).
 */
async function ingestFromTango(studioId: string, raw: Record<string, unknown>) {
  const ext = String(raw.ID_GVA12 ?? "");
  if (!ext) return "sin_id";
  const f = fieldsOf(raw);
  const [existing] = await db().select().from(tango_documents).where(and(eq(tango_documents.studio_id, studioId), eq(tango_documents.external_id, ext)));
  const [clients, cats] = await Promise.all([approvedRules(studioId, "cliente"), approvedRules(studioId, "categoria")]);
  if (!existing) {
    // ¿Es un comprobante que salió de Faro y todavía no tiene su ID? Se vincula por número
    const [byNumber] = await db().select().from(tango_documents).where(and(eq(tango_documents.studio_id, studioId), eq(tango_documents.number, f.number), isNull(tango_documents.external_id)));
    if (byNumber) {
      await db().update(tango_documents).set({ external_id: ext, raw, synced_at: new Date(), status: Number(byNumber.total) === Number(f.total) ? "sincronizado" : "conflicto" }).where(eq(tango_documents.id, byNumber.id));
      return "vinculado";
    }
    await db()
      .insert(tango_documents)
      .values({ studio_id: studioId, origin: "tango", external_id: ext, company_id: raw.Company ? String(raw.Company) : null, ...f, customer_std: applyRules(f.customer_raw, clients), category_std: f.category_raw ? applyRules(f.category_raw, cats) : null, raw, status: "sincronizado", synced_at: new Date() })
      .onConflictDoNothing();
    return "nuevo";
  }
  const diffs: { field: string; faro: unknown; tango: unknown }[] = [];
  if (Number(existing.total) !== Number(f.total)) diffs.push({ field: "total", faro: Number(existing.total), tango: Number(f.total) });
  if (normKey(existing.customer_raw) !== normKey(f.customer_raw) && normKey(existing.customer_std) !== normKey(f.customer_raw)) diffs.push({ field: "cliente", faro: existing.customer_raw, tango: f.customer_raw });
  if (existing.date !== f.date) diffs.push({ field: "fecha", faro: existing.date, tango: f.date });
  if (!diffs.length) {
    await db().update(tango_documents).set({ synced_at: new Date() }).where(eq(tango_documents.id, existing.id));
    return "igual";
  }
  await db().update(tango_documents).set({ status: "conflicto", synced_at: new Date() }).where(eq(tango_documents.id, existing.id));
  await db().insert(tango_conflicts).values({ studio_id: studioId, document_id: existing.id, fields: diffs, tango_raw: raw });
  await audit({ studioId, actorLabel: "Tango", action: "tango.conflicto", entityType: "comprobante_tango", entityId: existing.id, metadata: { campos: diffs.map((x) => x.field) } });
  return "conflicto";
}

/** Webhook firmado: valida la firma con el secreto del estudio */
export async function handleWebhook(linkId: string, body: string, signature: string | null) {
  if (!UUID.test(linkId)) return { status: 404 as const };
  const [link] = await db().select().from(tango_links).where(eq(tango_links.id, linkId));
  if (!link?.webhook_secret_enc) return { status: 404 as const };
  const expected = `sha256=${createHmac("sha256", decrypt(link.webhook_secret_enc)).update(body).digest("hex")}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(signature ?? "");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    await audit({ studioId: link.studio_id, actorLabel: "Tango", action: "tango.webhook_rechazado", entityType: "integracion", result: "denegado", ip: null });
    return { status: 401 as const };
  }
  let payload: { event?: string; data?: Record<string, unknown> };
  try {
    payload = JSON.parse(body);
  } catch {
    return { status: 400 as const };
  }
  if (!payload.data || !/^comprobante\./.test(payload.event ?? "")) return { status: 202 as const, result: "ignorado" };
  const result = await ingestFromTango(link.studio_id, payload.data);
  return { status: 200 as const, result };
}

/** Sincronización periódica (cuando la versión no ofrece webhooks, o como respaldo) */
export async function pollTango(studioId: string) {
  const link = await getLink(studioId);
  if (!link || link.status === "pausado") return 0;
  const since = link.last_poll_at?.toISOString();
  try {
    const r = await call(link, "GET", `/Api/Get?process=${PROCESS}${since ? `&desde=${encodeURIComponent(since)}` : ""}`);
    const list = (r.list as Record<string, unknown>[] | undefined) ?? [];
    for (const raw of list) await ingestFromTango(studioId, raw);
    await db().update(tango_links).set({ last_poll_at: new Date(), last_error: null, status: "activo" }).where(eq(tango_links.id, link.id));
    return list.length;
  } catch (e) {
    await db().update(tango_links).set({ last_error: (e as Error).message.slice(0, 300) }).where(eq(tango_links.id, link.id));
    return 0;
  }
}

/** Tarea periódica: bandeja de salida y sondeo de los enlaces sin webhooks */
export async function runTangoJobs() {
  const sent = await pushPending();
  const links = await db().select({ studio: tango_links.studio_id, webhooks: tango_links.webhooks }).from(tango_links).where(eq(tango_links.status, "activo"));
  let polled = 0;
  for (const l of links) if (!l.webhooks) polled += await pollTango(l.studio);
  return { sent, polled };
}

// ── Conflictos: los resuelve una persona ─────────────────────────────

export async function openConflicts(studioId: string) {
  return db().select({ c: tango_conflicts, d: tango_documents }).from(tango_conflicts).innerJoin(tango_documents, eq(tango_documents.id, tango_conflicts.document_id)).where(and(eq(tango_conflicts.studio_id, studioId), eq(tango_conflicts.status, "abierto"))).orderBy(desc(tango_conflicts.created_at));
}

/**
 * Quedarse con lo de Faro (se vuelve a escribir en Tango) o con lo de Tango
 * (se actualiza el registro de Faro desde el original de Tango). Un
 * comprobante autorizado por ARCA no se modifica nunca: solo su espejo.
 */
export async function resolveConflict(actor: Actor, id: string, keep: "faro" | "tango") {
  if (!UUID.test(id)) throw new TangoSyncError("Conflicto inválido.");
  const [r] = await db().select({ c: tango_conflicts, d: tango_documents }).from(tango_conflicts).innerJoin(tango_documents, eq(tango_documents.id, tango_conflicts.document_id)).where(and(eq(tango_conflicts.id, id), eq(tango_conflicts.studio_id, actor.studioId)));
  if (!r) throw new TangoSyncError("No encontramos ese conflicto.");
  if (r.c.status !== "abierto") throw new TangoSyncError("Ya está resuelto.");
  if (keep === "tango") {
    if (r.c.tango_raw) {
      const f = fieldsOf(r.c.tango_raw as Record<string, unknown>);
      const clients = await approvedRules(actor.studioId, "cliente");
      await db().update(tango_documents).set({ ...f, customer_std: applyRules(f.customer_raw, clients), raw: r.c.tango_raw, status: "sincronizado", synced_at: new Date() }).where(eq(tango_documents.id, r.d.id));
    } else await db().update(tango_documents).set({ status: "sincronizado" }).where(eq(tango_documents.id, r.d.id));
  } else {
    const link = await getLink(actor.studioId);
    if (!link) throw new TangoSyncError("No hay enlace con Tango.");
    if (r.d.external_id) await call(link, "PUT", `/Api/Update?process=${PROCESS}&id=${encodeURIComponent(r.d.external_id)}`, toTango(r.d));
    await db().update(tango_documents).set({ status: "sincronizado", synced_at: new Date() }).where(eq(tango_documents.id, r.d.id));
  }
  await db().update(tango_conflicts).set({ status: "resuelto", resolution: keep, resolved_by: actor.id, resolved_at: new Date() }).where(eq(tango_conflicts.id, r.c.id));
  await audit({ studioId: actor.studioId, actor, action: "tango.conflicto_resuelto", entityType: "comprobante_tango", entityId: r.d.id, metadata: { se_queda: keep, campos: r.c.fields.map((x) => x.field) } });
}

export async function documentsFor(studioId: string, limit = 100) {
  return db().select({ d: tango_documents, org: organizations.name }).from(tango_documents).leftJoin(organizations, eq(organizations.id, tango_documents.organization_id)).where(eq(tango_documents.studio_id, studioId)).orderBy(desc(tango_documents.created_at)).limit(limit);
}

export async function syncCounts(studioId: string) {
  const rows = await db().select({ status: tango_documents.status, origin: tango_documents.origin, n: sql<number>`count(*)::int` }).from(tango_documents).where(eq(tango_documents.studio_id, studioId)).groupBy(tango_documents.status, tango_documents.origin);
  return rows;
}

// ── Archivos: exportación con nombres estándar (sin API) ─────────────

const csvCell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV para importar en Tango a mano (mismo orden de columnas que la escritura por API) */
export async function exportCsv(studioId: string) {
  const rows = await db().select().from(tango_documents).where(eq(tango_documents.studio_id, studioId)).orderBy(asc(tango_documents.date));
  const head = ["TIPO_COMP", "N_COMP", "FECHA_EMIS", "RAZON_SOCI", "CUIT", "CATEGORIA", "IMPORTE_TOTAL", "MONEDA", "ORIGEN", "ID_TANGO", "SINCRONIZADO"];
  const lines = rows.map((d) => [d.doc_type, d.number, d.date, d.customer_std, d.customer_cuit, d.category_std, Number(d.total).toFixed(2), d.currency, d.origin, d.external_id, d.synced_at?.toISOString() ?? ""].map(csvCell).join(";"));
  return `${head.join(";")}\n${lines.join("\n")}\n`;
}
