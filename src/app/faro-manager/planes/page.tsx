import { Check } from "lucide-react";
import type { Metadata } from "next";
import { Notice } from "@/components/admin/AdminField";
import { PageHeader } from "@/components/admin/kit/PageHeader";
import { SubmitButton } from "@/components/admin/ui";
import { requireFaro } from "@/lib/auth";
import { getPlans } from "@/lib/faro/entitlements";
import { annualUsd, formatArs, formatUsd, KIND_PLANS_LABEL, type PlanLimits } from "@/lib/faro/plans";
import { getUsdArs } from "@/lib/faro/pricing";
import { cn } from "@/lib/utils";
import { PLAN_MODULES } from "@/modules/registry";
import { savePlanAction, setUsdArsAction, togglePlanModuleAction } from "../catalog-actions";

export const metadata: Metadata = { title: "Planes y precios" };

const LIMITS: [keyof PlanLimits, string][] = [
  ["organizations", "Organizaciones"],
  ["staffUsers", "Usuarios del estudio"],
  ["smartDocsPerMonth", "Lectura inteligente / mes"],
  ["flows", "Flujos activos"],
  ["invoicesPerMonth", "Comprobantes / mes"],
];
const input = "h-9 w-full rounded-md border border-line bg-surface px-2 text-[14px]";

/** Planes editables: precios en USD (con su equivalente en pesos), límites, matriz plan × módulo y conversión */
export default async function PlanesPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const me = await requireFaro();
  const owner = me.faroRole === "faro_owner";
  const [plans, usdArs] = await Promise.all([getPlans(), getUsdArs()]);
  return (
    <>
      {sp.ok && <Notice>{sp.ok}</Notice>}
      {sp.error && <Notice tone="error">{sp.error}</Notice>}
      <PageHeader title="Planes y precios" description="Precios de referencia en USD con su conversión a pesos, límites y módulos de cada plan. Lo que se cambia acá aplica a todos los tenants del plan (los overrides van en la ficha de cada uno)." />

      <section className="mb-6 flex flex-wrap items-end justify-between gap-4 rounded-lg border border-line bg-surface p-5">
        <div>
          <h2 className="text-[17px] font-semibold">Conversión a pesos</h2>
          <p className="text-[14px] text-muted">El usuario ve el precio en ARS: USD × esta cotización. Pago anual: 2 meses de regalo.</p>
        </div>
        <form action={setUsdArsAction} className="flex items-end gap-2">
          <label className="grid gap-1 text-[13px] text-muted">
            1 USD =
            <input name="usd_ars" defaultValue={usdArs} inputMode="decimal" disabled={!owner} className={cn(input, "w-32")} />
          </label>
          <span className="pb-2 text-[14px]">ARS</span>
          {owner && <SubmitButton pendingText="…">Guardar</SubmitButton>}
        </form>
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        {plans.map((p) => (
          <form key={p.key} id={`plan-${p.key}`} action={savePlanAction} className="scroll-mt-20 rounded-lg border border-line bg-surface p-5">
            <input type="hidden" name="key" value={p.key} />
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-rose-deep">{KIND_PLANS_LABEL[p.kind]}</p>
              <p className="tabular-nums text-[13px] text-muted">
                {p.free ? "Gratis" : `${formatUsd(p.priceUsd)} ≈ ${formatArs(p.priceUsd * usdArs)} / mes · anual ${formatUsd(annualUsd(p))}`}
              </p>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-[13px] text-muted">
                Nombre
                <input name="name" defaultValue={p.name} disabled={!owner} className={input} />
              </label>
              <label className="grid gap-1 text-[13px] text-muted">
                Precio USD / mes
                <input name="price_usd" defaultValue={p.priceUsd} inputMode="decimal" disabled={!owner} className={input} />
              </label>
              <label className="grid gap-1 text-[13px] text-muted sm:col-span-2">
                Bajada
                <input name="tagline" defaultValue={p.tagline} disabled={!owner} className={input} />
              </label>
              {p.kind === "studio" && (
                <label className="grid gap-1 text-[13px] text-muted">
                  Organización extra (USD / mes)
                  <input name="extra_org_usd" defaultValue={p.extraOrgUsd ?? ""} inputMode="decimal" disabled={!owner} className={input} />
                </label>
              )}
              <label className="grid gap-1 text-[13px] text-muted">
                Días de prueba
                <input name="trial_days" defaultValue={p.trialDays} inputMode="numeric" disabled={!owner} className={input} />
              </label>
              <label className="grid gap-1 text-[13px] text-muted">
                IA
                <select name="ai" defaultValue={p.ai} disabled={!owner} className={input}>
                  <option value="consultas">Consultas</option>
                  <option value="acciones">Consultas y acciones</option>
                  <option value="avanzado">Avanzado y agentes</option>
                </select>
              </label>
              <label className="flex items-center gap-2 self-end pb-2 text-[14px]">
                <input type="checkbox" name="recommended" defaultChecked={p.recommended} disabled={!owner} className="size-4 accent-navy" /> Recomendado
              </label>
            </div>
            <fieldset className="mt-4 grid gap-3 sm:grid-cols-3">
              <legend className="mb-1 text-[13px] font-medium">Límites (vacío = ilimitado)</legend>
              {LIMITS.map(([k, label]) => (
                <label key={k} className="grid gap-1 text-[12px] text-muted">
                  {label}
                  <input name={`limit_${k}`} defaultValue={p.limits[k] ?? ""} inputMode="numeric" disabled={!owner} className={input} />
                </label>
              ))}
            </fieldset>
            {owner && (
              <div className="mt-4">
                <SubmitButton pendingText="Guardando…">Guardar {p.name}</SubmitButton>
              </div>
            )}
          </form>
        ))}
      </div>

      <section id="matriz" className="mt-8 scroll-mt-20">
        <h2 className="font-display text-[28px]">Matriz plan × módulo</h2>
        <p className="mb-4 text-[14px] text-muted">El núcleo (organizaciones, conexiones, IA, grupos de gastos, rubros, Flotas) está en todos los planes.</p>
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full min-w-[960px] text-left text-[13px]">
            <thead className="border-b border-line text-[12px] text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Módulo</th>
                {plans.map((p) => (
                  <th key={p.key} className="px-2 py-3 text-center font-medium">
                    {KIND_PLANS_LABEL[p.kind].split(" ")[0]} · {p.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {PLAN_MODULES.map((m) => (
                <tr key={m.key}>
                  <th scope="row" className="px-4 py-2 font-normal text-ink">
                    {m.name}
                  </th>
                  {plans.map((p) => {
                    const on = p.modules.includes(m.key);
                    const applies = !!m.minPlan[p.kind] || on;
                    return (
                      <td key={p.key} className="px-2 py-1.5 text-center">
                        {applies ? (
                          <form action={togglePlanModuleAction}>
                            <input type="hidden" name="plan" value={p.key} />
                            <input type="hidden" name="module" value={m.key} />
                            <input type="hidden" name="on" value={on ? "0" : "1"} />
                            <button disabled={!owner} aria-label={`${m.name} en ${p.name}: ${on ? "incluido" : "no incluido"}`} className={cn("mx-auto grid size-7 place-items-center rounded-md border", on ? "border-navy bg-navy text-gold" : "border-line text-transparent hover:border-muted")}>
                              <Check className="size-4" aria-hidden />
                            </button>
                          </form>
                        ) : (
                          <span className="text-muted">·</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
