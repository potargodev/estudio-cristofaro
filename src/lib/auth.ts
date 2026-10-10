import "server-only";
import { and, asc, eq, ne } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { assisted_access, memberships, organization_modules, organizations, studios } from "@/db/schema";
import { audit } from "./audit";
import { getAuth } from "./auth-server";
import { can, type OrgRole, type Permission } from "./permissions";
import { homeFor, isStudioRole } from "./roles";
import type { UserRole } from "./types";

export interface StaffUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  studioId: string;
  mustChangePassword: boolean;
  twoFactorEnabled: boolean;
  /** Equipo de Faro: owner | soporte */
  faroRole: "owner" | "soporte" | null;
  /** Acceso asistido vigente: el usuario de Faro opera dentro de otro tenant */
  assisted: { id: string; studioName: string; expiresAt: Date; homeStudioId: string } | null;
  /** Tenant suspendido por el Faro Manager */
  tenantSuspended: boolean;
}

export const ASSISTED_COOKIE = "faro_asistido";

/** Sesión válida del pedido actual (consulta la base) o null. */
export const getCurrentUser = cache(async (): Promise<StaffUser | null> => {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return null;
  const u = session.user as typeof session.user & {
    role?: string;
    studioId?: string;
    active?: boolean;
    mustChangePassword?: boolean;
  };
  if (!u.studioId || u.active === false) return null;
  const db = getDb();
  const [row] = await db.select({ faroRole: users.faroRole, status: studios.status }).from(users).innerJoin(studios, eq(studios.id, users.studioId)).where(eq(users.id, u.id));
  const faroRole = row?.faroRole === "owner" || row?.faroRole === "soporte" ? row.faroRole : null;
  const base: StaffUser = {
    id: u.id,
    name: u.name,
    email: u.email,
    role: (u.role ?? "contador") as UserRole,
    studioId: u.studioId,
    mustChangePassword: Boolean(u.mustChangePassword),
    twoFactorEnabled: Boolean(u.twoFactorEnabled),
    faroRole,
    assisted: null,
    tenantSuspended: row?.status === "suspendido",
  };
  // Acceso asistido: solo el equipo de Faro, con 2FA, con un permiso vigente y propio
  const grantId = (await cookies()).get(ASSISTED_COOKIE)?.value;
  if (faroRole && base.twoFactorEnabled && grantId && /^[0-9a-f-]{36}$/i.test(grantId)) {
    const [g] = await db
      .select({ id: assisted_access.id, studioId: assisted_access.studio_id, expiresAt: assisted_access.expires_at, ended: assisted_access.ended_at, name: studios.name, status: studios.status })
      .from(assisted_access)
      .innerJoin(studios, eq(studios.id, assisted_access.studio_id))
      .where(and(eq(assisted_access.id, grantId), eq(assisted_access.faro_user_id, u.id)));
    if (g && !g.ended && g.expiresAt > new Date()) {
      return { ...base, studioId: g.studioId, role: "admin", tenantSuspended: g.status === "suspendido", assisted: { id: g.id, studioName: g.name, expiresAt: g.expiresAt, homeStudioId: u.studioId } };
    }
  }
  return base;
});

/**
 * Usuario del estudio (admin o contador). Si no hay sesión lo manda al login;
 * si es un cliente, a /admin/sin-acceso. Toda query del backoffice tiene que
 * filtrar por el studioId que devuelve.
 */
export async function requireStaff(): Promise<StaffUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login");
  // Un cliente o un autónomo nunca entran al backoffice del estudio: van a su panel
  if (user.role === "cliente" || user.role === "autonomo") redirect(homeFor(user.role));
  if (!isStudioRole(user.role)) redirect("/admin/sin-acceso");
  // Contraseña temporal (reset-password): nada del backoffice hasta cambiarla
  if (user.mustChangePassword) redirect("/admin/cambiar-clave");
  // Segundo factor obligatorio para el estudio: hasta configurarlo, solo esa pantalla
  if (!user.twoFactorEnabled) redirect("/admin/seguridad");
  // Tenant suspendido por Faro: nada del backoffice (salvo el acceso asistido)
  if (user.tenantSuspended && !user.assisted) redirect("/admin/suspendido");
  return user;
}

