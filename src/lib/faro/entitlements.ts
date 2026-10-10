import "server-only";
import { and, count, eq, gt, inArray, isNull, or } from "drizzle-orm";
import { cache } from "react";
import { getDb } from "@/db";
import { faro_module_releases, faro_plans, organizations, studios, tenant_modules, users } from "@/db/schema";
import { FARO_MODULES, getFaroModule, type FaroModuleKey, type ModuleStatus } from "@/modules/registry";
import { PLANS, type AiLevel, type FaroPlan, type PlanLimits, type TenantKind } from "./plans";

// Lo que un tenant puede usar: núcleo + módulos del plan + overrides vigentes
// del Faro Manager (tenant_modules), con los límites del plan y los propios
// del tenant. Toda acción que dependa del plan valida acá, en el servidor:
// hasModule(), requireModule() y checkLimit().

export type Tenant = typeof studios.$inferSelect;

export interface Entitlements {
  tenant: Tenant;
  plan: FaroPlan;
  modules: Set<FaroModuleKey>;
  limits: PlanLimits;
  /** Overrides vigentes (para mostrar de dónde sale cada módulo) */
  overrides: { module: FaroModuleKey; enabled: boolean; expiresAt: Date | null }[];
}

const CORE = FARO_MODULES.filter((m) => m.core).map((m) => m.key);
const LIMIT_KEYS: (keyof PlanLimits)[] = ["organizations", "staffUsers", "smartDocsPerMonth", "flows", "invoicesPerMonth"];

function fromRow(r: typeof faro_plans.$inferSelect, base?: FaroPlan): FaroPlan {
  const limits = { ...(base?.limits ?? { organizations: null, staffUsers: null, smartDocsPerMonth: null, flows: null, invoicesPerMonth: null }) };
  for (const k of LIMIT_KEYS) if (k in r.limits) limits[k] = r.limits[k] ?? null;
  return {
    key: r.key,
    kind: r.kind,
    name: r.name,
    tagline: r.tagline,
    forWhom: r.for_whom,
    priceUsd: Number(r.price_usd),
    extraOrgUsd: r.extra_org_usd == null ? null : Number(r.extra_org_usd),
    trialDays: r.trial_days,
    free: r.free,
    recommended: r.recommended,
    ai: (["consultas", "acciones", "avanzado"].includes(r.ai) ? r.ai : "consultas") as AiLevel,
    limits,
    modules: r.modules.filter((m): m is FaroModuleKey => FARO_MODULES.some((x) => x.key === m)),
    support: r.support,
  };
}

/** Planes vigentes: los de la base (editables en el Faro Manager) o, si no están, los de la configuración */
export const getPlans = cache(async (): Promise<FaroPlan[]> => {
  const rows = await getDb().select().from(faro_plans);
  const out = PLANS.map((p) => {
    const r = rows.find((x) => x.key === p.key);
    return r ? fromRow(r, p) : p;
  });
  for (const r of rows) if (!out.some((p) => p.key === r.key)) out.push(fromRow(r));
  return out;
});

export async function getPlanByKey(key: string | null | undefined) {
  return (await getPlans()).find((p) => p.key === key);
}

/** Estado de un módulo con la liberación global del Faro Manager */
export const getModuleStatuses = cache(async (): Promise<Record<string, ModuleStatus>> => {
  const rows = await getDb().select().from(faro_module_releases);
  const out: Record<string, ModuleStatus> = {};
  for (const m of FARO_MODULES) out[m.key] = m.status;
  for (const r of rows) if (r.status === "disponible" || r.status === "beta" || r.status === "proximamente") out[r.module_key] = r.status;
  return out;
});

export const getEntitlements = cache(async (studioId: string): Promise<Entitlements | null> => {
  const db = getDb();
  const [tenant] = await db.select().from(studios).where(eq(studios.id, studioId));
  if (!tenant) return null;
  const plans = await getPlans();
  const plan = plans.find((p) => p.key === tenant.plan_key) ?? plans.find((p) => p.kind === tenant.kind)!;
  const rows = await db
    .select()
    .from(tenant_modules)
    .where(and(eq(tenant_modules.studio_id, studioId), or(isNull(tenant_modules.expires_at), gt(tenant_modules.expires_at, new Date()))));
  const modules = new Set<FaroModuleKey>([...CORE, ...plan.modules]);
  const overrides = rows
    .filter((r) => FARO_MODULES.some((m) => m.key === r.module_key))
    .map((r) => ({ module: r.module_key as FaroModuleKey, enabled: r.enabled, expiresAt: r.expires_at }));
  for (const o of overrides) {
    if (o.enabled) modules.add(o.module);
    else if (!CORE.includes(o.module)) modules.delete(o.module);
  }
  // Límites propios del tenant (Faro Manager) por encima de los del plan
  const limits = { ...plan.limits };
  for (const k of LIMIT_KEYS) if (tenant.limits && k in tenant.limits) limits[k] = tenant.limits[k] ?? null;
  return { tenant, plan, modules, limits, overrides };
});

