"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { documents, request_messages, requests } from "@/db/schema";
import { requireClient } from "@/lib/auth";
import { getAuth } from "@/lib/auth-server";
import { isUuid } from "@/lib/ids";
import { notifyStudio } from "@/lib/notify";
import { REQUEST_TYPES, type RequestType } from "@/lib/portal-types";
import { checkUpload, fileFromForm, storeUpload } from "@/lib/uploads";

// Acciones del portal. El cliente sale SIEMPRE de la sesión (requireClient):
// nunca se usa un client_id que venga del formulario.

function s(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

export interface PortalLoginState {
  ok: boolean;
  message?: string;
}

export async function portalSignIn(_prev: PortalLoginState, fd: FormData): Promise<PortalLoginState> {
  const email = s(fd, "email");
  const password = s(fd, "password");
  if (!email || !password) return { ok: false, message: "Completá email y contraseña." };
  try {
    await getAuth().api.signInEmail({ body: { email, password }, headers: await headers() });
  } catch (error) {
    const status = (error as { status?: string }).status;
    if (status === "FORBIDDEN") return { ok: false, message: "Tu acceso está desactivado. Escribile al estudio." };
    if (status !== "UNAUTHORIZED" && status !== "BAD_REQUEST") console.error("[portal] Error al iniciar sesión", error);
    return { ok: false, message: "Email o contraseña incorrectos." };
  }
  // requireClient manda al backoffice a quien no sea cliente
  redirect("/portal");
}

export async function portalSignOut() {
  try {
    await getAuth().api.signOut({ headers: await headers() });
  } catch {
    // Sin sesión: no hay nada que cerrar
  }
  redirect("/portal/login");
}

const CLIENT_CATEGORIES = ["comprobantes", "recibos", "constancias", "otro"];

export async function uploadClientDocument(fd: FormData) {
  const me = await requireClient();
  const file = fileFromForm(fd, "file");
  if (!file) redirect("/portal/documentos?error=archivo");
  const check = await checkUpload(file);
  if (!check.ok) redirect(`/portal/documentos?error=${encodeURIComponent(check.error)}`);
  const category = s(fd, "category");
  const period = s(fd, "period");
  const stored = await storeUpload(file, me.studioId, me.clientId);
  await getDb()
    .insert(documents)
    .values({
      studio_id: me.studioId,
      client_id: me.clientId,
      name: stored.name,
      storage_path: stored.storagePath,
      mime_type: stored.mimeType,
      size_bytes: stored.sizeBytes,
      category: category && CLIENT_CATEGORIES.includes(category) ? category : "comprobantes",
      period: period && /^\d{4}-\d{2}$/.test(period) ? period : null,
      source: "cliente",
      uploaded_by: me.id,
    });
  await notifyStudio({ kind: "documento", clientId: me.clientId, clientName: me.clientName, documentName: stored.name });
  revalidatePath("/portal", "layout");
  revalidatePath("/admin");
  redirect("/portal/documentos?subido=1");
}

/** Guarda el adjunto de una solicitud como documento del cliente */
async function saveAttachment(file: File, me: Awaited<ReturnType<typeof requireClient>>) {
  const stored = await storeUpload(file, me.studioId, me.clientId);
  const [doc] = await getDb()
    .insert(documents)
    .values({
      studio_id: me.studioId,
      client_id: me.clientId,
      name: stored.name,
      storage_path: stored.storagePath,
      mime_type: stored.mimeType,
      size_bytes: stored.sizeBytes,
      category: "solicitud",
      source: "cliente",
      uploaded_by: me.id,
    })
    .returning({ id: documents.id });
  return doc.id;
}

export async function createRequest(fd: FormData) {
  const me = await requireClient();
  const type = s(fd, "type") as RequestType | null;
  const subject = s(fd, "subject")?.slice(0, 140) ?? null;
  const body = s(fd, "body")?.slice(0, 5000) ?? null;
  if (!subject || !body) redirect("/portal/solicitudes/nueva?error=campos");
  const file = fileFromForm(fd, "file");
  if (file) {
    const check = await checkUpload(file);
    if (!check.ok) redirect(`/portal/solicitudes/nueva?error=${encodeURIComponent(check.error)}`);
  }
  const db = getDb();
  const [req] = await db
    .insert(requests)
    .values({
      studio_id: me.studioId,
      client_id: me.clientId,
      type: type && type in REQUEST_TYPES ? type : "consulta",
      subject,
      created_by: me.id,
    })
    .returning({ id: requests.id });
  const documentId = file ? await saveAttachment(file, me) : null;
  await db.insert(request_messages).values({ request_id: req.id, author_id: me.id, from_client: true, body, document_id: documentId });
  await notifyStudio({ kind: "solicitud", clientId: me.clientId, clientName: me.clientName, subject, message: body });
  revalidatePath("/portal", "layout");
  revalidatePath("/admin");
  revalidatePath("/admin/solicitudes");
  redirect(`/portal/solicitudes/${req.id}?creada=1`);
}

export async function replyRequestAsClient(fd: FormData) {
  const me = await requireClient();
  const requestId = s(fd, "request_id");
  if (!requestId || !isUuid(requestId)) redirect("/portal/solicitudes");
  const db = getDb();
  // Solo solicitudes de SU cliente
  const [req] = await db
    .select()
    .from(requests)
    .where(and(eq(requests.id, requestId), eq(requests.client_id, me.clientId), eq(requests.studio_id, me.studioId)));
  if (!req) redirect("/portal/solicitudes");
  const body = s(fd, "body")?.slice(0, 5000) ?? null;
  const file = fileFromForm(fd, "file");
  if (file) {
    const check = await checkUpload(file);
    if (!check.ok) redirect(`/portal/solicitudes/${req.id}?error=${encodeURIComponent(check.error)}`);
  }
  if (!body && !file) redirect(`/portal/solicitudes/${req.id}`);
  const documentId = file ? await saveAttachment(file, me) : null;
  await db.insert(request_messages).values({
    request_id: req.id,
    author_id: me.id,
    from_client: true,
    body: body ?? "Te envío un archivo.",
    document_id: documentId,
  });
  // Si estaba resuelta y el cliente vuelve a escribir, se reabre
  if (req.status === "resuelta") await db.update(requests).set({ status: "abierta" }).where(eq(requests.id, req.id));
  else await db.update(requests).set({ updated_at: new Date() }).where(eq(requests.id, req.id));
  await notifyStudio({
    kind: "solicitud",
    clientId: me.clientId,
    clientName: me.clientName,
    subject: `Re: ${req.subject}`,
    message: body ?? "Envió un archivo.",
  });
  revalidatePath("/portal", "layout");
  revalidatePath("/admin/solicitudes");
  redirect(`/portal/solicitudes/${req.id}?enviado=1`);
}
