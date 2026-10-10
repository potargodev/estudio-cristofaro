"use server";

import { and, eq, gt, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { assisted_access, studio_module_overrides, studios, users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { ASSISTED_COOKIE, getCurrentUser, requireFaro } from "@/lib/auth";
import { esc, sendMail } from "@/lib/email";
import { isFaroModuleKey } from "@/lib/faro/modules";
import { getPlan, type TenantKind } from "@/lib/faro/plans";
import { createTenant } from "@/lib/faro/tenants";
import { mailLayout } from "@/lib/notify";
import { getSiteUrl } from "@/lib/runtime-config";
import { generatePassword } from "@/lib/users";

// Faro Manager: solo el equipo de Faro. Cambiar planes, módulos, estado y
// crear tenants es del owner; el soporte puede pedir acceso asistido. Todo
// queda en la auditoría del tenant afectado.

const BASE = "/faro-manager";
const s = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" && v.trim() ? v.trim() : null;
};
const back = (path: string, q: string): never => redirect(`${path}${path.includes("?") ? "&" : "?"}${q}`);

async function tenantOf(id: string | null) {
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [t] = await getDb().select().from(studios).where(eq(studios.id, id));
  return t ?? null;
}

export interface CreateTenantState {
  ok: boolean;
  message?: string;
  password?: string;
  email?: string;
  studioId?: string;
}

/** Alta manual de un estudio o un autónomo con su dueño (contraseña temporal) */
export async function createTenantAction(_prev: CreateTenantState, fd: FormData): Promise<CreateTenantState> {
  const faro = await requireFaro(true);
  const kind = (s(fd, "kind") === "personal" ? "personal" : "studio") as TenantKind;
  const password = generatePassword();
  const r = await createTenant({
    kind,
    name: s(fd, "name") ?? "",
    planKey: s(fd, "plan") ?? undefined,
    cuit: s(fd, "cuit"),
    owner: { name: s(fd, "owner_name") ?? "", email: s(fd, "owner_email") ?? "", password, mustChangePassword: true },
    via: "manual",
  });
  if (!r.ok) return { ok: false, message: r.message };
  const email = s(fd, "owner_email")!.toLowerCase();
  await audit({ studioId: r.studioId, actor: faro, action: "faro.tenant_crear", entityType: "tenant", entityId: r.studioId, metadata: { tipo: kind, plan: s(fd, "plan"), dueño: email } });
  await sendMail({
    to: email,
    subject: "Tu cuenta de Faro está lista",
    html: mailLayout(
      "Tu cuenta de Faro está lista",
      `<p>Entrá con <strong>${esc(email)}</strong> y esta contraseña temporal: <strong>${esc(password)}</strong>. Te va a pedir que la cambies${kind === "studio" ? " y que actives el segundo factor" : ""}.</p>`,
      { href: `${getSiteUrl()}${kind === "studio" ? "/admin/login" : "/ingresar"}`, label: "Entrar a Faro" },
    ),
  });
  revalidatePath(BASE);
  return { ok: true, password, email, studioId: r.studioId };
}

export async function setTenantPlan(fd: FormData) {
  const faro = await requireFaro(true);
  const t = await tenantOf(s(fd, "id"));
  const plan = getPlan(s(fd, "plan"));
  if (!t || !plan || plan.kind !== t.kind) back(BASE, "error=plan");
  await getDb().update(studios).set({ plan_key: plan!.key }).where(eq(studios.id, t!.id));
  await audit({ studioId: t!.id, actor: faro, action: "faro.plan", entityType: "tenant", entityId: t!.id, metadata: { antes: t!.plan_key, despues: plan!.key } });
  revalidatePath(`${BASE}/${t!.id}`);
  back(`${BASE}/${t!.id}`, "ok=Plan%20actualizado");
}

export async function setTenantStatus(fd: FormData) {
  const faro = await requireFaro(true);
  const t = await tenantOf(s(fd, "id"));
  if (!t) back(BASE, "error=tenant");
  const suspend = s(fd, "status") === "suspendido";
  const reason = s(fd, "reason");
  if (suspend && !reason) back(`${BASE}/${t!.id}`, "error=Escrib%C3%AD%20el%20motivo%20de%20la%20suspensi%C3%B3n");
  await getDb().update(studios).set({ status: suspend ? "suspendido" : "activo", suspended_reason: suspend ? reason : null }).where(eq(studios.id, t!.id));
  await audit({ studioId: t!.id, actor: faro, action: suspend ? "faro.suspender" : "faro.reactivar", entityType: "tenant", entityId: t!.id, metadata: { motivo: reason } });
  revalidatePath(`${BASE}/${t!.id}`);
  back(`${BASE}/${t!.id}`, `ok=${suspend ? "Tenant%20suspendido" : "Tenant%20reactivado"}`);
}

/** Habilita (o deshabilita) un módulo fuera del plan, con vencimiento opcional */
export async function setModuleOverride(fd: FormData) {
  const faro = await requireFaro(true);
  const t = await tenantOf(s(fd, "id"));
  const key = s(fd, "module");
  if (!t || !isFaroModuleKey(key)) back(BASE, "error=modulo");
  if (s(fd, "mode") === "quitar") {
    await getDb().delete(studio_module_overrides).where(and(eq(studio_module_overrides.studio_id, t!.id), eq(studio_module_overrides.module_key, key!)));
    await audit({ studioId: t!.id, actor: faro, action: "faro.modulo_override", entityType: "tenant", entityId: t!.id, metadata: { modulo: key, quitar: true } });
  } else {
    const enabled = s(fd, "enabled") !== "false";
    const until = s(fd, "expires");
    const expires = until && /^\d{4}-\d{2}-\d{2}$/.test(until) ? new Date(`${until}T23:59:59-03:00`) : null;
    const reason = s(fd, "reason");
    if (!reason) back(`${BASE}/${t!.id}`, "error=Escrib%C3%AD%20el%20motivo%20del%20override");
    const values = { enabled, expires_at: expires, reason, created_by: faro.id };
    await getDb()
      .insert(studio_module_overrides)
      .values({ studio_id: t!.id, module_key: key!, ...values })
      .onConflictDoUpdate({ target: [studio_module_overrides.studio_id, studio_module_overrides.module_key], set: values });
    await audit({ studioId: t!.id, actor: faro, action: "faro.modulo_override", entityType: "tenant", entityId: t!.id, metadata: { modulo: key, habilitado: enabled, vence: expires?.toISOString() ?? null, motivo: reason } });
  }
  revalidatePath(`${BASE}/${t!.id}`);
  back(`${BASE}/${t!.id}`, "ok=M%C3%B3dulo%20actualizado#modulos");
}

/** Acceso asistido: explícito (con motivo), temporal (hasta 2 horas) y auditado; se le avisa al dueño del tenant */
export async function startAssistedAccess(fd: FormData) {
  const faro = await requireFaro();
  const t = await tenantOf(s(fd, "id"));
  const reason = s(fd, "reason");
  const minutes = Math.min(120, Math.max(15, Number(s(fd, "minutes") ?? 60) || 60));
  if (!t) back(BASE, "error=tenant");
  if (t!.kind !== "studio") back(`${BASE}/${t!.id}`, "error=El%20acceso%20asistido%20por%20ahora%20es%20solo%20para%20estudios");
  if (!reason || reason.length < 10) back(`${BASE}/${t!.id}`, "error=Contá%20el%20motivo%20del%20acceso%20(al%20menos%2010%20caracteres)");
  const db = getDb();
  // Uno a la vez: se cierran los anteriores de esta persona
  await db.update(assisted_access).set({ ended_at: new Date() }).where(and(eq(assisted_access.faro_user_id, faro.id), isNull(assisted_access.ended_at), gt(assisted_access.expires_at, new Date())));
  const [g] = await db
    .insert(assisted_access)
    .values({ faro_user_id: faro.id, studio_id: t!.id, reason: reason!, expires_at: new Date(Date.now() + minutes * 60000) })
    .returning();
  await audit({ studioId: t!.id, actor: faro, action: "faro.asistido_iniciar", entityType: "acceso_asistido", entityId: g.id, metadata: { motivo: reason, minutos: minutes } });
  const owners = await db.select({ email: users.email }).from(users).where(and(eq(users.studioId, t!.id), eq(users.role, "dueno"), eq(users.active, true)));
  for (const o of owners) {
    await sendMail({
      to: o.email,
      subject: "El equipo de Faro abrió un acceso asistido a tu estudio",
      html: mailLayout(
        "Acceso asistido de Faro",
        `<p>${esc(faro.name)} (${esc(faro.email)}) abrió un acceso asistido a <strong>${esc(t!.name)}</strong> por ${minutes} minutos.</p><p>Motivo: ${esc(reason!)}</p><p style="color:#5a6176;font-size:13px">Todo lo que haga queda en la auditoría del estudio.</p>`,
      ),
    });
  }
  (await cookies()).set(ASSISTED_COOKIE, g.id, { httpOnly: true, sameSite: "lax", secure: getSiteUrl().startsWith("https"), maxAge: minutes * 60, path: "/" });
  redirect("/admin");
}

export async function endAssistedAccess() {
  const user = await getCurrentUser();
  const jar = await cookies();
  const id = jar.get(ASSISTED_COOKIE)?.value;
  jar.delete(ASSISTED_COOKIE);
  if (user?.assisted && id) {
    await getDb().update(assisted_access).set({ ended_at: new Date() }).where(and(eq(assisted_access.id, id), eq(assisted_access.faro_user_id, user.id)));
    await audit({ studioId: user.studioId, actor: user, action: "faro.asistido_terminar", entityType: "acceso_asistido", entityId: id });
  }
  redirect(BASE);
}
