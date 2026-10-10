import "server-only";
import { and, count, eq, gt, inArray, isNull, or } from "drizzle-orm";
import { cache } from "react";
import { getDb } from "@/db";
import { organizations, studio_module_overrides, studios, users } from "@/db/schema";
import { FARO_MODULES, type FaroModuleKey } from "./modules";
import { getPlan, PLANS, type FaroPlan, type PlanLimits } from "./plans";

// Lo que un tenant puede usar: plan + overrides vigentes del Faro Manager.
// Toda acción que dependa del plan valida acá, en el servidor.

export type Tenant = typeof studios.$inferSelect;

export interface Entitlements {
  tenant: Tenant;
  plan: FaroPlan;
  modules: Set<FaroModuleKey>;
  limits: PlanLimits;
  /** Overrides vigentes (para mostrar de dónde sale cada módulo) */
  overrides: { module: FaroModuleKey; enabled: boolean; expiresAt: Date | null }[];
}

export const getEntitlements = cache(async (studioId: string): Promise<Entitlements | null> => {
  const db = getDb();
  const [tenant] = await db.select().from(studios).where(eq(studios.id, studioId));
  if (!tenant) return null;
  const plan = getPlan(tenant.plan_key) ?? PLANS.find((p) => p.kind === tenant.kind)!;
  const rows = await db
    .select()
    .from(studio_module_overrides)
    .where(and(eq(studio_module_overrides.studio_id, studioId), or(isNull(studio_module_overrides.expires_at), gt(studio_module_overrides.expires_at, new Date()))));
  const modules = new Set<FaroModuleKey>(plan.modules);
  const overrides = rows
    .filter((r) => FARO_MODULES.some((m) => m.key === r.module_key))
    .map((r) => ({ module: r.module_key as FaroModuleKey, enabled: r.enabled, expiresAt: r.expires_at }));
  for (const o of overrides) {
    if (o.enabled) modules.add(o.module);
    else modules.delete(o.module);
  }
  return { tenant, plan, modules, limits: plan.limits, overrides };
});

export async function hasModule(studioId: string, key: FaroModuleKey) {
  return Boolean((await getEntitlements(studioId))?.modules.has(key));
}

/** ¿La IA del tenant puede proponer acciones (escritura)? Señal y Destello: solo consultas. */
export async function aiCanAct(studioId: string) {
  const e = await getEntitlements(studioId);
  return Boolean(e && e.plan.ai !== "consultas");
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** null si entra una organización más; si no, el mensaje para la persona */
export async function organizationLimitError(studioId: string, adding = 1) {
  const e = await getEntitlements(studioId);
  const max = e?.limits.organizations;
  if (max == null) return null;
  const [{ n }] = await getDb().select({ n: count() }).from(organizations).where(and(eq(organizations.studio_id, studioId), inArray(organizations.status, ["onboarding", "activa", "pausada"])));
  if (n + adding <= max) return null;
  return `El plan ${e!.plan.name} permite hasta ${plural(max, "organización", "organizaciones")} y ya tenés ${n}. Pasate a un plan superior para sumar más.`;
}

/** null si entra una persona más del estudio; si no, el mensaje */
export async function staffLimitError(studioId: string) {
  const e = await getEntitlements(studioId);
  const max = e?.limits.staffUsers;
  if (max == null) return null;
  const [{ n }] = await getDb()
    .select({ n: count() })
    .from(users)
    .where(and(eq(users.studioId, studioId), inArray(users.role, ["admin", "contador", "colaborador"]), eq(users.active, true)));
  if (n < max) return null;
  return `El plan ${e!.plan.name} permite hasta ${plural(max, "persona", "personas")} en el estudio. Pasate a un plan superior para sumar más.`;
}
