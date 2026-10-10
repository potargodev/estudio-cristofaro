"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { faqs, leads, posts, service_plans, sessions, users } from "@/db/schema";
import { requireAdmin, requireOperator, requireStaff } from "@/lib/auth";
import { takeAfterLogin } from "@/lib/after-login";
import { homeFor } from "@/lib/roles";
import { audit, requestIp } from "@/lib/audit";
import { staffLimitError } from "@/lib/faro/entitlements";
import { AUTH_ERRORS, getAuth, type AuthErrorCode } from "@/lib/auth-server";
import type { LeadStatus, UserRole } from "@/lib/types";
import { createUserWithPassword } from "@/lib/users";

// Cada action valida la sesión y el rol con requireStaff/requireAdmin y
// todas las queries filtran por el studio_id del usuario.

// ───────────── helpers ─────────────

function s(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

function lines(fd: FormData, key: string): string[] {
  return (s(fd, key) ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

function slugify(text: string) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Id de un formulario, solo si es un uuid válido (si no, Postgres tira error). */
function id(fd: FormData, key = "id"): string | null {
  const v = s(fd, key);
  return v && UUID_RE.test(v) ? v : null;
}

/** Código de error de Postgres (Drizzle lo envuelve en `cause`). */
function pgCode(error: unknown): string | undefined {
  const e = error as { code?: string; cause?: { code?: string } };
  return e?.code ?? e?.cause?.code;
}

const LEAD_STATUSES: LeadStatus[] = ["nuevo", "contactado", "presupuesto", "ganado", "perdido"];
const STAFF_ROLES: UserRole[] = ["admin", "contador", "colaborador"];

function revalidateSite() {
  revalidatePath("/", "layout");
}

export interface ActionState {
  ok: boolean;
  message?: string;
}

// ───────────── sesión ─────────────

export async function signIn(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const email = s(fd, "email")?.toLowerCase() ?? null;
  const password = s(fd, "password");
  if (!email || !password) return { ok: false, message: "Completá email y contraseña." };
  let twoFactor = false;
  try {
    const res = await getAuth().api.signInEmail({ body: { email, password }, headers: await headers() });
    // Con 2FA activo Better Auth no abre la sesión todavía: pide el código
    twoFactor = Boolean((res as { twoFactorRedirect?: boolean }).twoFactorRedirect);
  } catch (error) {
    // Errores de Better Auth (APIError). Se compara por status y no con instanceof:
    // la clase viene de un paquete interno y no siempre es la misma instancia.
    const e = error as { status?: string; body?: { code?: string; message?: string } };
    await audit({
      studioId: null,
      actorLabel: email,
      action: "sesion.rechazada",
      result: "denegado",
      metadata: { via: "contraseña", motivo: e.body?.code ?? e.status },
    });
    if (e.status === "FORBIDDEN") {
      if (e.body?.code && e.body.code in AUTH_ERRORS) return { ok: false, message: AUTH_ERRORS[e.body.code as AuthErrorCode] };
      return { ok: false, message: "Tu usuario está desactivado. Pedile acceso a un administrador del estudio." };
    }
    if (e.status !== "UNAUTHORIZED" && e.status !== "BAD_REQUEST") console.error("[auth] Error al iniciar sesión", error);
    return { ok: false, message: "Email o contraseña incorrectos." };
  }
  if (twoFactor) redirect("/admin/login/verificar");
  const [u] = await getDb().select({ role: users.role }).from(users).where(eq(users.email, email));
  redirect(await takeAfterLogin(homeFor(u?.role)));
}

export async function signOut() {
  try {
    await getAuth().api.signOut({ headers: await headers() });
  } catch {
    // Sin sesión: no hay nada que cerrar
  }
  redirect("/admin/login");
}

// ───────────── consultas ─────────────

export async function moveLead(leadId: string, status: LeadStatus) {
  if (!LEAD_STATUSES.includes(status) || !UUID_RE.test(leadId)) return { ok: false };
  const staff = await requireOperator();
  const rows = await getDb()
    .update(leads)
    .set({ status })
    .where(and(eq(leads.id, leadId), eq(leads.studio_id, staff.studioId)))
    .returning({ id: leads.id });
  if (rows.length)
    await audit({ studioId: staff.studioId, actor: staff, action: "consultas.estado", entityType: "lead", entityId: leadId, metadata: { estado: status } });
  revalidatePath("/admin/consultas");
  revalidatePath("/admin");
  return { ok: rows.length > 0 };
}

export async function createLead(fd: FormData) {
  const user = await requireOperator();
  const name = s(fd, "name");
  if (!name) redirect("/admin/consultas/nueva?error=nombre");
  const source = s(fd, "source");
  let newId: string | null = null;
  try {
    const [row] = await getDb()
      .insert(leads)
      .values({
        studio_id: user.studioId,
        name,
        email: s(fd, "email"),
        phone: s(fd, "phone"),
        company: s(fd, "company"),
        contributor_type: s(fd, "contributor_type"),
        activity: s(fd, "activity"),
        message: s(fd, "message"),
        source: source === "whatsapp" || source === "otro" ? source : "manual",
        assigned_to: user.id,
      })
      .returning({ id: leads.id });
    newId = row?.id ?? null;
  } catch (error) {
    console.error("[admin] createLead", error);
  }
  if (!newId) redirect("/admin/consultas/nueva?error=guardar");
  revalidatePath("/admin/consultas");
  redirect(`/admin/consultas/${newId}`);
}

/** Responsable válido: un usuario activo del mismo estudio con rol de staff. */
async function staffOfStudio(userId: string | null, studioId: string) {
  if (!userId || !UUID_RE.test(userId)) return null;
  const [row] = await getDb()
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.studioId, studioId), inArray(users.role, STAFF_ROLES)));
  return row?.id ?? null;
}

