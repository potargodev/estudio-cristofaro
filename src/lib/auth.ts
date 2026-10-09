import "server-only";
import { and, asc, eq, ne } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getDb } from "@/db";
import { memberships, organization_modules, organizations } from "@/db/schema";
import { audit } from "./audit";
import { getAuth } from "./auth-server";
import { can, type OrgRole, type Permission } from "./permissions";
import type { UserRole } from "./types";

export interface StaffUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  studioId: string;
  mustChangePassword: boolean;
}

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
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: (u.role ?? "contador") as UserRole,
    studioId: u.studioId,
    mustChangePassword: Boolean(u.mustChangePassword),
  };
});

/**
 * Usuario del estudio (admin o contador). Si no hay sesión lo manda al login;
 * si es un cliente, a /admin/sin-acceso. Toda query del backoffice tiene que
 * filtrar por el studioId que devuelve.
 */
export async function requireStaff(): Promise<StaffUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login");
  // Un cliente nunca entra al backoffice: va a su portal
  if (user.role === "cliente") redirect("/portal");
  if (user.role !== "admin" && user.role !== "contador") redirect("/admin/sin-acceso");
  // Contraseña temporal (reset-password): nada del backoffice hasta cambiarla
  if (user.mustChangePassword) redirect("/admin/cambiar-clave");
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
  if (user.role !== "cliente") redirect("/admin");
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