export async function hasModule(studioId: string, key: FaroModuleKey) {
  return Boolean((await getEntitlements(studioId))?.modules.has(key));
}

export type ModuleAvailability =
  | { state: "activo" }
  | { state: "plan"; plan: FaroPlan | null }
  | { state: "proximamente"; plan: FaroPlan | null };

/** Cómo está un módulo para un tenant: activo, disponible en un plan superior o próximamente */
export async function moduleAvailability(studioId: string, key: FaroModuleKey): Promise<ModuleAvailability> {
  const [e, statuses, plans] = await Promise.all([getEntitlements(studioId), getModuleStatuses(), getPlans()]);
  const kind: TenantKind = e?.tenant.kind ?? "studio";
  const minKey = getFaroModule(key)?.minPlan[kind];
  const plan = plans.find((p) => p.kind === kind && p.modules.includes(key)) ?? plans.find((p) => p.key === minKey) ?? null;
  if (statuses[key] === "proximamente") return { state: "proximamente", plan };
  if (e?.modules.has(key)) return { state: "activo" };
  return { state: "plan", plan };
}

/** ¿La IA del tenant puede proponer acciones (escritura)? Inicial y planes gratis: solo consultas. */
export async function aiCanAct(studioId: string) {
  const e = await getEntitlements(studioId);
  return Boolean(e && e.plan.ai !== "consultas");
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export type LimitKey = keyof PlanLimits;
const LIMIT_TEXT: Record<LimitKey, [string, string]> = {
  organizations: ["organización", "organizaciones"],
  staffUsers: ["persona del estudio", "personas del estudio"],
  smartDocsPerMonth: ["documento por mes", "documentos por mes"],
  flows: ["flujo activo", "flujos activos"],
  invoicesPerMonth: ["comprobante por mes", "comprobantes por mes"],
};

/** Uso actual de un límite (los de módulos que todavía no existen cuentan 0) */
export async function limitUsage(studioId: string, key: LimitKey): Promise<number> {
  const db = getDb();
  if (key === "organizations") {
    const [{ n }] = await db
      .select({ n: count() })
      .from(organizations)
      .where(and(eq(organizations.studio_id, studioId), inArray(organizations.status, ["onboarding", "activa", "pausada"])));
    return n;
  }
  if (key === "staffUsers") {
    const [{ n }] = await db
      .select({ n: count() })
      .from(users)
      .where(and(eq(users.studioId, studioId), inArray(users.role, ["dueno", "contador", "colaborador"]), eq(users.active, true)));
    return n;
  }
  return 0;
}

/**
 * Límite del plan en el servidor: null si entra `adding` más; si no, el
 * mensaje para la persona (con el plan que lo resuelve).
 */
export async function checkLimit(studioId: string, key: LimitKey, adding = 1): Promise<string | null> {
  const e = await getEntitlements(studioId);
  const max = e?.limits[key];
  if (max == null) return null;
  const used = await limitUsage(studioId, key);
  if (used + adding <= max) return null;
  const [one, many] = LIMIT_TEXT[key];
  const next = (await getPlans()).find((p) => p.kind === e!.tenant.kind && (p.limits[key] == null || p.limits[key]! > max));
  return `El plan ${e!.plan.name} permite hasta ${plural(max, one, many)} y ya ${used === 1 ? "hay 1" : `hay ${used}`}.${next ? ` Con ${next.name} entran ${next.limits[key] == null ? "sin límite" : next.limits[key]}.` : ""} Podés pedir el cambio en Plan y facturación.`;
}

/** null si entra una organización más; si no, el mensaje para la persona */
export const organizationLimitError = (studioId: string, adding = 1) => checkLimit(studioId, "organizations", adding);

/** null si entra una persona más del estudio; si no, el mensaje */
export const staffLimitError = (studioId: string) => checkLimit(studioId, "staffUsers", 1);