export async function updateLead(fd: FormData) {
  const { studioId } = await requireOperator();
  const leadId = id(fd);
  if (!leadId) return;
  const status = s(fd, "status") as LeadStatus | null;
  const rows = await getDb()
    .update(leads)
    .set({
      name: s(fd, "name") ?? undefined,
      email: s(fd, "email"),
      phone: s(fd, "phone"),
      company: s(fd, "company"),
      status: status && LEAD_STATUSES.includes(status) ? status : undefined,
      assigned_to: await staffOfStudio(s(fd, "assigned_to"), studioId),
      next_action: s(fd, "next_action"),
      next_action_at: s(fd, "next_action_at"),
      notes: s(fd, "notes"),
      lost_reason: s(fd, "lost_reason"),
    })
    .where(and(eq(leads.id, leadId), eq(leads.studio_id, studioId)))
    .returning({ id: leads.id });
  if (rows.length === 0) redirect("/admin/consultas");
  revalidatePath("/admin/consultas");
  revalidatePath(`/admin/consultas/${leadId}`);
  revalidatePath("/admin");
  redirect(`/admin/consultas/${leadId}?guardado=1`);
}

export async function deleteLead(fd: FormData) {
  const { studioId } = await requireOperator();
  const leadId = id(fd);
  if (leadId)
    await getDb()
      .delete(leads)
      .where(and(eq(leads.id, leadId), eq(leads.studio_id, studioId)));
  revalidatePath("/admin/consultas");
  redirect("/admin/consultas");
}

// ───────────── novedades ─────────────

export async function savePost(fd: FormData) {
  const { studioId } = await requireOperator();
  const postId = id(fd);
  const title = s(fd, "title");
  if (!title) redirect(postId ? `/admin/contenidos/novedades/${postId}?error=titulo` : "/admin/contenidos/novedades/nueva?error=titulo");
  const published = fd.get("published") !== null;
  const payload = {
    title,
    slug: slugify(s(fd, "slug") ?? title),
    excerpt: s(fd, "excerpt"),
    body: s(fd, "body") ?? "",
    published,
  };
  const db = getDb();

  if (postId) {
    const [current] = await db
      .select({ published_at: posts.published_at })
      .from(posts)
      .where(and(eq(posts.id, postId), eq(posts.studio_id, studioId)));
    if (!current) redirect("/admin/contenidos/novedades");
    let failed = false;
    try {
      await db
        .update(posts)
        .set({ ...payload, published_at: published ? (current.published_at ?? new Date()) : current.published_at })
        .where(and(eq(posts.id, postId), eq(posts.studio_id, studioId)));
    } catch {
      failed = true; // slug repetido dentro del estudio
    }
    revalidateSite();
    redirect(`/admin/contenidos/novedades/${postId}?${failed ? "error=slug" : "guardado=1"}`);
  }

  let newId: string | null = null;
  try {
    const [row] = await db
      .insert(posts)
      .values({ studio_id: studioId, ...payload, published_at: published ? new Date() : null })
      .returning({ id: posts.id });
    newId = row?.id ?? null;
  } catch {
    // slug repetido dentro del estudio
  }
  if (!newId) redirect("/admin/contenidos/novedades/nueva?error=slug");
  revalidateSite();
  redirect(`/admin/contenidos/novedades/${newId}?guardado=1`);
}

export async function deletePost(fd: FormData) {
  const { studioId } = await requireOperator();
  const postId = id(fd);
  if (postId)
    await getDb()
      .delete(posts)
      .where(and(eq(posts.id, postId), eq(posts.studio_id, studioId)));
  revalidateSite();
  redirect("/admin/contenidos/novedades");
}

// ───────────── preguntas frecuentes ─────────────

