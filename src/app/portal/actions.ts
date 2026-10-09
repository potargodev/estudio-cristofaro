"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { documents, request_messages, requests } from "@/db/schema";
import { ORG_COOKIE, getCurrentUser, getMemberships, requireMember } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { AUTH_ERRORS, getAuth, googleEnabled, type AuthErrorCode } from "@/lib/auth-server";
import { isUuid } from "@/lib/ids";
import { notifyStudio } from "@/lib/notify";
import { can } from "@/lib/permissions";
import { REQUEST_TYPES, type RequestType } from "@/lib/portal-types";
import { checkUpload, fileFromForm, storeUpload } from "@/lib/uploads";

// Acciones del portal. La organización sale SIEMPRE de la sesión
// (requireMember, que valida la membresía activa): nunca se usa un
// organization_id que venga del formulario. Cada acción exige su permiso según
// la matriz de roles (src/lib/permissions.ts).

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

/** Solo rutas internas del portal (evita redirecciones abiertas) */
function safeNext(value: string | null) {
  return value && /^\/(portal|invitacion)(\/|\?|$)/.test(value) && !value.includes("//") ? value : "/portal";
}

function authMessage(error: unknown, fallback: string) {
  const code = (error as { body?: { code?: string } }).body?.code;
  return code && code in AUTH_ERRORS ? AUTH_ERRORS[code as AuthErrorCode] : fallback;
}

/** Enlace mágico: solo sale si el email tiene invitación vigente o membresía activa */
export async function requestMagicLink(_prev: PortalLoginState, fd: FormData): Promise<PortalLoginState> {
  const email = s(fd, "email")?.toLowerCase() ?? null;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, message: "Revisá el email." };
  const next = safeNext(s(fd, "next"));
  try {
    await getAuth().api.signInMagicLink({
      body: { email, callbackURL: next, errorCallbackURL: "/portal/login" },
      headers: await headers(),
    });
  } catch (error) {
    const status = (error as { status?: string }).status;
    if (status === "TOO_MANY_REQUESTS") return { ok: false, message: "Pediste varios enlaces seguidos. Esperá un minuto." };
    if (status !== "FORBIDDEN") console.error("[portal] magic link", error);
    return { ok: false, message: authMessage(error, "No pudimos mandarte el enlace. Probá de nuevo.") };
  }
  return { ok: true, message: `Te mandamos un enlace a ${email}. Abrilo desde este dispositivo: vence en 15 minutos.` };
}

/** "Continuar con Google": arma la URL de Google y redirige */
export async function signInWithGoogle(fd: FormData) {
  if (!googleEnabled()) redirect("/portal/login");
  const next = safeNext(s(fd, "next"));
  const res = await getAuth().api.signInSocial({
    body: { provider: "google", callbackURL: next, errorCallbackURL: "/portal/login" },
    headers: await headers(),
  });
  const url = (res as { url?: string }).url;
  if (!url) redirect("/portal/login?error=google");
  redirect(url);
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

/** Cambia la organización activa (solo a una donde el usuario es miembro activo) */
export async function switchOrganization(fd: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/portal/login");
  const wanted = s(fd, "organization_id");
  const list = await getMemberships(user.id, user.studioId);
  if (wanted && list.some((m) => m.organizationId === wanted)) {
    (await cookies()).set(ORG_COOKIE, wanted, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  revalidatePath("/portal", "layout");
  redirect("/portal");
}

export async function uploadClientDocument(fd: FormData) {
  const me = await requireMember("documentos.subir");
  const file = fileFromForm(fd, "file");
  if (!file) redirect("/portal/documentos?error=archivo");
  const check = await checkUpload(file);
  if (!check.ok) redirect(`/portal/documentos?error=${encodeURIComponent(check.error)}`);
  const category = s(fd, "category");
  const period = s(fd, "period");
  const stored = await storeUpload(file, me.studioId, me.organizationId);
  await getDb()
    .insert(documents)
    .values({
      studio_id: me.studioId,
      organization_id: me.organizationId,
      name: stored.name,
      storage_path: stored.storagePath,
      mime_type: stored.mimeType,
      size_bytes: stored.sizeBytes,
      category: category && CLIENT_CATEGORIES.includes(category) ? category : "comprobantes",
      period: period && /^\d{4}-\d{2}$/.test(period) ? period : null,
      source: "cliente",
      uploaded_by: me.id,
    });
  await audit({
    studioId: me.studioId,
    organizationId: me.organizationId,
    actor: me,
    action: "documento.subir",
    entityType: "documento",
    metadata: { nombre: stored.name, origen: "portal" },
  });
  await notifyStudio({ kind: "documento", organizationId: me.organizationId, organizationName: me.organizationName, documentName: stored.name });
  revalidatePath("/portal", "layout");
  revalidatePath("/admin");
  redirect("/portal/documentos?subido=1");
}

/** Guarda el adjunto de una solicitud como documento del cliente */
async function saveAttachment(file: File, me: Awaited<ReturnType<typeof requireMember>>) {
  const stored = await storeUpload(file, me.studioId, me.organizationId);
  const [doc] = await getDb()
    .insert(documents)
    .values({
      studio_id: me.studioId,
      organization_id: me.organizationId,
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
  const me = await requireMember();
  // Crear: cualquier tipo con solicitudes.crear; RRHH solo solicitudes de personal
  const any = can(me.orgRole, "solicitudes.crear");
  if (!any && !can(me.orgRole, "solicitudes.laborales")) redirect("/portal/sin-permiso");
  const asked = s(fd, "type") as RequestType | null;
  const type: RequestType | null = any ? asked : "empleado";
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
      organization_id: me.organizationId,
      type: type && type in REQUEST_TYPES ? type : "consulta",
      subject,
      created_by: me.id,
    })
    .returning({ id: requests.id });
  const documentId = file ? await saveAttachment(file, me) : null;
  await db.insert(request_messages).values({ request_id: req.id, author_id: me.id, from_client: true, body, document_id: documentId });
  await notifyStudio({ kind: "solicitud", organizationId: me.organizationId, organizationName: me.organizationName, subject, message: body });
  revalidatePath("/portal", "layout");
  revalidatePath("/admin");
  revalidatePath("/admin/solicitudes");
  redirect(`/portal/solicitudes/${req.id}?creada=1`);
}

export async function replyRequestAsClient(fd: FormData) {
  const me = await requireMember();
  const any = can(me.orgRole, "solicitudes.crear");
  if (!any && !can(me.orgRole, "solicitudes.laborales")) redirect("/portal/sin-permiso");
  const requestId = s(fd, "request_id");
  if (!requestId || !isUuid(requestId)) redirect("/portal/solicitudes");
  const db = getDb();
  // Solo solicitudes de SU organización (y, para RRHH, solo las laborales)
  const [req] = await db
    .select()
    .from(requests)
    .where(
      and(
        eq(requests.id, requestId),
        eq(requests.organization_id, me.organizationId),
        eq(requests.studio_id, me.studioId),
        any ? undefined : eq(requests.type, "empleado"),
      ),
    );
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
    organizationId: me.organizationId,
    organizationName: me.organizationName,
    subject: `Re: ${req.subject}`,
    message: body ?? "Envió un archivo.",
  });
  revalidatePath("/portal", "layout");
  revalidatePath("/admin/solicitudes");
  redirect(`/portal/solicitudes/${req.id}?enviado=1`);
}
