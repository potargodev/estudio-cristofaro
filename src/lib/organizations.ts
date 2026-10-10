import "server-only";
import { and, count, eq, gt, inArray, isNotNull, isNull, or } from "drizzle-orm";
import { getDb } from "@/db";
import { invitations, legal_entities, memberships, organization_modules, organization_staff, organizations, service_plans, users } from "@/db/schema";
import { isUuid } from "./ids";

// Helpers de organizaciones para el servidor: pertenencia al estudio, límites
// del plan y equipo del estudio. Los límites se validan SIEMPRE acá, nunca
// solo en la interfaz.

/** Organización del estudio del usuario, o null (id inválido o de otro estudio) */
export async function studioOrganization(organizationId: string | null | undefined, studioId: string) {
  if (!organizationId || !isUuid(organizationId)) return null;
  const [org] = await getDb()
    .select()
    .from(organizations)
    .where(and(eq(organizations.id, organizationId), eq(organizations.studio_id, studioId)));
  return org ?? null;
}

export type LimitKey = "legal_entities" | "users" | "modules";

export const LIMIT_LABELS: Record<LimitKey, [string, string]> = {
  legal_entities: ["razón social", "razones sociales"],
  users: ["usuario", "usuarios"],
  modules: ["módulo", "módulos"],
};

const limitLabel = (key: LimitKey, n: number) => LIMIT_LABELS[key][n === 1 ? 0 : 1];

export interface OrgLimits {
  planName: string | null;
  /** null = sin plan asignado: no se aplican límites hasta que el estudio elija uno */
  max: Record<LimitKey, number> | null;
  used: Record<LimitKey, number>;
  /** Excepciones otorgadas por el estudio (se suman al plan) */
  extra: Record<LimitKey, number>;
}

/**
 * Límites efectivos y consumo. Los usuarios cuentan membresías activas más
 * invitaciones pendientes vigentes (así no se puede invitar de más).
 */
export async function getOrgLimits(organizationId: string): Promise<OrgLimits> {
  const db = getDb();
  const [[org], [le], [mem], [inv], [mods]] = await Promise.all([
    db
      .select({ overrides: organizations.limit_overrides, plan: service_plans })
      .from(organizations)
      .leftJoin(service_plans, eq(service_plans.id, organizations.service_plan_id))
      .where(eq(organizations.id, organizationId)),
    db.select({ n: count() }).from(legal_entities).where(eq(legal_entities.organization_id, organizationId)),
    db
      .select({ n: count() })
      .from(memberships)
      .where(and(eq(memberships.organization_id, organizationId), eq(memberships.status, "activa"))),
    db
      .select({ n: count() })
      .from(invitations)
      .where(and(eq(invitations.organization_id, organizationId), eq(invitations.status, "pendiente"), gt(invitations.expires_at, new Date()))),
    db
      .select({ n: count() })
      .from(organization_modules)
      .where(and(eq(organization_modules.organization_id, organizationId), eq(organization_modules.active, true))),
  ]);
  const o = org?.overrides ?? {};
  const extra = {
    legal_entities: o.legal_entities ?? 0,
    users: o.users ?? 0,
    modules: o.modules ?? 0,
  };
  const plan = org?.plan;
  return {
    planName: plan?.name ?? null,
    max: plan
      ? {
          legal_entities: plan.max_legal_entities + extra.legal_entities,
          users: plan.max_users + extra.users,
          modules: plan.max_modules + extra.modules,
        }
      : null,
    used: { legal_entities: le.n, users: mem.n + inv.n, modules: mods.n },
    extra,
  };
}

/** ¿Entra uno más? Devuelve el mensaje de error si se pasa del límite. */
export function checkLimit(limits: OrgLimits, key: LimitKey, adding = 1): string | null {
  if (!limits.max) return null;
  if (limits.used[key] + adding <= limits.max[key]) return null;
  return `El plan ${limits.planName} permite hasta ${limits.max[key]} ${limitLabel(key, limits.max[key])} y ya ${limits.used[key] === 1 ? "hay 1 en uso" : `hay ${limits.used[key]} en uso`}. Para sumar más hay que cambiar de plan o pedirle una excepción al estudio.`;
}

/** Responsable principal y colaboradores del estudio asignados a la organización */
export async function getOrgStaff(organizationId: string) {
  return getDb()
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      image: users.image,
      assignment: organization_staff.assignment,
    })
    .from(organization_staff)
    .innerJoin(users, eq(users.id, organization_staff.user_id))
    .where(and(eq(organization_staff.organization_id, organizationId), eq(users.active, true)))
    .orderBy(organization_staff.assignment);
}

/** Responsables principales de varias organizaciones (para listados) */
export async function getLeadsFor(organizationIds: string[]) {
  if (organizationIds.length === 0) return new Map<string, string>();
  const rows = await getDb()
    .select({ org: organization_staff.organization_id, name: users.name })
    .from(organization_staff)
    .innerJoin(users, eq(users.id, organization_staff.user_id))
    .where(and(inArray(organization_staff.organization_id, organizationIds), eq(organization_staff.assignment, "responsable")));
  return new Map(rows.map((r) => [r.org, r.name]));
}

/** Invitación utilizable: pendiente, vigente y (si requiere) confirmada por el estudio */
export const usableInvitation = () =>
  and(
    eq(invitations.status, "pendiente"),
    gt(invitations.expires_at, new Date()),
    or(eq(invitations.needs_approval, false), isNotNull(invitations.approved_at)),
  );

export const awaitingApproval = () =>
  and(
    eq(invitations.status, "pendiente"),
    eq(invitations.needs_approval, true),
    isNull(invitations.approved_at),
    gt(invitations.expires_at, new Date()),
  );

/** Personas activas del estudio (para asignar responsables) */
export async function getStudioStaff(studioId: string) {
  return getDb()
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(and(eq(users.studioId, studioId), inArray(users.role, ["admin", "contador", "colaborador"]), eq(users.active, true)))
    .orderBy(users.name);
}

export async function getServicePlans(studioId: string) {
  return getDb().select().from(service_plans).where(eq(service_plans.studio_id, studioId)).orderBy(service_plans.position);
}
