import "server-only";
import { and, asc, eq, ne } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { assisted_access, employees, memberships, organization_modules, organizations, studios } from "@/db/schema";
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
  /** Nivel plataforma (Faro Manager), independiente del rol de tenant */
  faroRole: "faro_owner" | "faro_support" | null;
  /** Acceso asistido vigente: el usuario de Faro opera dentro de otro tenant */
  assisted: { id: string; studioName: string; expiresAt: Date; homeStudioId: string } | null;
  /** Tenant suspendido por el Faro Manager */
  tenantSuspended: boolean;
  /** Tipo de tenant: estudio, cuenta personal (autónomo) o persona (Bitácora) */
  tenantKind: "studio" | "personal" | "persona";
}

export type TenantKind = StaffUser["tenantKind"];

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
  const [row] = await db.select({ faroRole: users.faroRole, status: studios.status, kind: studios.kind }).from(users).innerJoin(studios, eq(studios.id, users.studioId)).where(eq(users.id, u.id));
  const faroRole = row?.faroRole === "faro_owner" || row?.faroRole === "faro_support" ? row.faroRole : null;
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
    tenantKind: row?.kind ?? "studio",
  };
  // Acceso asistido: solo el equipo de Faro, con 2FA, con un permiso vigente y propio
  const grantId = (await cookies()).get(ASSISTED_COOKIE)?.value;
  if (faroRole && base.twoFactorEnabled && grantId && /^[0-9a-f-]{36}$/i.test(grantId)) {
    const [g] = await db
      .select({ id: assisted_access.id, studioId: assisted_access.studio_id, expiresAt: assisted_access.expires_at, ended: assisted_access.ended_at, name: studios.name, status: studios.status, kind: studios.kind })
      .from(assisted_access)
      .innerJoin(studios, eq(studios.id, assisted_access.studio_id))
      .where(and(eq(assisted_access.id, grantId), eq(assisted_access.faro_user_id, u.id)));
    if (g && !g.ended && g.expiresAt > new Date()) {
      return { ...base, studioId: g.studioId, role: g.kind === "studio" ? "dueno" : "titular", tenantKind: g.kind, tenantSuspended: g.status === "suspendido", assisted: { id: g.id, studioName: g.name, expiresAt: g.expiresAt, homeStudioId: u.studioId } };
    }
  }
  return base;
});

const TENANT_HOME = { studio: "/admin", personal: "/personal", persona: "/personal" } as const;

/**
 * Guarda de nivel tenant. Sesión vigente de un usuario de tenant (estudio o
 * cuenta personal), con su seguridad completa: contraseña definitiva y, en el
 * estudio, segundo factor. Con `kind` exige ese tipo de tenant; con `roles`,
 * uno de esos roles (si no, sin-permiso y queda auditado). Toda query de
 * tenant filtra por el studioId que devuelve.
 */
export async function requireTenant(kind?: TenantKind | readonly TenantKind[] | null, roles?: readonly UserRole[]): Promise<StaffUser> {
  const user = await getCurrentUser();
  const kinds = kind ? (Array.isArray(kind) ? kind : [kind]) : null;
  if (!user) redirect(kinds && !kinds.includes("studio") ? "/ingresar" : "/admin/login");
  // Un miembro de una organización (o un empleado) nunca entra a un tenant: va a su portal
  if (user.role === "cliente") redirect(homeFor(user.role));
  const personal = user.role === "titular";
  if (!personal && !isStudioRole(user.role)) redirect("/admin/sin-acceso");
  if (kinds && !kinds.includes(user.tenantKind)) redirect(TENANT_HOME[user.tenantKind]);
  // Contraseña temporal (reset-password): nada hasta cambiarla
  if (user.mustChangePassword) redirect("/admin/cambiar-clave");
  // Segundo factor obligatorio para el estudio (la cuenta personal entra con Google, enlace o contraseña)
  if (!personal && !user.twoFactorEnabled) redirect("/admin/seguridad");
  if (user.tenantSuspended && !user.assisted) redirect(personal ? "/personal/suspendido" : "/admin/suspendido");
  if (roles && !roles.includes(user.role)) {
    await audit({ studioId: user.studioId, actor: user, action: "permiso.denegado", result: "denegado", metadata: { rol: user.role, requiere: roles } });
    redirect(personal ? "/personal" : "/admin/sin-permiso");
  }
  return user;
}