export async function saveFaq(fd: FormData) {
  const { studioId } = await requireOperator();
  const faqId = id(fd);
  const question = s(fd, "question");
  const answer = s(fd, "answer");
  if (!question || !answer) redirect("/admin/contenidos/preguntas?error=campos");
  const payload = {
    question,
    answer,
    position: Number(s(fd, "position") ?? 0) || 0,
    published: fd.get("published") !== null,
  };
  const db = getDb();
  if (faqId)
    await db
      .update(faqs)
      .set(payload)
      .where(and(eq(faqs.id, faqId), eq(faqs.studio_id, studioId)));
  else await db.insert(faqs).values({ studio_id: studioId, ...payload });
  revalidateSite();
  redirect("/admin/contenidos/preguntas?guardado=1");
}

export async function deleteFaq(fd: FormData) {
  const { studioId } = await requireOperator();
  const faqId = id(fd);
  if (faqId)
    await getDb()
      .delete(faqs)
      .where(and(eq(faqs.id, faqId), eq(faqs.studio_id, studioId)));
  revalidateSite();
  redirect("/admin/contenidos/preguntas");
}

// ───────────── planes ─────────────

/** Precio publicado de un plan del brief (solo el texto que muestra la web) */
export async function savePlanPrice(fd: FormData) {
  const user = await requireOperator();
  const planId = id(fd);
  if (!planId) redirect("/admin/contenidos/planes");
  const price = (s(fd, "price_label") ?? "").slice(0, 80) || null;
  const [row] = await getDb()
    .update(service_plans)
    .set({ price_label: price })
    .where(and(eq(service_plans.id, planId), eq(service_plans.studio_id, user.studioId)))
    .returning({ key: service_plans.key });
  await audit({
    studioId: user.studioId,
    actor: user,
    action: "plan.precio",
    entityType: "service_plan",
    entityId: planId,
    result: row ? "ok" : "denegado",
    metadata: { plan: row?.key, precio: price },
    ip: await requestIp(),
  });
  revalidateSite();
  redirect("/admin/contenidos/planes?guardado=1");
}

// ───────────── usuarios (solo admin) ─────────────

export async function createStaffUser(fd: FormData) {
  const admin = await requireAdmin();
  const name = s(fd, "name");
  const email = s(fd, "email")?.toLowerCase() ?? null;
  const password = s(fd, "password");
  const role = s(fd, "role") as UserRole | null;
  if (!name || !email || !password) redirect("/admin/usuarios?error=campos");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) redirect("/admin/usuarios?error=email");
  if (password.length < 8) redirect("/admin/usuarios?error=password");
  const limit = await staffLimitError(admin.studioId);
  if (limit) redirect(`/admin/usuarios?error=limite&msg=${encodeURIComponent(limit)}`);

  let result = "creado=1";
  try {
    await createUserWithPassword(getDb(), {
      studioId: admin.studioId,
      name,
      email,
      password,
      role: role && STAFF_ROLES.includes(role) ? role : "contador",
    });
  } catch (error) {
    const code = pgCode(error);
    if (code !== "23505") console.error("[admin] createStaffUser", error);
    result = `error=${code === "23505" ? "repetido" : "guardar"}`;
  }
  revalidatePath("/admin/usuarios");
  redirect(`/admin/usuarios?${result}`);
}

export async function updateUserRole(fd: FormData) {
  const admin = await requireAdmin();
  const userId = id(fd);
  const role = s(fd, "role") as UserRole | null;
  if (!userId || !role || !STAFF_ROLES.includes(role)) redirect("/admin/usuarios?error=guardar");
  // Un admin no puede quitarse el rol a sí mismo (el estudio podría quedar sin admin)
  if (userId === admin.id) redirect("/admin/usuarios?error=propio");
  await getDb()
    .update(users)
    .set({ role })
    .where(and(eq(users.id, userId), eq(users.studioId, admin.studioId)));
  revalidatePath("/admin/usuarios");
  redirect("/admin/usuarios?guardado=1");
}

export async function setUserActive(fd: FormData) {
  const admin = await requireAdmin();
  const userId = id(fd);
  const active = s(fd, "active") === "1";
  if (!userId) redirect("/admin/usuarios?error=guardar");
  if (userId === admin.id) redirect("/admin/usuarios?error=propio");
  const db = getDb();
  const rows = await db
    .update(users)
    .set({ active })
    .where(and(eq(users.id, userId), eq(users.studioId, admin.studioId)))
    .returning({ id: users.id });
  // Al desactivar se cierran todas sus sesiones abiertas
  if (!active && rows.length > 0) await db.delete(sessions).where(eq(sessions.userId, userId));
  revalidatePath("/admin/usuarios");
  redirect(`/admin/usuarios?${active ? "activado=1" : "desactivado=1"}`);
}