/** Dueño o contador: lo que el colaborador no hace (consultas comerciales, alta y edición de organizaciones) */
export async function requireOperator(): Promise<StaffUser> {
  const user = await requireStaff();
  if (user.role === "colaborador") {
    await audit({ studioId: user.studioId, actor: user, action: "permiso.denegado", result: "denegado", metadata: { rol: "colaborador" } });
    redirect("/admin/sin-permiso");
  }
  return user;
}

/** Autónomo de Faro Personal en su panel */
export async function requirePersonal(): Promise<StaffUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/ingresar");
  if (user.role !== "autonomo") redirect(homeFor(user.role));
  if (user.tenantSuspended) redirect("/personal/suspendido");
  return user;
}

/** Equipo de Faro (Faro Manager): owner o soporte, con 2FA */
export async function requireFaro(owner = false): Promise<StaffUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login");
  if (!user.faroRole) redirect(homeFor(user.role));
  if (!user.twoFactorEnabled) redirect("/admin/seguridad");
  if (owner && user.faroRole !== "owner") redirect("/faro-manager");
  return user;
}

/** Solo administradores del estudio. */
export async function requireAdmin(): Promise<StaffUser> {
  const user = await requireStaff();
  if (user.role !== "admin") redirect("/admin");
  return user;
}

export interface MembershipSummary {
  organizationId: string;
  organizationName: string;
  role: OrgRole;
}

export interface PortalUser extends StaffUser {
  organizationId: string;
  organizationName: string;
  orgRole: OrgRole;
  /** Todas las organizaciones a las que pertenece (para el selector) */
  memberships: MembershipSummary[];
  /** Claves de los módulos activos de la organización */
  modules: string[];
}

export const ORG_COOKIE = "portal_org";

/** Membresías activas del usuario en organizaciones vigentes de su estudio */
export const getMemberships = cache(async (userId: string, studioId: string): Promise<MembershipSummary[]> => {
  return getDb()
    .select({
      organizationId: organizations.id,
      organizationName: organizations.name,
      role: memberships.role,
    })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.organization_id))
    .where(
      and(
        eq(memberships.user_id, userId),
        eq(memberships.status, "activa"),
        eq(memberships.studio_id, studioId),
        eq(organizations.studio_id, studioId),
        ne(organizations.status, "baja"),
      ),
    )
    .orderBy(asc(organizations.name));
});

/**
 * Miembro del portal y la organización activa. La organización sale de la
 * cookie de selección SOLO si el usuario tiene una membresía activa en ella;
 * si no, se usa la primera. Toda query del portal filtra por el
 * organizationId (y el studioId) que devuelve: nunca por un id del navegador.
 * Con `permission`, además exige ese permiso según la matriz de roles.
 */
export const requireMember = cache(async (permission?: Permission): Promise<PortalUser> => {
  const user = await getCurrentUser();
  if (!user) redirect("/portal/login");
  if (user.role !== "cliente") redirect(homeFor(user.role));
  if (user.tenantSuspended) redirect("/portal/sin-acceso");
  const list = await getMemberships(user.id, user.studioId);
  if (list.length === 0) redirect("/portal/sin-acceso");
  const wanted = (await cookies()).get(ORG_COOKIE)?.value;
  const current = list.find((m) => m.organizationId === wanted) ?? list[0];
  if (permission && !can(current.role, permission)) {
    await audit({
      studioId: user.studioId,
      organizationId: current.organizationId,
      actor: user,
      action: "permiso.denegado",
      result: "denegado",
      metadata: { permiso: permission, rol: current.role },
    });
    redirect("/portal/sin-permiso");
  }
  const mods = await getDb()
    .select({ key: organization_modules.module_key })
    .from(organization_modules)
    .where(and(eq(organization_modules.organization_id, current.organizationId), eq(organization_modules.active, true)));
  return {
    ...user,
    organizationId: current.organizationId,
    organizationName: current.organizationName,
    orgRole: current.role,
    memberships: list,
    modules: mods.map((m) => m.key),
  };
});

/**
 * Usuario del estudio para rutas de API (sin redirects): sesión vigente, rol
 * admin o contador, contraseña definitiva y segundo factor activo. Si no, null.
 */
export async function staffForApi(): Promise<StaffUser | null> {
  const user = await getCurrentUser();
  if (!user || !isStudioRole(user.role)) return null;
  if (user.mustChangePassword || !user.twoFactorEnabled) return null;
  if (user.tenantSuspended && !user.assisted) return null;
  return user;
}