/** Dueño del tenant: dueño del estudio o titular de la cuenta personal (IA, MCP, plan) */
export const TENANT_OWNERS: readonly UserRole[] = ["dueno", "titular"];
export const requireTenantOwner = () => requireTenant(null, TENANT_OWNERS);

/** Usuario del estudio (dueño, contador o colaborador) */
export const requireStaff = () => requireTenant("studio");

/** Dueño o contador: lo que el colaborador no hace (consultas comerciales, alta y edición de organizaciones) */
export const requireOperator = () => requireTenant("studio", ["dueno", "contador"]);

/** Titular de una cuenta personal: autónomo (Faro Personal) o persona (Bitácora) */
export const requirePersonal = () => requireTenant(["personal", "persona"]);

/** Nivel plataforma (Faro Manager): faro_owner o faro_support, con 2FA */
export async function requireFaro(owner = false): Promise<StaffUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login");
  if (!user.faroRole) {
    await audit({ studioId: user.studioId, actor: user, action: "permiso.denegado", result: "denegado", metadata: { nivel: "faro" } });
    redirect(homeFor(user.role));
  }
  if (!user.twoFactorEnabled) redirect("/admin/seguridad");
  if (owner && user.faroRole !== "faro_owner") redirect("/faro-manager");
  return user;
}

/** Solo el dueño del estudio. */
export const requireAdmin = () => requireTenant("studio", ["dueno"]);

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
/** Guarda de nivel organización (portal): miembro activo, con el permiso pedido según su rol */
export const requireOrganization = (permission?: Permission) => requireMember(permission);

export interface EmployeeUser extends PortalUser {
  employee: { id: string; firstName: string; lastName: string; position: string | null };
}

/**
 * Guarda de nivel empleado: miembro con rol "empleado" en la organización
 * activa y su ficha en employees. Solo ve lo suyo (grupos de gastos,
 * rendiciones; después recibos y comunicaciones).
 */
export async function requireEmployee(): Promise<EmployeeUser> {
  const me = await requireMember();
  if (me.orgRole !== "empleado") redirect("/portal");
  const [e] = await getDb()
    .select({ id: employees.id, firstName: employees.first_name, lastName: employees.last_name, position: employees.position })
    .from(employees)
    .where(and(eq(employees.organization_id, me.organizationId), eq(employees.studio_id, me.studioId), eq(employees.user_id, me.id), eq(employees.active, true)));
  if (!e) {
    await audit({ studioId: me.studioId, organizationId: me.organizationId, actor: me, action: "permiso.denegado", result: "denegado", metadata: { nivel: "empleado" } });
    redirect("/portal/sin-acceso");
  }
  return { ...me, employee: e };
}

/** Usuario de tenant para rutas de API (sin redirects): estudio con 2FA o titular de cuenta personal */
export async function tenantForApi(): Promise<StaffUser | null> {
  const user = await getCurrentUser();
  if (!user || (!isStudioRole(user.role) && user.role !== "titular")) return null;
  if (user.mustChangePassword || (user.role !== "titular" && !user.twoFactorEnabled)) return null;
  if (user.tenantSuspended && !user.assisted) return null;
  return user;
}

export async function staffForApi(): Promise<StaffUser | null> {
  const user = await getCurrentUser();
  if (!user || !isStudioRole(user.role)) return null;
  if (user.mustChangePassword || !user.twoFactorEnabled) return null;
  if (user.tenantSuspended && !user.assisted) return null;
  return user;
}
