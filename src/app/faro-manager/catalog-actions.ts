"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { faro_module_releases, faro_plans, faro_settings, plan_requests, studios } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requireFaro } from "@/lib/auth";
import { getPlanByKey, getPlans } from "@/lib/faro/entitlements";
import type { FaroPlan, PlanLimits } from "@/lib/faro/plans";
import { isFaroModuleKey } from "@/modules/registry";

// Catálogo del Faro Manager: planes (precios en USD, límites, módulos), la
// conversión USD → ARS, la liberación global de módulos, los límites y notas
// de cada tenant y los pedidos de cambio de plan. Solo el owner de Faro; todo
// queda en la auditoría de plataforma (o del tenant afectado).

const s = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
};
const num = (v: string) => {
  if (v === "") return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : null;
};
const back = (path: string, q: string): never => redirect(`${path}${path.includes("?") ? "&" : "?"}${q}`);
const LIMIT_KEYS: (keyof PlanLimits)[] = ["organizations", "staffUsers", "smartDocsPerMonth", "flows", "invoicesPerMonth"];

function rowOf(p: FaroPlan, position = 0) {
  return {
    key: p.key,
    kind: p.kind,
    name: p.name,
    tagline: p.tagline,
    for_whom: p.forWhom,
    price_usd: String(p.priceUsd),
    extra_org_usd: p.extraOrgUsd == null ? null : String(p.extraOrgUsd),
    trial_days: p.trialDays,
    free: p.free,
    recommended: !!p.recommended,
    ai: p.ai,
    limits: { ...p.limits },
    modules: [...p.modules],
    support: p.support,
    position,
  };
}

async function upsertPlan(p: FaroPlan, by: string) {
  const position = (await getPlans()).findIndex((x) => x.key === p.key);
  const row = { ...rowOf(p, Math.max(0, position)), updated_by: by };
  await getDb().insert(faro_plans).values(row).onConflictDoUpdate({ target: faro_plans.key, set: row });
}

export async function savePlanAction(fd: FormData) {
  const faro = await requireFaro(true);
  const current = await getPlanByKey(s(fd, "key"));
  if (!current) back("/faro-manager/planes", "error=Plan%20inexistente");
  const price = num(s(fd, "price_usd"));
  if (price === null) back("/faro-manager/planes", `error=${encodeURIComponent("El precio tiene que ser un número (0 para gratis).")}`);
  const limits = { ...current!.limits };
  for (const k of LIMIT_KEYS) {
    const v = s(fd, `limit_${k}`);
    limits[k] = v === "" ? null : Math.max(0, Math.round(Number(v)) || 0);
  }
  const next: FaroPlan = {
    ...current!,
    name: s(fd, "name").slice(0, 40) || current!.name,
    tagline: s(fd, "tagline").slice(0, 160) || current!.tagline,
    priceUsd: price!,
    free: price === 0,
    extraOrgUsd: current!.kind === "studio" ? num(s(fd, "extra_org_usd")) : null,
    trialDays: Math.min(90, Math.max(0, Math.round(Number(s(fd, "trial_days")) || 0))),
    recommended: fd.get("recommended") === "on",
    ai: (["consultas", "acciones", "avanzado"].includes(s(fd, "ai")) ? s(fd, "ai") : current!.ai) as FaroPlan["ai"],
    limits,
  };
  await upsertPlan(next, faro.id);
  await audit({ studioId: null, actor: faro, action: "faro.plan_editar", entityType: "plan", metadata: { plan: next.key, antes: { precio: current!.priceUsd, limites: current!.limits }, despues: { precio: next.priceUsd, limites: next.limits } } });
  revalidatePath("/faro-manager/planes");
  back("/faro-manager/planes", `ok=${encodeURIComponent(`Plan ${next.name} actualizado`)}#plan-${next.key}`);
}

/** Matriz plan × módulo: prende o apaga un módulo en un plan */
export async function togglePlanModuleAction(fd: FormData) {
  const faro = await requireFaro(true);
  const plan = await getPlanByKey(s(fd, "plan"));
  const mod = s(fd, "module");
  if (!plan || !isFaroModuleKey(mod)) back("/faro-manager/planes", "error=Dato%20inválido");
  const on = s(fd, "on") === "1";
  const modules = on ? [...new Set([...plan!.modules, mod as never])] : plan!.modules.filter((m) => m !== mod);
  await upsertPlan({ ...plan!, modules }, faro.id);
  await audit({ studioId: null, actor: faro, action: "faro.plan_modulo", entityType: "plan", metadata: { plan: plan!.key, modulo: mod, incluido: on } });
  revalidatePath("/faro-manager/planes");
  back("/faro-manager/planes", "ok=Matriz%20actualizada#matriz");
}

