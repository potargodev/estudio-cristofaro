"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { hashPassword } from "better-auth/crypto";
import { getDb } from "@/db";
import { accounts, client_users, clients, documents, obligations, request_messages, requests, sessions, users } from "@/db/schema";
import { requireStaff } from "@/lib/auth";
import { isUuid } from "@/lib/ids";
import { notifyClient } from "@/lib/notify";
import { ImportFileError, parseObligationsFile, toAmount, type ImportRow } from "@/lib/obligations-import";
import { OBLIGATION_STATUS, REQUEST_STATUS, type ObligationStatus, type RequestStatus } from "@/lib/portal-types";
import { checkUpload, deleteStored, fileFromForm, storeUpload } from "@/lib/uploads";
import { createUserWithPassword, generatePassword } from "@/lib/users";

// Acciones del backoffice sobre el portal del cliente. Todas validan la sesión
// de staff y que el cliente (o el registro) sea del estudio del usuario.

function s(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

function pgCode(error: unknown): string | undefined {
  const e = error as { code?: string; cause?: { code?: string } };
  return e?.code ?? e?.cause?.code;
}

/** Cliente del estudio del usuario, o null */
async function studioClient(clientId: string | null, studioId: string) {
  if (!clientId || !isUuid(clientId)) return null;
  const [client] = await getDb()
    .select({ id: clients.id, name: clients.business_name })
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.studio_id, studioId)));
  return client ?? null;
}

const fichaUrl = (clientId: string, tab: string, extra = "") => `/admin/clientes/${clientId}?tab=${tab}${extra ? `&${extra}` : ""}`;

function revalidateClient(clientId: string) {
  revalidatePath(`/admin/clientes/${clientId}`);
  revalidatePath("/admin");
  revalidatePath("/portal", "layout");
}

// ───────────── acceso al portal ─────────────

export interface CredentialsState {
  ok: boolean;
  message?: string;
  email?: string;
  password?: string;
}

/** Crea el usuario cliente y devuelve la contraseña inicial (se muestra una sola vez). */
export async function inviteClientUser(_prev: CredentialsState, fd: FormData): Promise<CredentialsState> {
  const staff = await requireStaff();
  const client = await studioClient(s(fd, "client_id"), staff.studioId);
  if (!client) return { ok: false, message: "Cliente inexistente." };
  const name = s(fd, "name") ?? client.name;
  const email = s(fd, "email")?.toLowerCase() ?? null;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, message: "Revisá el email." };

  const password = generatePassword();
  try {
    await createUserWithPassword(getDb(), { studioId: staff.studioId, name, email, password, role: "cliente", clientId: client.id });
  } catch (error) {
    if (pgCode(error) === "23505") return { ok: false, message: "Ya existe un usuario con ese email." };
    console.error("[portal] inviteClientUser", error);
    return { ok: false, message: "No se pudo crear el acceso. Probá de nuevo." };
  }
  revalidatePath(`/admin/clientes/${client.id}`);
  return { ok: true, email, password };
}

/** Usuario cliente vinculado a un cliente del estudio */
async function linkedClientUser(userId: string | null, clientId: string | null, studioId: string) {
  if (!userId || !isUuid(userId) || !clientId || !isUuid(clientId)) return null;
  const [row] = await getDb()
    .select({ id: users.id, email: users.email })
    .from(client_users)
    .innerJoin(users, eq(users.id, client_users.user_id))
    .innerJoin(clients, eq(clients.id, client_users.client_id))
    .where(
      and(
        eq(client_users.user_id, userId),
        eq(client_users.client_id, clientId),
        eq(clients.studio_id, studioId),
        eq(users.studioId, studioId),
        eq(users.role, "cliente"),
      ),
    );
  return row ?? null;
}

/** Genera una contraseña nueva para el usuario cliente y cierra sus sesiones. */
export async function resetClientPassword(_prev: CredentialsState, fd: FormData): Promise<CredentialsState> {
  const staff = await requireStaff();
  const user = await linkedClientUser(s(fd, "user_id"), s(fd, "client_id"), staff.studioId);
  if (!user) return { ok: false, message: "Usuario inexistente." };
  const password = generatePassword();
  const hash = await hashPassword(password);
  const db = getDb();
  await db.update(accounts).set({ password: hash }).where(and(eq(accounts.userId, user.id), eq(accounts.providerId, "credential")));
  await db.delete(sessions).where(eq(sessions.userId, user.id));
  return { ok: true, email: user.email, password };
}

export async function setClientUserActive(fd: FormData) {
  const staff = await requireStaff();
  const clientId = s(fd, "client_id");
  const user = await linkedClientUser(s(fd, "user_id"), clientId, staff.studioId);
  if (!user || !clientId) redirect("/admin/clientes");
  const active = s(fd, "active") === "1";
  const db = getDb();
  await db.update(users).set({ active }).where(eq(users.id, user.id));
  if (!active) await db.delete(sessions).where(eq(sessions.userId, user.id));
  revalidatePath(`/admin/clientes/${clientId}`);
  redirect(fichaUrl(clientId, "portal", active ? "activado=1" : "desactivado=1"));
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
  const client = await studioClient(s(fd, "client_id"), staff.studioId);
  if (!client) redirect("/admin/clientes");
  const payload = obligationPayload(fd);
  if (!payload) redirect(fichaUrl(client.id, "vencimientos", "error=vencimiento"));
  const id = s(fd, "id");
  const db = getDb();
  if (id && isUuid(id)) {
    await db
      .update(obligations)
      .set(payload)
      .where(and(eq(obligations.id, id), eq(obligations.client_id, client.id), eq(obligations.studio_id, staff.studioId)));
  } else {
    await db.insert(obligations).values({ ...payload, studio_id: staff.studioId, client_id: client.id });
    await notifyClient(staff.studioId, client.id, {
      kind: "vencimientos",
      items: [{ tax: payload.tax, period: payload.period, dueDate: payload.due_date }],
    });
  }
  revalidateClient(client.id);
  redirect(fichaUrl(client.id, "vencimientos", "guardado=1"));
}

