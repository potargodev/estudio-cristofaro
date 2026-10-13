import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, count, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { getDb } from "@/db";
import { accounting_expenses, inbox_addresses, organizations, reimbursements, smart_documents, users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { hasModule } from "@/lib/faro/entitlements";
import { isUuid } from "@/lib/ids";
import { studioOrganization } from "@/lib/organizations";
import { readStored, storeImportCsv } from "@/lib/uploads";
import { asExtraction, fingerprint, type Validation } from "@/modules/smart-docs/core";
import { confirmDoc, discardDoc, ownCuits, readUpload, SmartDocError, type DocScope } from "@/modules/smart-docs/server";
import { arcaRowValidation, isComputable, parseMisComprobantes } from "./core";

// Buzón de comprobantes recibidos (§2.p, B8). Todo lo que le llega a las
// organizaciones del estudio para revisar, venga de donde venga: subido en la
// app o el portal, WhatsApp, reenvío por mail, ARCA (Mis Comprobantes) o una
// rendición aprobada. Cada comprobante guarda su fuente, la CUIT receptora
// validada, el CAE (WSCDC) y si está repetido. Una persona decide si computa
// el crédito fiscal (todo, nada o una parte) y aprueba en lote: pasa al Libro
// IVA, la contabilidad y los sistemas conectados (evento documento.confirmado).

const db = () => getDb();
export class InboxError extends Error {}
type Actor = { id: string; email: string; name?: string };

const orgScope = (studioId: string, organizationId: string, canConfirm = true): DocScope => ({ studioId, organizationId, ownerUserId: null, scope: "organizacion", canConfirm });

type InboxFilter = { ver?: string | null; org?: string | null; fuente?: string | null; problema?: string | null };

/** Lo del buzón del estudio (por defecto, lo que está para revisar) */
export async function inboxList(studioId: string, f: InboxFilter = {}) {
  const status = f.ver === "aprobados" ? ["confirmado"] : f.ver === "descartados" ? ["descartado"] : f.ver === "todos" ? ["para_confirmar", "confirmado", "error", "leyendo", "en_cola"] : ["para_confirmar", "error", "leyendo", "en_cola"];
  const rows = await db()
    .select({ d: smart_documents, org: organizations.name, by: users.name })
    .from(smart_documents)
    .innerJoin(organizations, eq(organizations.id, smart_documents.organization_id))
    .leftJoin(users, eq(users.id, smart_documents.created_by))
    .where(and(eq(smart_documents.studio_id, studioId), eq(smart_documents.scope, "organizacion"), inArray(smart_documents.status, status), f.org && isUuid(f.org) ? eq(smart_documents.organization_id, f.org) : undefined, f.fuente ? eq(smart_documents.source, f.fuente) : undefined))
    .orderBy(desc(smart_documents.created_at))
    .limit(300);
  const problems = (r: (typeof rows)[number]) => {
    const v = (r.d.validation as Validation | null) ?? null;
    const out: string[] = [];
    if (r.d.duplicate_of) out.push("repetido");
    if (v?.receptor === "otra") out.push("otra_cuit");
    if (v?.arca?.cae === "no_encontrado") out.push("cae");
    if (v?.cuit === "error" || v?.arca?.cuit === "inexistente") out.push("cuit");
    if (r.d.status === "error") out.push("error");
    return out;
  };
  return rows.map((r) => ({ ...r, problems: problems(r) })).filter((r) => !f.problema || (f.problema === "alguno" ? r.problems.length > 0 : r.problems.includes(f.problema)));
}

/** Para la insignia del menú: comprobantes para revisar en todo el estudio */
export async function inboxCount(studioId: string) {
  const [r] = await db()
    .select({ n: count() })
    .from(smart_documents)
    .where(and(eq(smart_documents.studio_id, studioId), eq(smart_documents.scope, "organizacion"), eq(smart_documents.status, "para_confirmar")));
  return r?.n ?? 0;
}

async function docOf(studioId: string, id: string) {
  if (!isUuid(id)) return null;
  const [d] = await db().select().from(smart_documents).where(and(eq(smart_documents.id, id), eq(smart_documents.studio_id, studioId), eq(smart_documents.scope, "organizacion")));
  return d ?? null;
}

/** Computa, no computa o parcial (con el porcentaje): define el crédito fiscal en el Libro IVA */
export async function setComputable(studioId: string, actor: Actor, id: string, mode: string, pct?: number | null) {
  if (!isComputable(mode)) throw new InboxError("Elegí si computa, no computa o parcial.");
  const d = await docOf(studioId, id);
  if (!d) throw new InboxError("No encontramos ese comprobante.");
  const p = mode === "parcial" ? Math.round(Number(pct)) : null;
  if (mode === "parcial" && !(p! > 0 && p! < 100)) throw new InboxError("El porcentaje que computa tiene que estar entre 1 y 99.");
  await db().update(smart_documents).set({ computable: mode, computable_pct: p }).where(eq(smart_documents.id, d.id));
  await audit({ studioId, organizationId: d.organization_id, actor, action: "buzon.computable", entityType: "documento_leido", entityId: d.id, metadata: { computa: mode, porcentaje: p } });
}

/**
 * Aprobar en lote: guarda si computa y confirma cada uno con lo leído (pasa al
 * Libro IVA y a la contabilidad). Los repetidos y los que están a nombre de
 * otra CUIT no se aprueban en lote: se revisan uno por uno.
 */
export async function approveInbox(studioId: string, actor: Actor & { name: string }, items: { id: string; computable?: string | null; pct?: number | null }[]) {
  const out = { ok: 0, skipped: [] as { id: string; reason: string }[] };
  for (const it of items.slice(0, 200)) {
    const d = await docOf(studioId, it.id);
    if (!d || !d.organization_id || d.status !== "para_confirmar") continue;
    const v = (d.validation as Validation | null) ?? null;
    if (d.duplicate_of) {
      out.skipped.push({ id: d.id, reason: "Parece repetido: revisalo y confirmalo uno por uno." });
      continue;
    }
    if (v?.receptor === "otra") {
      out.skipped.push({ id: d.id, reason: "Está a nombre de otra CUIT." });
      continue;
    }
    const e = asExtraction(d.extracted);
    if (!e) {
      out.skipped.push({ id: d.id, reason: "No tiene datos leídos." });
      continue;
    }
    try {
      if (it.computable && isComputable(it.computable)) await setComputable(studioId, actor, d.id, it.computable, it.pct);
      await confirmDoc(orgScope(studioId, d.organization_id), actor, d.id, e, d.account ?? "Compras");
      out.ok++;
    } catch (err) {
      if (err instanceof SmartDocError || err instanceof InboxError) out.skipped.push({ id: d.id, reason: err.message });
      else throw err;
    }
  }
  await audit({ studioId, actor, action: "buzon.aprobar", entityType: "buzon", entityId: null, metadata: { aprobados: out.ok, salteados: out.skipped.length } });
  return out;
}

export async function discardInbox(studioId: string, actor: Actor, ids: string[]) {
  let n = 0;
  for (const id of ids.slice(0, 200)) {
    const d = await docOf(studioId, id);
    if (!d?.organization_id || d.status === "confirmado") continue;
    await discardDoc(orgScope(studioId, d.organization_id), actor, d.id);
    n++;
  }
  return n;
}

// ───────────── Reenvío por mail ─────────────

const DOMAIN = () => process.env.INBOX_MAIL_DOMAIN?.trim() || "buzon.faro.app";
const addressOf = (token: string) => `comprobantes+${token}@${DOMAIN()}`;

/** La dirección de reenvío de una organización (se crea la primera vez) */
export async function inboxAddress(studioId: string, organizationId: string, actor: Actor) {
  const org = await studioOrganization(organizationId, studioId);
  if (!org) throw new InboxError("No encontramos esa organización.");
  const [prev] = await db().select().from(inbox_addresses).where(and(eq(inbox_addresses.organization_id, org.id), eq(inbox_addresses.studio_id, studioId)));
  if (prev) return addressOf(prev.token);
  const token = randomBytes(9).toString("base64url").toLowerCase().replace(/[^a-z0-9]/g, "x");
  await db().insert(inbox_addresses).values({ studio_id: studioId, organization_id: org.id, token, created_by: actor.id }).onConflictDoNothing();
  await audit({ studioId, organizationId: org.id, actor, action: "buzon.direccion", entityType: "organizacion", entityId: org.id });
  const [row] = await db().select().from(inbox_addresses).where(eq(inbox_addresses.organization_id, org.id));
  return addressOf(row.token);
}

const READABLE: Record<string, string> = { "application/pdf": ".pdf", "image/jpeg": ".jpg", "image/png": ".png" };

/**
 * Mail reenviado (lo manda el proveedor de correo entrante, firmado con
 * INBOX_MAIL_SECRET): cada adjunto PDF o foto entra al buzón de la
 * organización de la dirección. Sin secreto configurado, no entra nada.
 */
export async function receiveMail(secret: string | null, payload: { to?: string | string[]; from?: string; subject?: string; attachments?: { filename?: string; contentType?: string; content?: string }[] }) {
  const want = process.env.INBOX_MAIL_SECRET?.trim();
  if (!want || !secret || secret.length !== want.length || !timingSafeEqual(Buffer.from(secret), Buffer.from(want))) return { status: 401 as const, read: 0 };
  const to = (Array.isArray(payload.to) ? payload.to : [payload.to ?? ""]).join(",");
  const token = to.match(/comprobantes\+([a-z0-9]{6,32})@/i)?.[1]?.toLowerCase();
  const [addr] = token ? await db().select().from(inbox_addresses).where(eq(inbox_addresses.token, token)) : [];
  if (!addr) return { status: 404 as const, read: 0 };
  const files = (payload.attachments ?? []).filter((a) => a.content && READABLE[(a.contentType ?? "").toLowerCase()]).slice(0, 10);
  const [creator] = addr.created_by ? await db().select({ id: users.id, email: users.email, name: users.name }).from(users).where(eq(users.id, addr.created_by)) : [];
  const actor = creator ?? { id: addr.created_by ?? "", email: "buzon@faro", name: "Buzón" };
  let read = 0;
  for (const a of files) {
    const data = Buffer.from(a.content!, "base64");
    if (!data.length || data.length > 10 * 1024 * 1024) continue;
    const mime = a.contentType!.toLowerCase();
    const name = (a.filename ?? `comprobante${READABLE[mime]}`).replace(/[^\w.\- ]/g, "").slice(0, 80) || `comprobante${READABLE[mime]}`;
    try {
      await readUpload(orgScope(addr.studio_id, addr.organization_id, false), actor, new File([new Uint8Array(data)], name, { type: mime }), "mail");
      read++;
    } catch (e) {
      console.error("[buzon] mail", (e as Error).message);
    }
  }
  await audit({ studioId: addr.studio_id, organizationId: addr.organization_id, actor: null, actorLabel: `Mail de ${(payload.from ?? "?").slice(0, 120)}`, action: "buzon.mail", entityType: "organizacion", entityId: addr.organization_id, metadata: { asunto: payload.subject?.slice(0, 200) ?? null, adjuntos: files.length, leidos: read } });
  return { status: 200 as const, read };
}

// ───────────── ARCA: Mis Comprobantes ─────────────

/**
 * El CSV de «Mis Comprobantes» (Recibidos) que la persona baja de ARCA: cada
 * fila entra para revisar sin IA, con su CAE y su emisor; los que ya estaban
 * (misma huella) quedan marcados como repetidos.
 */
export async function importMisComprobantes(studioId: string, actor: Actor, organizationId: string, file: File, cuit?: string | null) {
  const org = await studioOrganization(organizationId, studioId);
  if (!org) throw new InboxError("No encontramos esa organización.");
  if (!(await hasModule(studioId, "smart_docs"))) throw new InboxError("El buzón usa la lectura inteligente, que no está incluida en el plan.");
  if (file.size > 5 * 1024 * 1024) throw new InboxError("El archivo supera los 5 MB.");
  const own = await ownCuits(studioId, org.id);
  const receiver = cuit && own.includes(cuit) ? cuit : own.length === 1 ? own[0] : null;
  const { parseText } = await import("@/modules/lotes/core");
  const text = (await file.text()).replace(/^﻿/, "");
  const { docs, errors } = parseMisComprobantes(parseText(text), receiver);
  if (!docs.length) throw new InboxError(errors[0] ?? "El archivo no tiene comprobantes.");
  const stored = await storeImportCsv(text, studioId, org.id);
  let created = 0;
  let repeated = 0;
  for (const { row, extraction } of docs) {
    const fp = fingerprint(extraction);
    const same = fp ? await db().select({ id: smart_documents.id, source: smart_documents.source }).from(smart_documents).where(and(eq(smart_documents.studio_id, studioId), eq(smart_documents.organization_id, org.id), eq(smart_documents.fingerprint, fp), inArray(smart_documents.status, ["para_confirmar", "confirmado"]))).limit(20) : [];
    const dup = same.find((x) => x.source !== "arca") ?? same[0];
    // El mismo CSV importado dos veces no duplica
    if (same.some((x) => x.source === "arca")) {
      repeated++;
      continue;
    }
    if (dup) repeated++;
    await db().insert(smart_documents).values({
      studio_id: studioId,
      organization_id: org.id,
      scope: "organizacion",
      storage_path: stored.storagePath,
      file_name: `${file.name.slice(0, 120)} · fila ${row}`,
      mime_type: "text/csv",
      size_bytes: stored.sizeBytes,
      sha256: createHash("sha256").update(`${stored.storagePath}:${row}`).digest("hex"),
      source: "arca",
      status: "para_confirmar",
      kind: extraction.tipo_documento,
      extracted: extraction as unknown as Record<string, unknown>,
      confidence: "1",
      low_fields: [],
      validation: arcaRowValidation(extraction) as unknown as Record<string, unknown>,
      fingerprint: fp,
      duplicate_of: dup?.id ?? null,
      account: "Compras",
      supplier_cuit: extraction.cuit_emisor,
      created_by: actor.id,
      synced_at: new Date(),
    });
    created++;
  }
  await audit({ studioId, organizationId: org.id, actor, action: "buzon.arca", entityType: "organizacion", entityId: org.id, metadata: { archivo: file.name, filas: docs.length, nuevos: created, repetidos: repeated, errores: errors.length } });
  return { created, repeated, errors };
}

// ───────────── Rendiciones ─────────────

/** Una rendición aprobada manda su comprobante al buzón (el gasto ya está: suma al Libro IVA al aprobarlo) */
export async function fromReimbursement(reimbursementId: string) {
  const [r] = await db().select({ r: reimbursements, who: users.name, email: users.email }).from(reimbursements).leftJoin(users, eq(users.id, reimbursements.user_id)).where(eq(reimbursements.id, reimbursementId));
  if (!r || r.r.status !== "aprobada" || !r.r.receipt_path || !READABLE[r.r.receipt_mime ?? ""]) return null;
  if (!(await hasModule(r.r.studio_id, "smart_docs"))) return null;
  const [exp] = await db().select({ id: accounting_expenses.id }).from(accounting_expenses).where(and(eq(accounting_expenses.source, "rendicion"), eq(accounting_expenses.source_id, r.r.id)));
  const { data } = await readStored(r.r.receipt_path);
  const file = new File([new Uint8Array(data)], r.r.receipt_name ?? `ticket${READABLE[r.r.receipt_mime!]}`, { type: r.r.receipt_mime! });
  // Queda a nombre de quien rindió (lo ve en «Comprobantes enviados»)
  const actor = { id: r.r.user_id, email: r.email ?? "", name: r.who ?? "" };
  return readUpload(orgScope(r.r.studio_id, r.r.organization_id, false), actor, file, "rendicion", { targetId: exp?.id ?? null, fileName: `Rendición de ${r.who ?? "un empleado"}: ${r.r.description}` });
}

// ───────────── Portal: mis comprobantes enviados ─────────────

/** Lo que mandó una persona de la organización (por la app, el portal, WhatsApp o mail) y en qué quedó */
export async function sentBy(studioId: string, organizationId: string, userId: string) {
  return db()
    .select({ id: smart_documents.id, file: smart_documents.file_name, source: smart_documents.source, status: smart_documents.status, extracted: smart_documents.extracted, createdAt: smart_documents.created_at, confirmedAt: smart_documents.confirmed_at })
    .from(smart_documents)
    .where(and(eq(smart_documents.studio_id, studioId), eq(smart_documents.organization_id, organizationId), eq(smart_documents.created_by, userId), eq(smart_documents.scope, "organizacion"), isNotNull(smart_documents.created_at)))
    .orderBy(desc(smart_documents.created_at))
    .limit(100);
}

/** Resumen para el Vigía: para revisar por organización y con problemas */
export async function inboxSummary(studioId: string, allowed: string[] | null) {
  const rows = await inboxList(studioId);
  const list = rows.filter((r) => !allowed || allowed.includes(r.d.organization_id!));
  const byOrg = new Map<string, { organizacion: string; para_revisar: number; con_problemas: number }>();
  for (const r of list) {
    const x = byOrg.get(r.d.organization_id!) ?? { organizacion: r.org, para_revisar: 0, con_problemas: 0 };
    x.para_revisar++;
    if (r.problems.length) x.con_problemas++;
    byOrg.set(r.d.organization_id!, x);
  }
  return { total: list.length, por_organizacion: [...byOrg.values()].sort((a, b) => b.para_revisar - a.para_revisar), ultimos: list.slice(0, 10).map((r) => ({ organizacion: r.org, archivo: r.d.file_name, fuente: r.d.source, problemas: r.problems })) };
}

