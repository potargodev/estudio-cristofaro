import "server-only";
import { emitEvent } from "@/modules/flows/events";
import { createHash } from "node:crypto";
import { generateText } from "ai";
import { and, desc, eq, gte, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { accounting_expenses, documents, invoice_settings, legal_entities, smart_batches, smart_documents, supplier_rules } from "@/db/schema";
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
import { asExtraction, EXTRACTION_SCHEMA, exportRow, fingerprint, lowFields, normalize, overallConfidence, receiverCheck, suggestAccount, validate, type Extraction, type ExportRow, type Validation } from "./core";
import { applyRule, baseDecisions, learnFrom, type Decisions, type SupplierRule } from "./learning";
import { TRATAMIENTOS, tributoKey, type Tratamiento } from "./tributos";
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
tipo_documento (factura|ticket|nota_credito|nota_debito|extracto|otro), cuit_emisor (11 dígitos), razon_social_emisor, cuit_receptor, letra (A|B|C|E|M|X), codigo_comprobante (código de ARCA: 1 Factura A, 6 Factura B, 11 Factura C, 3/8/13 notas de crédito…), punto_venta, numero, fecha (AAAA-MM-DD), moneda (ARS|USD), neto_gravado, no_gravado, exento, iva (lista de {alicuota, importe}), percepciones (lista de {concepto, importe, tipo: iva|iibb|ganancias|internos|otros, jurisdiccion: la provincia o CABA si es de ingresos brutos}; incluí impuestos internos y otros tributos que suman al total), retenciones (misma forma, si el comprobante las informa), items (lista de {descripcion, codigo (del proveedor), cantidad, precio_unitario, alicuota, importe (neto del ítem)}), total, cae (14 dígitos), vencimiento_cae (AAAA-MM-DD), confianza (objeto con la confianza de 0 a 1 de cada campo que completaste).
Importes como números con punto decimal. Si un dato no está, usá null. No inventes.`;

async function callModel(studioId: string, userId: string | null, fileName: string, data: Uint8Array, mediaType: string) {
  const m = await pickModel(studioId);
  if (!m) throw new SmartDocError("No hay un modelo de IA configurado para la lectura inteligente.");
  const block = await budgetBlock(studioId);
  if (block) throw new SmartDocError(block);
  const content = [{ type: "text" as const, text: PROMPT(fileName) }, mediaType === "application/pdf" ? { type: "file" as const, data, mediaType } : { type: "image" as const, image: data, mediaType }];
  const r = await generateText({ model: m.kind === "estudio" ? languageModel(m.own.provider, m.own.model) : platformModel(m.p, m.p.model_primary!), maxRetries: 1, timeout: 60000, maxOutputTokens: 4000, messages: [{ role: "user", content }] });
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
async function arcaCheck(e: Extraction, s: DocScope): Promise<Validation["arca"]> {
  let cred;
  try {
    const { envFor } = await import("@/modules/arca/server");
    cred = await loadCredential(await envFor(s.studioId, s.organizationId));
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

/** CUIT propias de la organización (razones sociales y datos de facturación) */
export async function ownCuits(studioId: string, organizationId: string | null) {
  if (!organizationId) return [];
  const a = await db().select({ c: legal_entities.cuit }).from(legal_entities).where(and(eq(legal_entities.organization_id, organizationId), eq(legal_entities.studio_id, studioId), isNotNull(legal_entities.cuit)));
  const b = await db().select({ c: invoice_settings.cuit }).from(invoice_settings).where(and(eq(invoice_settings.organization_id, organizationId), eq(invoice_settings.studio_id, studioId)));
  return [...new Set([...a, ...b].map((x) => x.c!).filter(Boolean))];
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

/** Regla del proveedor en este alcance (organización, cuenta personal o Bitácora) */
async function ruleFor(s: DocScope, cuit: string) {
  const [r] = await db()
    .select()
    .from(supplier_rules)
    .where(
      and(
        eq(supplier_rules.studio_id, s.studioId),
        eq(supplier_rules.scope, s.scope),
        s.organizationId ? eq(supplier_rules.organization_id, s.organizationId) : isNull(supplier_rules.organization_id),
        s.scope === "bitacora" ? eq(supplier_rules.owner_user_id, s.ownerUserId ?? "00000000-0000-0000-0000-000000000000") : isNull(supplier_rules.owner_user_id),
        eq(supplier_rules.supplier_cuit, cuit),
      ),
    );
  return r ?? null;
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
  v.arca = await arcaCheck(parsed, s);
  if (v.arca?.cuit === "inexistente") v.mensajes.push("ARCA no tiene registrado el CUIT del emisor.");
  if (v.arca?.cae === "no_encontrado") v.mensajes.push("ARCA no encontró un comprobante con ese CAE y esos datos.");
  // §2.p B8: el comprobante tiene que estar a nombre de una CUIT propia
  if (s.scope !== "bitacora") {
    v.receptor = receiverCheck(parsed.cuit_receptor, await ownCuits(s.studioId, s.organizationId));
    if (v.receptor === "otra") v.mensajes.push(`El comprobante está a nombre de otra CUIT (${parsed.cuit_receptor}): no es de esta organización o se cargó en la equivocada.`);
  }
  const fp = fingerprint(parsed);
  const [dup] = fp ? await db().select({ id: smart_documents.id }).from(smart_documents).where(and(where(s), eq(smart_documents.fingerprint, fp), ne(smart_documents.id, row.id), inArray(smart_documents.status, ["para_confirmar", "confirmado"]))).limit(1) : [];
  const history = await accountHistory(s);
  // Lo que sugiere la lectura y, encima, la regla aprendida del proveedor (§2.q)
  const base = baseDecisions(parsed, suggestAccount(parsed, history));
  const rule = parsed.cuit_emisor ? await ruleFor(s, parsed.cuit_emisor) : null;
  const applied = applyRule(parsed, base, (rule?.rule as SupplierRule | undefined) ?? null);
  const [u] = await db()
    .update(smart_documents)
    .set({
      ...usage,
      status: "para_confirmar",
      kind: parsed.tipo_documento,
      extracted: applied.extraction as unknown as Record<string, unknown>,
      confidence: String(overallConfidence(parsed)),
      low_fields: lowFields(parsed),
      validation: v as unknown as Record<string, unknown>,
      fingerprint: fp,
      duplicate_of: dup?.id ?? null,
      account: applied.decisions.account,
      decisions: applied.decisions as unknown as Record<string, unknown>,
      original: { model: parsed, modelDecisions: base, proposed: { extraction: applied.extraction, decisions: applied.decisions } } as unknown as Record<string, unknown>,
      learned: applied.learned.length ? { fields: applied.learned, ruleId: rule!.id } : null,
      supplier_cuit: parsed.cuit_emisor,
      error: null,
    })
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
export async function readUpload(s: DocScope, actor: Actor, file: File, source: "subida" | "portal" | "vigia" | "whatsapp" | "mail" | "rendicion" = "subida", opts: { targetId?: string | null; fileName?: string } = {}) {
  const check = await checkUpload(file);
  if (!check.ok) throw new SmartDocError(check.error);
  const data = new Uint8Array(await file.arrayBuffer());
  const sha256 = createHash("sha256").update(data).digest("hex");
  const [same] = await db().select().from(smart_documents).where(and(where(s), eq(smart_documents.sha256, sha256), inArray(smart_documents.status, ["para_confirmar", "confirmado"]))).limit(1);
  const stored = await storeUpload(file, s.studioId, s.organizationId ?? `bitacora-${s.ownerUserId}`);
  const base = { studio_id: s.studioId, organization_id: s.organizationId, owner_user_id: s.ownerUserId, scope: s.scope, storage_path: stored.storagePath, file_name: (opts.fileName ?? stored.name).slice(0, 200), mime_type: stored.mimeType, size_bytes: stored.sizeBytes, sha256, source, created_by: actor.id, target_id: opts.targetId ?? null };
  if (same) {
    // Mismo archivo: no se manda otra vez al modelo
    const [row] = await db().insert(smart_documents).values({ ...base, status: "para_confirmar", kind: same.kind, extracted: same.extracted, confidence: same.confidence, low_fields: same.low_fields, validation: same.validation, fingerprint: same.fingerprint, duplicate_of: same.id, account: same.account, raw: same.raw, decisions: same.decisions, original: same.original, learned: same.learned, supplier_cuit: same.supplier_cuit, synced_at: new Date() }).returning();
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
    // Alícuota de cada ítem (la regla del proveedor la aprende)
    items: e.items.map((it, i) => {
      const rate = num(fd.get(`item_alicuota_${i}`));
      return fd.has(`item_alicuota_${i}`) ? { ...it, alicuota: rate } : it;
    }),
    // Lo que la persona revisó pasa a confianza 1
    confianza: Object.fromEntries(Object.keys(e.confianza ?? {}).map((k) => [k, 1])),
  });
}

/** Decisiones del formulario: cuenta, centro de costo, concepto y tratamiento de cada tributo */
export function decisionsFrom(d: SmartDoc, e: Extraction, fd: FormData): Decisions {
  const prev = (d.decisions as unknown as Decisions | null) ?? baseDecisions(e, d.account ?? "Otros gastos");
  const treatments: Record<string, Tratamiento> = { ...prev.treatments };
  for (const p of [...e.percepciones, ...e.retenciones]) {
    const k = tributoKey(p);
    const v = String(fd.get(`tratamiento_${k}`) ?? "");
    if (v in TRATAMIENTOS) treatments[k] = v as Tratamiento;
  }
  const str = (k: string) => (fd.has(k) ? String(fd.get(k) ?? "").trim().slice(0, 80) || null : undefined);
  return {
    account: str("account") ?? prev.account,
    costCenter: str("cost_center") === undefined ? prev.costCenter : (str("cost_center") as string | null),
    concept: str("concept") === undefined ? prev.concept : (str("concept") as string | null),
    treatments,
    productLinks: prev.productLinks ?? {},
  };
}

/**
 * Confirma: guarda las correcciones y la cuenta, y lo pasa a donde va
 * (gastos de la organización o de la actividad, o un gasto de la Bitácora).
 */
export async function confirmDoc(s: DocScope, actor: Actor, id: string, edited: Extraction, account: string, opts: { allowDuplicate?: boolean; decisions?: Decisions } = {}) {
  if (!s.canConfirm) throw new SmartDocError("No tenés permiso para confirmar documentos.");
  const d = await getDoc(s, id);
  if (!d || d.status !== "para_confirmar") throw new SmartDocError("Ese documento ya no está para confirmar.");
  if (d.duplicate_of && !opts.allowDuplicate) throw new SmartDocError("Parece repetido: confirmalo igual solo si es otro comprobante.");
  if (edited.total == null || !(edited.total > 0) || !edited.fecha) throw new SmartDocError("Faltan la fecha o el total.");
  const v = validate(edited);
  v.arca = (d.validation as Validation | null)?.arca;
  v.receptor = (d.validation as Validation | null)?.receptor;
  const label = [edited.razon_social_emisor ?? "Comprobante", edited.codigo_comprobante && CBTE_TYPES[edited.codigo_comprobante] ? `${CBTE_TYPES[edited.codigo_comprobante].short} ${String(edited.punto_venta ?? 0).padStart(5, "0")}-${String(edited.numero ?? 0).padStart(8, "0")}` : null].filter(Boolean).join(" · ");
  const amount = Math.round(edited.total * 100);
  const sign = edited.tipo_documento === "nota_credito" ? -1 : 1;
  let targetId: string | null = null;
  if (s.scope === "bitacora") {
    const cat = await categoryByHint(s.ownerUserId!, account, "gasto");
    const e = await createEntry(s.ownerUserId!, { kind: "gasto", amount, currency: edited.moneda, date: edited.fecha, categoryId: cat?.id ?? null, description: (edited.razon_social_emisor ?? "Ticket").slice(0, 140), paymentMethod: null, note: "Leído con lectura inteligente" });
    targetId = (e as { id: string }).id;
  } else if (d.source === "rendicion" && d.target_id) {
    // §2.p B8: el gasto ya lo cargó la rendición aprobada; el buzón suma el comprobante al Libro IVA
    targetId = d.target_id;
  } else {
    const [x] = await db()
      .insert(accounting_expenses)
      .values({ studio_id: s.studioId, organization_id: s.organizationId, source: "lectura", source_id: d.id, description: `${account}: ${label}`.slice(0, 200), amount: amount * sign, currency: edited.moneda, date: edited.fecha, category: "otros", deductible: (edited.iva ?? []).length > 0, receipt_path: d.storage_path, receipt_name: d.file_name, receipt_mime: d.mime_type })
      .onConflictDoNothing()
      .returning({ id: accounting_expenses.id });
    targetId = x?.id ?? null;
  }
  // Aprendizaje por proveedor: lo corregido respecto de lo propuesto queda como regla
  const decisions: Decisions = { ...((d.decisions as unknown as Decisions | null) ?? baseDecisions(edited, account)), ...(opts.decisions ?? {}), account: account.slice(0, 60) };
  const proposed = (d.original as { proposed?: { extraction: Extraction; decisions: Decisions } } | null)?.proposed ?? { extraction: asExtraction(d.extracted)!, decisions: (d.decisions as unknown as Decisions | null) ?? baseDecisions(edited, d.account ?? account) };
  const cuit = edited.cuit_emisor;
  const previous = cuit ? await ruleFor(s, cuit) : null;
  const learned = learnFrom(proposed, { extraction: edited, decisions }, (previous?.rule as SupplierRule | undefined) ?? null);
  if (cuit && learned.rule) {
    if (previous) await db().update(supplier_rules).set({ rule: learned.rule as Record<string, unknown>, supplier_name: edited.razon_social_emisor, source: "aprendido", updated_by: actor.id }).where(eq(supplier_rules.id, previous.id));
    else await db().insert(supplier_rules).values({ studio_id: s.studioId, organization_id: s.organizationId, owner_user_id: s.scope === "bitacora" ? s.ownerUserId : null, scope: s.scope, supplier_cuit: cuit, supplier_name: edited.razon_social_emisor, rule: learned.rule as Record<string, unknown>, updated_by: actor.id });
    await audit({ studioId: s.studioId, organizationId: s.organizationId, actor, action: "lectura.regla_aprendida", entityType: "proveedor", entityId: cuit, metadata: { campos: learned.corrected.filter((c) => !c.includes("_emisor")), proveedor: edited.razon_social_emisor } });
  }
  const learnedInfo = d.learned as { fields: string[]; undone?: boolean } | null;
  if (previous && learnedInfo?.fields.length && !learnedInfo.undone) await db().update(supplier_rules).set({ applied_count: sql`${supplier_rules.applied_count} + 1` }).where(eq(supplier_rules.id, previous.id));
  await db()
    .update(smart_documents)
    .set({ status: "confirmado", extracted: edited as unknown as Record<string, unknown>, validation: v as unknown as Record<string, unknown>, fingerprint: fingerprint(edited), low_fields: [], account: account.slice(0, 60), decisions: decisions as unknown as Record<string, unknown>, corrected_fields: learned.corrected, supplier_cuit: cuit, confirmed_by: actor.id, confirmed_at: new Date(), target_id: targetId })
    .where(eq(smart_documents.id, d.id));
  // §2.q etapa 7: lo comprado y vinculado a un producto suma al stock
  if (s.scope !== "bitacora" && s.organizationId) {
    const { onPurchaseConfirmed } = await import("@/modules/stock/server");
    await onPurchaseConfirmed({ studioId: s.studioId, organizationId: s.organizationId }, { id: d.id, cuit, kind: edited.tipo_documento ?? "factura", items: edited.items ?? [], productLinks: decisions.productLinks ?? {} }, actor.id).catch((e) => console.error("[stock] compra", (e as Error).message));
  }
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
    .map((d) => ({ d, e: asExtraction(d.extracted)! }))
    .filter(({ e }) => e?.fecha && (!from || e.fecha >= from) && (!to || e.fecha <= to));
  return { rows: out.map(({ d, e }) => exportRow(e, d.account ?? "Otros gastos")), ids: out.map(({ d }) => d.id) };
}

export async function markExported(ids: string[]) {
  if (ids.length) await db().update(smart_documents).set({ exported_at: new Date() }).where(inArray(smart_documents.id, ids));
}

/** «Deshacer» lo aprendido en este comprobante: vuelve a lo que leyó el modelo, sin la regla */
export async function undoLearned(s: DocScope, actor: Actor, id: string) {
  if (!s.canConfirm) throw new SmartDocError("No tenés permiso para cambiar este documento.");
  const d = await getDoc(s, id);
  const o = d?.original as { model?: Extraction; modelDecisions?: Decisions } | null;
  if (!d || d.status !== "para_confirmar" || !o?.model || !(d.learned as { fields?: string[] } | null)?.fields?.length) throw new SmartDocError("No hay nada aprendido para deshacer en este comprobante.");
  const decisions = o.modelDecisions ?? baseDecisions(o.model, d.account ?? "Otros gastos");
  await db()
    .update(smart_documents)
    .set({ extracted: o.model as unknown as Record<string, unknown>, decisions: decisions as unknown as Record<string, unknown>, account: decisions.account, learned: { ...(d.learned as { fields: string[]; ruleId: string | null }), undone: true }, original: { ...(d.original as Record<string, unknown>), proposed: { extraction: o.model, decisions } } })
    .where(eq(smart_documents.id, d.id));
  await audit({ studioId: s.studioId, organizationId: s.organizationId, actor, action: "lectura.regla_deshecha", entityType: "documento_leido", entityId: d.id });
}

/** Olvidar la regla de un proveedor (deja de proponerse) */
export async function forgetRule(s: DocScope, actor: Actor, ruleId: string) {
  if (!s.canConfirm || !UUID.test(ruleId)) throw new SmartDocError("Esa regla no existe.");
  const [r] = await db()
    .delete(supplier_rules)
    .where(and(eq(supplier_rules.id, ruleId), eq(supplier_rules.studio_id, s.studioId), eq(supplier_rules.scope, s.scope), s.organizationId ? eq(supplier_rules.organization_id, s.organizationId) : isNull(supplier_rules.organization_id), s.scope === "bitacora" ? eq(supplier_rules.owner_user_id, s.ownerUserId ?? "00000000-0000-0000-0000-000000000000") : isNull(supplier_rules.owner_user_id)))
    .returning({ cuit: supplier_rules.supplier_cuit });
  if (!r) throw new SmartDocError("Esa regla no existe.");
  await audit({ studioId: s.studioId, organizationId: s.organizationId, actor, action: "lectura.regla_olvidada", entityType: "proveedor", entityId: r.cuit });
}

export async function listRules(s: DocScope) {
  return db()
    .select()
    .from(supplier_rules)
    .where(and(eq(supplier_rules.studio_id, s.studioId), eq(supplier_rules.scope, s.scope), s.organizationId ? eq(supplier_rules.organization_id, s.organizationId) : isNull(supplier_rules.organization_id), s.scope === "bitacora" ? eq(supplier_rules.owner_user_id, s.ownerUserId ?? "00000000-0000-0000-0000-000000000000") : isNull(supplier_rules.owner_user_id)))
    .orderBy(desc(supplier_rules.updated_at))
    .limit(200);
}

/**
 * Precisión por proveedor: campos corregidos por comprobante, la primera mitad
 * de los confirmados contra la segunda (la mejora con lo aprendido).
 */
export async function supplierPrecision(s: DocScope) {
  const rows = await db()
    .select({ cuit: smart_documents.supplier_cuit, e: smart_documents.extracted, c: smart_documents.corrected_fields })
    .from(smart_documents)
    .where(and(where(s), eq(smart_documents.status, "confirmado"), isNotNull(smart_documents.corrected_fields), isNotNull(smart_documents.supplier_cuit)))
    .orderBy(smart_documents.confirmed_at)
    .limit(2000);
  const by = new Map<string, { name: string; counts: number[] }>();
  for (const r of rows) {
    const k = r.cuit!;
    const g = by.get(k) ?? { name: (r.e as { razon_social_emisor?: string } | null)?.razon_social_emisor ?? k, counts: [] };
    g.counts.push(r.c?.length ?? 0);
    by.set(k, g);
  }
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  return [...by.entries()]
    .map(([cuit, g]) => {
      const half = Math.ceil(g.counts.length / 2);
      return { cuit, name: g.name, docs: g.counts.length, corrected: g.counts.reduce((a, b) => a + b, 0), first: avg(g.counts.slice(0, half)), last: g.counts.length > 1 ? avg(g.counts.slice(half)) : null, latest: g.counts.at(-1) ?? 0 };
    })
    .sort((a, b) => b.docs - a.docs);
}

// ───────────── Carga masiva (cola) ─────────────

const READABLE: Record<string, string> = { ".pdf": "application/pdf", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png" };
/** Máximo de comprobantes por lote */
const BATCH_MAX = 500;

/** Sube muchos comprobantes (archivos sueltos o un ZIP) y los deja en cola para leer */
export async function readBatch(s: DocScope, actor: Actor, files: File[], source: "archivos" | "zip" | "mail" | "whatsapp" = "archivos") {
  if (!s.canConfirm) throw new SmartDocError("No tenés permiso para cargar documentos.");
  if (!(await hasModule(s.studioId, "smart_docs"))) throw new SmartDocError("La lectura inteligente no está incluida en el plan.");
  const { unzipSync } = await import("fflate");
  const expanded: File[] = [];
  for (const f of files) {
    if (f.name.toLowerCase().endsWith(".zip")) {
      if (f.size > 200 * 1024 * 1024) throw new SmartDocError("El ZIP supera los 200 MB.");
      let entries: Record<string, Uint8Array>;
      try {
        entries = unzipSync(new Uint8Array(await f.arrayBuffer()), { filter: (e) => !e.name.endsWith("/") && !e.name.split("/").some((p) => p.startsWith(".") || p === "__MACOSX") && Object.keys(READABLE).some((x) => e.name.toLowerCase().endsWith(x)) && e.originalSize <= 10 * 1024 * 1024 });
      } catch {
        throw new SmartDocError("No pudimos abrir el ZIP.");
      }
      for (const [name, data] of Object.entries(entries)) {
        const base = name.split("/").pop()!;
        const ext = base.slice(base.lastIndexOf(".")).toLowerCase();
        expanded.push(new File([data as BlobPart], base, { type: READABLE[ext] }));
      }
    } else expanded.push(f);
  }
  if (!expanded.length) throw new SmartDocError("No encontramos comprobantes (PDF, JPG o PNG) para leer.");
  if (expanded.length > BATCH_MAX) throw new SmartDocError(`Se pueden cargar hasta ${BATCH_MAX} comprobantes por vez.`);
  const [batch] = await db().insert(smart_batches).values({ studio_id: s.studioId, organization_id: s.organizationId, owner_user_id: s.ownerUserId, scope: s.scope, source: files.some((f) => f.name.toLowerCase().endsWith(".zip")) ? "zip" : source, total: 0, created_by: actor.id }).returning();
  let queued = 0;
  let skipped = 0;
  for (const file of expanded) {
    const check = await checkUpload(file);
    if (!check.ok) {
      skipped++;
      continue;
    }
    const data = new Uint8Array(await file.arrayBuffer());
    const stored = await storeUpload(file, s.studioId, s.organizationId ?? `bitacora-${s.ownerUserId}`);
    await db().insert(smart_documents).values({ studio_id: s.studioId, organization_id: s.organizationId, owner_user_id: s.ownerUserId, scope: s.scope, storage_path: stored.storagePath, file_name: stored.name, mime_type: stored.mimeType, size_bytes: stored.sizeBytes, sha256: createHash("sha256").update(data).digest("hex"), source: source === "archivos" ? "subida" : source, status: "en_cola", batch_id: batch.id, created_by: actor.id });
    queued++;
  }
  await db().update(smart_batches).set({ total: queued, skipped }).where(eq(smart_batches.id, batch.id));
  await audit({ studioId: s.studioId, organizationId: s.organizationId, actor, action: "lectura.lote", entityType: "lote_lectura", entityId: batch.id, metadata: { comprobantes: queued, salteados: skipped } });
  return { id: batch.id, queued, skipped };
}

/** Avance de los lotes recientes del alcance */
export async function batchProgress(s: DocScope) {
  const batches = await db()
    .select()
    .from(smart_batches)
    .where(and(eq(smart_batches.studio_id, s.studioId), eq(smart_batches.scope, s.scope), s.organizationId ? eq(smart_batches.organization_id, s.organizationId) : isNull(smart_batches.organization_id), s.scope === "bitacora" ? eq(smart_batches.owner_user_id, s.ownerUserId ?? "00000000-0000-0000-0000-000000000000") : isNull(smart_batches.owner_user_id)))
    .orderBy(desc(smart_batches.created_at))
    .limit(5);
  if (!batches.length) return [];
  const counts = await db()
    .select({ batch: smart_documents.batch_id, status: smart_documents.status, n: sql<number>`count(*)::int` })
    .from(smart_documents)
    .where(inArray(smart_documents.batch_id, batches.map((b) => b.id)))
    .groupBy(smart_documents.batch_id, smart_documents.status);
  return batches.map((b) => {
    const c = Object.fromEntries(counts.filter((x) => x.batch === b.id).map((x) => [x.status, x.n])) as Record<string, number>;
    const waiting = (c.en_cola ?? 0) + (c.leyendo ?? 0);
    return { id: b.id, created_at: b.created_at, total: b.total, skipped: b.skipped, waiting, read: b.total - waiting, failed: c.error ?? 0, source: b.source };
  });
}

/** Cola de la carga masiva: toma comprobantes en cola sin pisarse con otra instancia y los lee */
export async function runReadQueue(max = 10) {
  // Los que quedaron «leyendo» por un corte vuelven a la cola
  await db().execute(sql`update smart_documents set status = 'en_cola' where status = 'leyendo' and batch_id is not null and synced_at is null and created_at < now() - interval '15 minutes'`);
  const claimed = (await db().execute(sql`
    update smart_documents set status = 'leyendo'
    where id in (select id from smart_documents where status = 'en_cola' order by created_at limit ${max} for update skip locked)
    returning id`)) as unknown as { id: string }[];
  let done = 0;
  for (const { id } of claimed) {
    const [row] = await db().select().from(smart_documents).where(eq(smart_documents.id, id));
    if (!row) continue;
    const s: DocScope = { studioId: row.studio_id, organizationId: row.organization_id, ownerUserId: row.owner_user_id, scope: row.scope as DocScope["scope"], canConfirm: true };
    try {
      await guardRead(s);
      const { data } = await readStored(row.storage_path);
      await process(s, row, { id: row.created_by ?? "", email: "" }, new Uint8Array(data));
      done++;
    } catch (err) {
      const msg = err instanceof SmartDocError ? err.message : "No pudimos leer el documento.";
      await db().update(smart_documents).set({ status: "error", error: msg, synced_at: new Date() }).where(eq(smart_documents.id, id));
    }
  }
  return done;
}