/** Conversión USD → ARS que ve el usuario */
export async function setUsdArsAction(fd: FormData) {
  const faro = await requireFaro(true);
  const v = num(s(fd, "usd_ars"));
  if (!v || v < 1) back("/faro-manager/planes", `error=${encodeURIComponent("Cargá cuántos pesos vale un dólar.")}`);
  await getDb()
    .insert(faro_settings)
    .values({ key: "usd_ars", value: v, updated_by: faro.id })
    .onConflictDoUpdate({ target: faro_settings.key, set: { value: v, updated_by: faro.id, updated_at: new Date() } });
  await audit({ studioId: null, actor: faro, action: "faro.conversion", entityType: "configuracion", metadata: { usd_ars: v } });
  revalidatePath("/faro-manager/planes");
  back("/faro-manager/planes", "ok=Conversión%20actualizada");
}

/** Liberación global de un módulo: próximamente → beta → disponible */
export async function setModuleReleaseAction(fd: FormData) {
  const faro = await requireFaro(true);
  const mod = s(fd, "module");
  const status = s(fd, "status");
  if (!isFaroModuleKey(mod) || !["proximamente", "beta", "disponible"].includes(status)) back("/faro-manager/modulos", "error=Dato%20inválido");
  await getDb()
    .insert(faro_module_releases)
    .values({ module_key: mod, status, updated_by: faro.id })
    .onConflictDoUpdate({ target: faro_module_releases.module_key, set: { status, updated_by: faro.id, updated_at: new Date() } });
  await audit({ studioId: null, actor: faro, action: "faro.modulo_liberar", entityType: "modulo", metadata: { modulo: mod, estado: status } });
  revalidatePath("/faro-manager/modulos");
  back("/faro-manager/modulos", "ok=Módulo%20actualizado");
}

/** Límites propios de un tenant (vacío = el del plan) */
export async function setTenantLimitsAction(fd: FormData) {
  const faro = await requireFaro(true);
  const id = s(fd, "id");
  const [t] = /^[0-9a-f-]{36}$/i.test(id) ? await getDb().select().from(studios).where(eq(studios.id, id)) : [];
  if (!t) back("/faro-manager/tenants", "error=tenant");
  const limits: Record<string, number | null> = {};
  for (const k of LIMIT_KEYS) {
    const v = s(fd, `limit_${k}`);
    if (v === "") continue;
    limits[k] = v === "∞" ? null : Math.max(0, Math.round(Number(v)) || 0);
  }
  await getDb().update(studios).set({ limits }).where(eq(studios.id, t!.id));
  await audit({ studioId: t!.id, actor: faro, action: "faro.limites", entityType: "tenant", entityId: t!.id, metadata: { antes: t!.limits, despues: limits } });
  revalidatePath(`/faro-manager/${t!.id}`);
  back(`/faro-manager/${t!.id}`, "ok=Límites%20actualizados");
}

export async function setTenantNotesAction(fd: FormData) {
  const faro = await requireFaro();
  const id = s(fd, "id");
  if (!/^[0-9a-f-]{36}$/i.test(id)) back("/faro-manager/tenants", "error=tenant");
  await getDb().update(studios).set({ notes: s(fd, "notes").slice(0, 4000) || null }).where(eq(studios.id, id));
  await audit({ studioId: id, actor: faro, action: "faro.notas", entityType: "tenant", entityId: id });
  revalidatePath(`/faro-manager/${id}`);
  back(`/faro-manager/${id}`, "ok=Notas%20guardadas");
}

/** Pedido "Quiero mejorar mi plan": aplicarlo (cambia el plan) o descartarlo */
export async function resolvePlanRequestAction(fd: FormData) {
  const faro = await requireFaro(true);
  const id = s(fd, "id");
  const db = getDb();
  const [r] = /^[0-9a-f-]{36}$/i.test(id) ? await db.select().from(plan_requests).where(eq(plan_requests.id, id)) : [];
  if (!r || r.status !== "pendiente") back("/faro-manager/pedidos", "error=Ese%20pedido%20ya%20se%20resolvió");
  const apply = s(fd, "decision") === "aplicar";
  if (apply) {
    const plan = await getPlanByKey(r!.to_plan);
    if (!plan) back("/faro-manager/pedidos", "error=Plan%20inexistente");
    await db
      .update(studios)
      .set({ plan_key: plan!.key, status: plan!.free || !plan!.trialDays ? "activo" : "prueba", trial_ends_at: plan!.free || !plan!.trialDays ? null : new Date(Date.now() + plan!.trialDays * 86400000) })
      .where(eq(studios.id, r!.studio_id));
  }
  await db.update(plan_requests).set({ status: apply ? "aplicado" : "descartado", resolved_by: faro.id, resolved_at: new Date() }).where(eq(plan_requests.id, r!.id));
  await audit({ studioId: r!.studio_id, actor: faro, action: apply ? "faro.plan" : "faro.pedido_descartar", entityType: "pedido_plan", entityId: r!.id, metadata: { de: r!.from_plan, a: r!.to_plan } });
  revalidatePath("/faro-manager/pedidos");
  back("/faro-manager/pedidos", `ok=${apply ? "Plan%20cambiado" : "Pedido%20descartado"}`);
}