export async function deleteObligation(fd: FormData) {
  const staff = await requireStaff();
  const client = await studioClient(s(fd, "client_id"), staff.studioId);
  if (!client) redirect("/admin/clientes");
  const id = s(fd, "id");
  if (id && isUuid(id)) {
    await getDb()
      .delete(obligations)
      .where(and(eq(obligations.id, id), eq(obligations.client_id, client.id), eq(obligations.studio_id, staff.studioId)));
  }
  revalidateClient(client.id);
  redirect(fichaUrl(client.id, "vencimientos"));
}

// ───────────── documentos ─────────────

export async function uploadStudioDocument(fd: FormData) {
  const staff = await requireStaff();
  const client = await studioClient(s(fd, "client_id"), staff.studioId);
  if (!client) redirect("/admin/clientes");
  const file = fileFromForm(fd, "file");
  if (!file) redirect(fichaUrl(client.id, "documentos", "error=archivo"));
  const check = await checkUpload(file);
  if (!check.ok) redirect(fichaUrl(client.id, "documentos", `error=${encodeURIComponent(check.error)}`));
  const period = s(fd, "period");
  const stored = await storeUpload(file, staff.studioId, client.id);
  await getDb()
    .insert(documents)
    .values({
      studio_id: staff.studioId,
      client_id: client.id,
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
  await notifyClient(staff.studioId, client.id, { kind: "documento", documentName: stored.name });
  revalidateClient(client.id);
  redirect(fichaUrl(client.id, "documentos", "guardado=1"));
}

export async function deleteDocument(fd: FormData) {
  const staff = await requireStaff();
  const client = await studioClient(s(fd, "client_id"), staff.studioId);
  if (!client) redirect("/admin/clientes");
  const id = s(fd, "id");
  if (id && isUuid(id)) {
    const [doc] = await getDb()
      .delete(documents)
      .where(and(eq(documents.id, id), eq(documents.client_id, client.id), eq(documents.studio_id, staff.studioId)))
      .returning({ storage_path: documents.storage_path });
    if (doc) await deleteStored(doc.storage_path).catch(() => {});
  }
  revalidateClient(client.id);
  redirect(fichaUrl(client.id, "documentos"));
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
  const back = s(fd, "back") === "solicitudes" ? "/admin/solicitudes" : fichaUrl(req.client_id, "solicitudes");

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
    const stored = await storeUpload(file, staff.studioId, req.client_id);
    const [doc] = await db
      .insert(documents)
      .values({
        studio_id: staff.studioId,
        client_id: req.client_id,
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
  if (body || documentId) await notifyClient(staff.studioId, req.client_id, { kind: "respuesta", subject: req.subject });

  revalidateClient(req.client_id);
  revalidatePath("/admin/solicitudes");
  redirect(`${back}${back.includes("?") ? "&" : "?"}guardado=1#${req.id}`);
}

// ───────────── importación de vencimientos ─────────────

export interface PreviewRow extends ImportRow {
  clientId: string | null;
  clientName: string | null;
}

export interface ImportState {
  ok: boolean;
  message?: string;
  fileName?: string;
  rows?: PreviewRow[];
  imported?: number;
}

/** Cruce por CUIT con los clientes del estudio */
async function matchClients(studioId: string, rows: ImportRow[]): Promise<PreviewRow[]> {
  const cuits = [...new Set(rows.map((r) => r.cuit).filter((c) => c.length === 11))];
  const found = cuits.length
    ? await getDb()
        .select({ id: clients.id, name: clients.business_name, cuit: clients.cuit })
        .from(clients)
        .where(and(eq(clients.studio_id, studioId), inArray(clients.cuit, cuits)))
    : [];
  const byCuit = new Map(found.map((c) => [c.cuit, c]));
  return rows.map((r) => {
    const c = byCuit.get(r.cuit);
    const errors = [...r.errors];
    if (!c && r.cuit.length === 11) errors.push("No hay un cliente con ese CUIT");
    return { ...r, errors, clientId: c?.id ?? null, clientName: c?.name ?? null };
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
    (r) => r.clientId && r.cuit.length === 11 && r.tax && r.period && r.due_date,
  );
  if (rows.length === 0) return { ok: false, message: "No hay filas válidas para importar." };

  await getDb()
    .insert(obligations)
    .values(
      rows.map((r) => ({
        studio_id: staff.studioId,
        client_id: r.clientId!,
        tax: r.tax,
        period: r.period,
        due_date: r.due_date,
        amount: r.amount,
      })),
    );

  // Un aviso por cliente con sus vencimientos nuevos
  const byClient = new Map<string, PreviewRow[]>();
  for (const r of rows) byClient.set(r.clientId!, [...(byClient.get(r.clientId!) ?? []), r]);
  for (const [clientId, items] of byClient) {
    await notifyClient(staff.studioId, clientId, {
      kind: "vencimientos",
      items: items.map((i) => ({ tax: i.tax, period: i.period, dueDate: i.due_date })),
    });
    revalidatePath(`/admin/clientes/${clientId}`);
  }
  revalidatePath("/portal", "layout");
  return { ok: true, imported: rows.length, message: `Se importaron ${rows.length} vencimientos de ${byClient.size} clientes.` };
}
