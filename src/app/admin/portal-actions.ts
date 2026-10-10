"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { documents, legal_entities, obligations, request_messages, requests } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requireStaff } from "@/lib/auth";
import { isUuid } from "@/lib/ids";
import { notifyOrganization } from "@/lib/notify";
import { studioOrganization } from "@/lib/organizations";
import { ImportFileError, parseObligationsFile, toAmount, type ImportRow } from "@/lib/obligations-import";
import { OBLIGATION_STATUS, REQUEST_STATUS, type ObligationStatus, type RequestStatus } from "@/lib/portal-types";
import { checkUpload, deleteStored, fileFromForm, storeUpload } from "@/lib/uploads";

// Acciones del backoffice sobre los datos de cada organización (vencimientos,
// documentos, solicitudes, importación). Todas validan la sesión de staff y que
// la organización (o el registro) sea del estudio del usuario.

function s(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

/** Razón social de la organización, o null (si viene vacía o es de otra organización) */
async function orgLegalEntity(id: string | null, organizationId: string) {
  if (!id || !isUuid(id)) return null;
  const [le] = await getDb()
    .select({ id: legal_entities.id })
    .from(legal_entities)
    .where(and(eq(legal_entities.id, id), eq(legal_entities.organization_id, organizationId)));
  return le?.id ?? null;
}

const fichaUrl = (orgId: string, tab: string, extra = "") => `/admin/organizaciones/${orgId}?tab=${tab}${extra ? `&${extra}` : ""}`;

function revalidateOrg(orgId: string) {
  revalidatePath(`/admin/organizaciones/${orgId}`);
  revalidatePath("/admin");
  revalidatePath("/portal", "layout");
}

// ───────────── vencimientos ─────────────

function obligationPayload(fd: FormData) {
  const tax = s(fd, "tax");
  const period = s(fd, "period");
  const due = s(fd, "due_date");
  const amount = toAmount(s(fd, "amount"));
  const url = s(fd, "payment_url");
  const status = s(fd, "status") as ObligationStatus | null;
  if (!tax || !period || !/^\d{4}-\d{2}$/.test(period) || !due || !/^\d{4}-\d{2}-\d{2}$/.test(due)) return null;
  if (amount === undefined) return null;
  if (url && !/^https?:\/\/\S+$/i.test(url)) return null;
  return {
    tax: tax.slice(0, 80),
    period,
    due_date: due,
    amount: amount ?? null,
    payment_url: url,
    status: status && status in OBLIGATION_STATUS ? status : ("pendiente" as const),
    notes: s(fd, "notes"),
  };
}

export async function saveObligation(fd: FormData) {
  const staff = await requireStaff();
  const org = await studioOrganization(s(fd, "organization_id"), staff.studioId);
  if (!org) redirect("/admin/organizaciones");
  const base = obligationPayload(fd);
  if (!base) redirect(fichaUrl(org.id, "vencimientos", "error=vencimiento"));
  const payload = { ...base, legal_entity_id: await orgLegalEntity(s(fd, "legal_entity_id"), org.id) };
  const id = s(fd, "id");
  const db = getDb();
  if (id && isUuid(id)) {
    await db
      .update(obligations)
      .set(payload)
      .where(and(eq(obligations.id, id), eq(obligations.organization_id, org.id), eq(obligations.studio_id, staff.studioId)));
  } else {
    await db.insert(obligations).values({ ...payload, studio_id: staff.studioId, organization_id: org.id });
    await notifyOrganization(staff.studioId, org.id, {
      kind: "vencimientos",
      items: [{ tax: payload.tax, period: payload.period, dueDate: payload.due_date }],
    });
  }
  revalidateOrg(org.id);
  redirect(fichaUrl(org.id, "vencimientos", "guardado=1"));
}

export async function deleteObligation(fd: FormData) {
  const staff = await requireStaff();
  const org = await studioOrganization(s(fd, "organization_id"), staff.studioId);
  if (!org) redirect("/admin/organizaciones");
  const id = s(fd, "id");
  if (id && isUuid(id)) {
    await getDb()
      .delete(obligations)
      .where(and(eq(obligations.id, id), eq(obligations.organization_id, org.id), eq(obligations.studio_id, staff.studioId)));
  }
  revalidateOrg(org.id);
  redirect(fichaUrl(org.id, "vencimientos"));
}

// ───────────── documentos ─────────────

export async function uploadStudioDocument(fd: FormData) {
  const staff = await requireStaff();
  const org = await studioOrganization(s(fd, "organization_id"), staff.studioId);
  if (!org) redirect("/admin/organizaciones");
  const file = fileFromForm(fd, "file");
  if (!file) redirect(fichaUrl(org.id, "documentos", "error=archivo"));
  const check = await checkUpload(file);
  if (!check.ok) redirect(fichaUrl(org.id, "documentos", `error=${encodeURIComponent(check.error)}`));
  const period = s(fd, "period");
  const stored = await storeUpload(file, staff.studioId, org.id);
  await getDb()
    .insert(documents)
    .values({
      studio_id: staff.studioId,
      organization_id: org.id,
      legal_entity_id: await orgLegalEntity(s(fd, "legal_entity_id"), org.id),
      name: stored.name,
      storage_path: stored.storagePath,
      mime_type: stored.mimeType,
      size_bytes: stored.sizeBytes,
      category: s(fd, "category") ?? "otro",
      period: period && /^\d{4}-\d{2}$/.test(period) ? period : null,
      source: "estudio",
      uploaded_by: staff.id,
      reviewed_at: new Date(),
    });
  await audit({
    studioId: staff.studioId,
    organizationId: org.id,
    actor: staff,
    action: "documento.subir",
    entityType: "documento",
    metadata: { nombre: stored.name, origen: "estudio" },
  });
  await notifyOrganization(staff.studioId, org.id, { kind: "documento", documentName: stored.name });
  revalidateOrg(org.id);
  redirect(fichaUrl(org.id, "documentos", "guardado=1"));
}

export async function deleteDocument(fd: FormData) {
  const staff = await requireStaff();
  const org = await studioOrganization(s(fd, "organization_id"), staff.studioId);
  if (!org) redirect("/admin/organizaciones");
  const id = s(fd, "id");
  if (id && isUuid(id)) {
    const [doc] = await getDb()
      .delete(documents)
      .where(and(eq(documents.id, id), eq(documents.organization_id, org.id), eq(documents.studio_id, staff.studioId)))
      .returning({ storage_path: documents.storage_path, name: documents.name });
    if (doc) {
      await deleteStored(doc.storage_path).catch(() => {});
      await audit({
        studioId: staff.studioId,
        organizationId: org.id,
        actor: staff,
        action: "documento.eliminar",
        entityType: "documento",
        entityId: id,
        metadata: { nombre: doc.name },
      });
    }
  }
  revalidateOrg(org.id);
  redirect(fichaUrl(org.id, "documentos"));
}

// ───────────── solicitudes ─────────────

export async function replyRequest(fd: FormData) {
  const staff = await requireStaff();
  const requestId = s(fd, "request_id");
  if (!requestId || !isUuid(requestId)) redirect("/admin/solicitudes");
  const db = getDb();
  const [req] = await db
    .select()
    .from(requests)
    .where(and(eq(requests.id, requestId), eq(requests.studio_id, staff.studioId)));
  if (!req) redirect("/admin/solicitudes");
  const back = s(fd, "back") === "solicitudes" ? `/admin/solicitudes?id=${req.id}` : fichaUrl(req.organization_id, "solicitudes");

  const body = s(fd, "body");
  const status = s(fd, "status") as RequestStatus | null;
  const file = fileFromForm(fd, "file");
  if (file) {
    const check = await checkUpload(file);
    if (!check.ok) redirect(`${back}${back.includes("?") ? "&" : "?"}error=${encodeURIComponent(check.error)}#${req.id}`);
  }
  if (!body && !file && !status) redirect(back);

  let documentId: string | null = null;
  if (file) {
    const stored = await storeUpload(file, staff.studioId, req.organization_id);
    const [doc] = await db
      .insert(documents)
      .values({
        studio_id: staff.studioId,
        organization_id: req.organization_id,
        legal_entity_id: req.legal_entity_id,
        name: stored.name,
        storage_path: stored.storagePath,
        mime_type: stored.mimeType,
        size_bytes: stored.sizeBytes,
        category: "solicitud",
        source: "estudio",
        uploaded_by: staff.id,
        reviewed_at: new Date(),
      })
      .returning({ id: documents.id });
    documentId = doc.id;
  }
  if (body || documentId) {
    await db.insert(request_messages).values({
      request_id: req.id,
      author_id: staff.id,
      from_client: false,
      body: body ?? "Te enviamos un archivo.",
      document_id: documentId,
    });
  }
  // Responder pasa la solicitud a "en curso" salvo que se elija otro estado
  const nextStatus = status && status in REQUEST_STATUS ? status : body && req.status === "abierta" ? "en_curso" : req.status;
  await db.update(requests).set({ status: nextStatus }).where(eq(requests.id, req.id));
  if (body || documentId) await notifyOrganization(staff.studioId, req.organization_id, { kind: "respuesta", subject: req.subject });

  revalidateOrg(req.organization_id);
  revalidatePath("/admin/solicitudes");
  redirect(`${back}${back.includes("?") ? "&" : "?"}guardado=1#${req.id}`);
}

// ───────────── importación de vencimientos ─────────────

export interface PreviewRow extends ImportRow {
  organizationId: string | null;
  legalEntityId: string | null;
  clientName: string | null;
}

export interface ImportState {
  ok: boolean;
  message?: string;
  fileName?: string;
  rows?: PreviewRow[];
  imported?: number;
}

/** Cruce por CUIT con las razones sociales del estudio */
async function matchClients(studioId: string, rows: ImportRow[]): Promise<PreviewRow[]> {
  const cuits = [...new Set(rows.map((r) => r.cuit).filter((c) => c.length === 11))];
  const found = cuits.length
    ? await getDb()
        .select({ id: legal_entities.id, org: legal_entities.organization_id, name: legal_entities.business_name, cuit: legal_entities.cuit })
        .from(legal_entities)
        .where(and(eq(legal_entities.studio_id, studioId), inArray(legal_entities.cuit, cuits)))
    : [];
  const byCuit = new Map(found.map((c) => [c.cuit, c]));
  return rows.map((r) => {
    const c = byCuit.get(r.cuit);
    const errors = [...r.errors];
    if (!c && r.cuit.length === 11) errors.push("No hay una razón social con ese CUIT");
    return { ...r, errors, organizationId: c?.org ?? null, legalEntityId: c?.id ?? null, clientName: c?.name ?? null };
  });
}

/** Paso 1: lee el archivo y devuelve la vista previa (no guarda nada). */
export async function previewObligationsImport(_prev: ImportState, fd: FormData): Promise<ImportState> {
  const staff = await requireStaff();
  const file = fileFromForm(fd, "file");
  if (!file) return { ok: false, message: "Elegí un archivo .csv o .xlsx." };
  if (file.size > 5 * 1024 * 1024) return { ok: false, message: "El archivo supera los 5 MB." };
  try {
    const rows = await parseObligationsFile(file);
    return { ok: true, fileName: file.name, rows: await matchClients(staff.studioId, rows) };
  } catch (error) {
    if (error instanceof ImportFileError) return { ok: false, message: error.message };
    console.error("[importar] preview", error);
    return { ok: false, message: "No se pudo leer el archivo." };
  }
}

/**
 * Paso 2: confirma. Vuelve a validar y a cruzar por CUIT en el servidor (no
 * confía en la vista previa que viene del navegador) y guarda las filas válidas.
 */
export async function confirmObligationsImport(_prev: ImportState, fd: FormData): Promise<ImportState> {
  const staff = await requireStaff();
  let raw: ImportRow[];
  try {
    raw = JSON.parse(s(fd, "rows") ?? "[]");
    if (!Array.isArray(raw) || raw.length > 2000) throw new Error();
  } catch {
    return { ok: false, message: "Datos de importación inválidos. Volvé a subir el archivo." };
  }
  // Re-validación de cada campo (mismas reglas que el parser)
  const clean: ImportRow[] = raw.map((r) => ({
    line: Number(r.line) || 0,
    cuit: String(r.cuit ?? "").replace(/\D/g, ""),
    tax: String(r.tax ?? "").trim().slice(0, 80),
    period: /^\d{4}-\d{2}$/.test(String(r.period)) ? String(r.period) : "",
    due_date: /^\d{4}-\d{2}-\d{2}$/.test(String(r.due_date)) ? String(r.due_date) : "",
    amount: r.amount == null ? null : (toAmount(String(r.amount)) ?? null),
    errors: [],
  }));
  const rows = (await matchClients(staff.studioId, clean)).filter(
    (r) => r.organizationId && r.cuit.length === 11 && r.tax && r.period && r.due_date,
  );
  if (rows.length === 0) return { ok: false, message: "No hay filas válidas para importar." };

  await getDb()
    .insert(obligations)
    .values(
      rows.map((r) => ({
        studio_id: staff.studioId,
        organization_id: r.organizationId!,
        legal_entity_id: r.legalEntityId,
        tax: r.tax,
        period: r.period,
        due_date: r.due_date,
        amount: r.amount,
      })),
    );

  // Un aviso por cliente con sus vencimientos nuevos
  const byClient = new Map<string, PreviewRow[]>();
  for (const r of rows) byClient.set(r.organizationId!, [...(byClient.get(r.organizationId!) ?? []), r]);
  for (const [orgId, items] of byClient) {
    await audit({
      studioId: staff.studioId,
      organizationId: orgId,
      actor: staff,
      action: "vencimientos.importar",
      entityType: "vencimiento",
      metadata: { filas: items.length },
    });
    await notifyOrganization(staff.studioId, orgId, {
      kind: "vencimientos",
      items: items.map((i) => ({ tax: i.tax, period: i.period, dueDate: i.due_date })),
    });
    revalidatePath(`/admin/organizaciones/${orgId}`);
  }
  revalidatePath("/portal", "layout");
  return { ok: true, imported: rows.length, message: `Se importaron ${rows.length} vencimientos de ${byClient.size} organizaciones.` };
}
