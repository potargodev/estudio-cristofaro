import "server-only";
import { emitEvent } from "@/modules/flows/events";
import { createHash } from "node:crypto";
import { generateText } from "ai";
import { and, desc, eq, gte, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { accounting_expenses, documents, smart_documents } from "@/db/schema";
import { audit } from "@/lib/audit";
import { budgetBlock, languageModel, recordUsage, resolveModel } from "@/lib/ai/models";
import { estimateCost } from "@/lib/ai/pricing";
import { checkLimit, hasModule } from "@/lib/faro/entitlements";
import { checkUpload, readStored, storeUpload } from "@/lib/uploads";
import { CBTE_TYPES } from "@/modules/arca/config";
import { loadCredential } from "@/modules/arca/credentials";
import { getPersona } from "@/modules/arca/padron";
import { constatar } from "@/modules/arca/wscdc";
import { categoryByHint, createEntry } from "@/modules/bitacora/server";
import { costUsd, getPlatformAi, isConfigured, platformModel } from "@/modules/copilot/platform";
import { EXTRACTION_SCHEMA, exportRow, fingerprint, lowFields, normalize, overallConfidence, suggestAccount, validate, type Extraction, type ExportRow, type Validation } from "./core";
import { UUID } from "@/lib/ids";

// Lectura inteligente (smart_docs): lee facturas, tickets y extractos con un
// modelo con visión, valida (CUIT, CAE y totales, contra ARCA si está
// configurado), detecta duplicados y deja todo en "Para confirmar". Nada
// cuenta hasta que una persona lo confirma. El alcance (DocScope) lo arma
// cada página después de validar la sesión; acá cada query vuelve a filtrar
// por estudio y organización (o por la persona, en la Bitácora).

const db = () => getDb();
export class SmartDocError extends Error {}

export interface DocScope {
  studioId: string;
  organizationId: string | null;
  /** Bitácora: la persona dueña del ticket */
  ownerUserId: string | null;
  scope: "organizacion" | "personal" | "bitacora";
  /** Puede confirmar o descartar (el portal solo sube y mira) */
  canConfirm: boolean;
}
type Actor = { id: string; email: string };
export type SmartDoc = typeof smart_documents.$inferSelect;

function where(s: DocScope) {
  const base = [eq(smart_documents.studio_id, s.studioId), eq(smart_documents.scope, s.scope)];
  if (s.scope === "bitacora") return and(...base, eq(smart_documents.owner_user_id, s.ownerUserId ?? "00000000-0000-0000-0000-000000000000"));
  return and(...base, s.organizationId ? eq(smart_documents.organization_id, s.organizationId) : isNull(smart_documents.organization_id));
}

/** Modelo para leer: el de extracción del estudio o, si no tiene, la IA de la plataforma */
async function pickModel(studioId: string) {
  const own = await resolveModel(studioId, "extraccion");
  if (own) return { kind: "estudio" as const, own, label: own.model, providerLabel: own.provider.kind };
  const p = await getPlatformAi();
  if (isConfigured(p)) return { kind: "plataforma" as const, p, label: p.model_primary!, providerLabel: `plataforma:${p.provider}` };
  return null;
}

export async function availability(studioId: string) {
  const [module, model] = await Promise.all([hasModule(studioId, "smart_docs"), pickModel(studioId)]);
  return { module, model: !!model, ready: module && !!model };
}

const PROMPT = (fileName: string) =>
  `LECTURA_INTELIGENTE · archivo: ${fileName.replace(/\s+/g, "_")}
Leé este comprobante argentino (factura, ticket, nota de crédito/débito o extracto) y respondé SOLO un JSON con estas claves:
tipo_documento (factura|ticket|nota_credito|nota_debito|extracto|otro), cuit_emisor (11 dígitos), razon_social_emisor, cuit_receptor, letra (A|B|C|E|M|X), codigo_comprobante (código de ARCA: 1 Factura A, 6 Factura B, 11 Factura C, 3/8/13 notas de crédito…), punto_venta, numero, fecha (AAAA-MM-DD), moneda (ARS|USD), neto_gravado, no_gravado, exento, iva (lista de {alicuota, importe}), percepciones (lista de {concepto, importe}), total, cae (14 dígitos), vencimiento_cae (AAAA-MM-DD), confianza (objeto con la confianza de 0 a 1 de cada campo que completaste).
Importes como números con punto decimal. Si un dato no está, usá null. No inventes.`;

async function callModel(studioId: string, userId: string | null, fileName: string, data: Uint8Array, mediaType: string) {
  const m = await pickModel(studioId);
  if (!m) throw new SmartDocError("No hay un modelo de IA configurado para la lectura inteligente.");
  const block = await budgetBlock(studioId);
  if (block) throw new SmartDocError(block);
  const content = [{ type: "text" as const, text: PROMPT(fileName) }, mediaType === "application/pdf" ? { type: "file" as const, data, mediaType } : { type: "image" as const, image: data, mediaType }];
  const r = await generateText({ model: m.kind === "estudio" ? languageModel(m.own.provider, m.own.model) : platformModel(m.p, m.p.model_primary!), maxRetries: 1, timeout: 60000, maxOutputTokens: 1200, messages: [{ role: "user", content }] });
  const inputTokens = r.usage.inputTokens ?? 0;
  const outputTokens = r.usage.outputTokens ?? 0;
  let cost: number | null = null;
  if (m.kind === "estudio") {
    await recordUsage({ studioId, provider: m.own.provider, model: m.own.model, task: "extraccion", userId, inputTokens, outputTokens });
    cost = estimateCost(m.own.model, inputTokens, outputTokens);
  } else cost = costUsd(m.p, inputTokens, outputTokens);
  return { text: r.text, model: m.label, provider: m.providerLabel, inputTokens, outputTokens, cost };
}

/** Validación contra ARCA (padrón y constatación del CAE), si Faro tiene el certificado cargado */
async function arcaCheck(e: Extraction): Promise<Validation["arca"]> {
  let cred;
  try {
    cred = await loadCredential();
  } catch {
    return undefined;
  }
  const out: NonNullable<Validation["arca"]> = { consultado_at: new Date().toISOString() };
  if (e.cuit_emisor?.length === 11) {
    try {
      const p = await getPersona(cred, e.cuit_emisor);
      out.cuit = p.data.status.toUpperCase().includes("ACTIVO") || !p.data.status ? "activo" : "inexistente";
    } catch (err) {
      out.cuit = /no existe|no tiene datos/i.test((err as Error).message) ? "inexistente" : "error";
    }
  }
  if (e.cae && e.cuit_emisor && e.codigo_comprobante && e.punto_venta != null && e.numero != null && e.fecha && e.total != null) {
    try {
      const r = await constatar(cred, { cuitEmisor: e.cuit_emisor, cbteTipo: e.codigo_comprobante, ptoVta: e.punto_venta, nro: e.numero, fecha: e.fecha, total: e.total, cae: e.cae, docNroReceptor: e.cuit_receptor ?? undefined });
      out.cae = r.approved ? "autorizado" : "no_encontrado";
    } catch {
      out.cae = "error";
    }
  }
  return out;
}

/** Cuenta que se usó antes para el mismo CUIT en este alcance */
async function accountHistory(s: DocScope) {
  const rows = await db().select({ e: smart_documents.extracted, a: smart_documents.account }).from(smart_documents).where(and(where(s), eq(smart_documents.status, "confirmado"), isNotNull(smart_documents.account))).orderBy(desc(smart_documents.confirmed_at)).limit(300);
  const m = new Map<string, string>();
  for (const r of rows) {
    const c = (r.e as { cuit_emisor?: string } | null)?.cuit_emisor;
    if (c && r.a && !m.has(c)) m.set(c, r.a);
  }
  return m;
}

/** Procesa un documento ya guardado: modelo → normalización → validaciones → duplicados */
async function process(s: DocScope, row: SmartDoc, actor: Actor, data: Uint8Array) {
  let ai;
  try {
    ai = await callModel(s.studioId, actor.id, row.file_name, data, row.mime_type);
  } catch (err) {
    const msg = err instanceof SmartDocError ? err.message : "No pudimos leer el documento. Probá de nuevo o cargalo a mano.";
    await db().update(smart_documents).set({ status: "error", error: msg, synced_at: new Date() }).where(eq(smart_documents.id, row.id));
    return { ...row, status: "error", error: msg };
  }
  const usage = { model: ai.model, provider: ai.provider, input_tokens: ai.inputTokens, output_tokens: ai.outputTokens, cost_usd: ai.cost == null ? null : String(ai.cost), raw: { text: ai.text }, synced_at: new Date() };
  const json = ai.text.match(/\{[\s\S]*\}/)?.[0];
  let parsed: Extraction | null = null;
  try {
    const r = json ? EXTRACTION_SCHEMA.safeParse(JSON.parse(json)) : null;
    parsed = r?.success ? normalize(r.data) : null;
  } catch {
    parsed = null;
  }
  if (!parsed) {
    const [u] = await db().update(smart_documents).set({ ...usage, status: "error", error: "El modelo no devolvió datos legibles. Revisá que el archivo sea un comprobante." }).where(eq(smart_documents.id, row.id)).returning();
    return u;
  }
  const v = validate(parsed);
  v.arca = await arcaCheck(parsed);
  if (v.arca?.cuit === "inexistente") v.mensajes.push("ARCA no tiene registrado el CUIT del emisor.");
  if (v.arca?.cae === "no_encontrado") v.mensajes.push("ARCA no encontró un comprobante con ese CAE y esos datos.");
  const fp = fingerprint(parsed);
  const [dup] = fp ? await db().select({ id: smart_documents.id }).from(smart_documents).where(and(where(s), eq(smart_documents.fingerprint, fp), ne(smart_documents.id, row.id), inArray(smart_documents.status, ["para_confirmar", "confirmado"]))).limit(1) : [];
  const history = await accountHistory(s);
  const [u] = await db()
    .update(smart_documents)
    .set({ ...usage, status: "para_confirmar", kind: parsed.tipo_documento, extracted: parsed as unknown as Record<string, unknown>, confidence: String(overallConfidence(parsed)), low_fields: lowFields(parsed), validation: v as unknown as Record<string, unknown>, fingerprint: fp, duplicate_of: dup?.id ?? null, account: suggestAccount(parsed, history), error: null })
    .where(eq(smart_documents.id, row.id))
    .returning();
  if (s.scope !== "bitacora") await emitEvent(s.studioId, "documento.leido", { documento_id: row.id, organizacion_id: s.organizationId, emisor: parsed.razon_social_emisor, total: parsed.total, tipo: parsed.tipo_documento, repetido: !!dup }, row.id);
  await audit({ studioId: s.studioId, organizationId: s.organizationId, actor, action: "lectura.leido", entityType: "documento_leido", entityId: row.id, metadata: { archivo: row.file_name, modelo: ai.model, duplicado: !!dup, costo_usd: ai.cost } });
  return u;
}

async function guardRead(s: DocScope) {
  if (!(await hasModule(s.studioId, "smart_docs"))) throw new SmartDocError("La lectura inteligente no está incluida en el plan.");
  const limit = await checkLimit(s.studioId, "smartDocsPerMonth");
  if (limit) throw new SmartDocError(limit);
}

/** Sube un archivo y lo lee (o reusa la lectura si es exactamente el mismo archivo) */
export async function readUpload(s: DocScope, actor: Actor, file: File, source: "subida" | "portal" | "vigia" | "whatsapp" = "subida") {
  const check = await checkUpload(file);
  if (!check.ok) throw new SmartDocError(check.error);
  const data = new Uint8Array(await file.arrayBuffer());
  const sha256 = createHash("sha256").update(data).digest("hex");
  const [same] = await db().select().from(smart_documents).where(and(where(s), eq(smart_documents.sha256, sha256), inArray(smart_documents.status, ["para_confirmar", "confirmado"]))).limit(1);
  const stored = await storeUpload(file, s.studioId, s.organizationId ?? `bitacora-${s.ownerUserId}`);
  const base = { studio_id: s.studioId, organization_id: s.organizationId, owner_user_id: s.ownerUserId, scope: s.scope, storage_path: stored.storagePath, file_name: stored.name, mime_type: stored.mimeType, size_bytes: stored.sizeBytes, sha256, source, created_by: actor.id };
  if (same) {
    // Mismo archivo: no se manda otra vez al modelo
    const [row] = await db().insert(smart_documents).values({ ...base, status: "para_confirmar", kind: same.kind, extracted: same.extracted, confidence: same.confidence, low_fields: same.low_fields, validation: same.validation, fingerprint: same.fingerprint, duplicate_of: same.id, account: same.account, raw: same.raw, synced_at: new Date() }).returning();
    return row;
  }
  await guardRead(s);
  const [row] = await db().insert(smart_documents).values(base).returning();
  return process(s, row, actor, data);
}

/** Lee un documento que ya está en Documentos (de la misma organización) */
export async function readExisting(s: DocScope, actor: Actor, documentId: string) {
  if (!s.organizationId || !UUID.test(documentId)) throw new SmartDocError("Documento inválido.");
  const [doc] = await db().select().from(documents).where(and(eq(documents.id, documentId), eq(documents.studio_id, s.studioId), eq(documents.organization_id, s.organizationId)));
  if (!doc) throw new SmartDocError("No encontramos ese documento.");
  const [already] = await db().select().from(smart_documents).where(and(where(s), eq(smart_documents.document_id, doc.id), ne(smart_documents.status, "descartado"))).limit(1);
  if (already) return already;
  const mime = doc.mime_type ?? "";
  if (!["application/pdf", "image/jpeg", "image/png"].includes(mime)) throw new SmartDocError("Solo se leen PDF y fotos (JPG o PNG).");
  await guardRead(s);
  const { data } = await readStored(doc.storage_path);
  const sha256 = createHash("sha256").update(data).digest("hex");
  const [row] = await db().insert(smart_documents).values({ studio_id: s.studioId, organization_id: s.organizationId, scope: s.scope, document_id: doc.id, storage_path: doc.storage_path, file_name: doc.name, mime_type: mime, size_bytes: doc.size_bytes ?? data.length, sha256, source: "documentos", created_by: actor.id }).returning();
  return process(s, row, actor, new Uint8Array(data));
}

export async function listDocs(s: DocScope, status?: string[]) {
  return db()
    .select()
    .from(smart_documents)
    .where(and(where(s), status?.length ? inArray(smart_documents.status, status) : undefined))
    .orderBy(desc(smart_documents.created_at))
    .limit(200);
}

export async function getDoc(s: DocScope, id: string) {
  if (!UUID.test(id)) return null;
  const [d] = await db().select().from(smart_documents).where(and(where(s), eq(smart_documents.id, id)));
  return d ?? null;
}

/** Uso y costo de IA de la lectura en el mes (de todo el estudio) */
export async function monthCost(studioId: string) {
  const ar = new Date(Date.now() - 3 * 3600_000);
  const first = new Date(Date.UTC(ar.getUTCFullYear(), ar.getUTCMonth(), 1, 3));
  const [r] = await db().select({ n: sql<number>`count(*)::int`, usd: sql<string>`coalesce(sum(${smart_documents.cost_usd}), 0)` }).from(smart_documents).where(and(eq(smart_documents.studio_id, studioId), gte(smart_documents.created_at, first), isNotNull(smart_documents.model)));
  return { docs: r.n, usd: Number(r.usd) };
}

const num = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s.replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

/** Correcciones de la persona sobre lo extraído (los campos de FIELDS) */
export function corrections(e: Extraction, fd: FormData): Extraction {
  const str = (k: string) => String(fd.get(k) ?? "").trim() || null;
  const int = (k: string) => {
    const n = num(fd.get(k));
    return n == null ? null : Math.trunc(n);
  };
  return normalize({
    ...e,
    cuit_emisor: str("cuit_emisor"),
    razon_social_emisor: str("razon_social_emisor"),
    codigo_comprobante: int("codigo_comprobante"),
    punto_venta: int("punto_venta"),
    numero: int("numero"),
    fecha: str("fecha"),
    neto_gravado: num(fd.get("neto_gravado")),
    no_gravado: num(fd.get("no_gravado")),
    exento: num(fd.get("exento")),
    total: num(fd.get("total")),
    cae: str("cae"),
    vencimiento_cae: str("vencimiento_cae"),
    // Lo que la persona revisó pasa a confianza 1
    confianza: Object.fromEntries(Object.keys(e.confianza ?? {}).map((k) => [k, 1])),
  });
}

/**
 * Confirma: guarda las correcciones y la cuenta, y lo pasa a donde va
 * (gastos de la organización o de la actividad, o un gasto de la Bitácora).
 */
export async function confirmDoc(s: DocScope, actor: Actor, id: string, edited: Extraction, account: string, opts: { allowDuplicate?: boolean } = {}) {
  if (!s.canConfirm) throw new SmartDocError("No tenés permiso para confirmar documentos.");
  const d = await getDoc(s, id);
  if (!d || d.status !== "para_confirmar") throw new SmartDocError("Ese documento ya no está para confirmar.");
  if (d.duplicate_of && !opts.allowDuplicate) throw new SmartDocError("Parece repetido: confirmalo igual solo si es otro comprobante.");
  if (edited.total == null || !(edited.total > 0) || !edited.fecha) throw new SmartDocError("Faltan la fecha o el total.");
  const v = validate(edited);
  v.arca = (d.validation as Validation | null)?.arca;
  const label = [edited.razon_social_emisor ?? "Comprobante", edited.codigo_comprobante && CBTE_TYPES[edited.codigo_comprobante] ? `${CBTE_TYPES[edited.codigo_comprobante].short} ${String(edited.punto_venta ?? 0).padStart(5, "0")}-${String(edited.numero ?? 0).padStart(8, "0")}` : null].filter(Boolean).join(" · ");
  const amount = Math.round(edited.total * 100);
  const sign = edited.tipo_documento === "nota_credito" ? -1 : 1;
  let targetId: string | null = null;
  if (s.scope === "bitacora") {
    const cat = await categoryByHint(s.ownerUserId!, account, "gasto");
    const e = await createEntry(s.ownerUserId!, { kind: "gasto", amount, currency: edited.moneda, date: edited.fecha, categoryId: cat?.id ?? null, description: (edited.razon_social_emisor ?? "Ticket").slice(0, 140), paymentMethod: null, note: "Leído con lectura inteligente" });
    targetId = (e as { id: string }).id;
  } else {
    const [x] = await db()
      .insert(accounting_expenses)
      .values({ studio_id: s.studioId, organization_id: s.organizationId, source: "lectura", source_id: d.id, description: `${account}: ${label}`.slice(0, 200), amount: amount * sign, currency: edited.moneda, date: edited.fecha, category: "otros", deductible: (edited.iva ?? []).length > 0, receipt_path: d.storage_path, receipt_name: d.file_name, receipt_mime: d.mime_type })
      .onConflictDoNothing()
      .returning({ id: accounting_expenses.id });
    targetId = x?.id ?? null;
  }
  await db()
    .update(smart_documents)
    .set({ status: "confirmado", extracted: edited as unknown as Record<string, unknown>, validation: v as unknown as Record<string, unknown>, fingerprint: fingerprint(edited), low_fields: [], account: account.slice(0, 60), confirmed_by: actor.id, confirmed_at: new Date(), target_id: targetId })
    .where(eq(smart_documents.id, d.id));
  if (s.scope !== "bitacora") await emitEvent(s.studioId, "documento.confirmado", { documento_id: d.id, organizacion_id: s.organizationId, emisor: edited.razon_social_emisor, total: edited.total, cuenta: account }, d.id);
  await audit({ studioId: s.studioId, organizationId: s.organizationId, actor, action: "lectura.confirmado", entityType: "documento_leido", entityId: d.id, metadata: { total: edited.total, cuenta: account, cuit: edited.cuit_emisor } });
}

export async function discardDoc(s: DocScope, actor: Actor, id: string) {
  if (!s.canConfirm) throw new SmartDocError("No tenés permiso para descartar documentos.");
  const d = await getDoc(s, id);
  if (!d || d.status === "confirmado") return;
  await db().update(smart_documents).set({ status: "descartado" }).where(eq(smart_documents.id, d.id));
  await audit({ studioId: s.studioId, organizationId: s.organizationId, actor, action: "lectura.descartado", entityType: "documento_leido", entityId: d.id });
}

/** Filas confirmadas para exportar, del período pedido */
export async function exportData(s: DocScope, from?: string, to?: string): Promise<{ rows: ExportRow[]; ids: string[] }> {
  const docs = await db().select().from(smart_documents).where(and(where(s), eq(smart_documents.status, "confirmado"))).orderBy(smart_documents.created_at);
  const out = docs
    .map((d) => ({ d, e: d.extracted as unknown as Extraction }))
    .filter(({ e }) => e?.fecha && (!from || e.fecha >= from) && (!to || e.fecha <= to));
  return { rows: out.map(({ d, e }) => exportRow(e, d.account ?? "Otros gastos")), ids: out.map(({ d }) => d.id) };
}

export async function markExported(ids: string[]) {
  if (ids.length) await db().update(smart_documents).set({ exported_at: new Date() }).where(inArray(smart_documents.id, ids));
}
