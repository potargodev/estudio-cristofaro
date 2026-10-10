import { and, count, eq, inArray } from "drizzle-orm";
import { Check, Compass, CreditCard, Minus } from "lucide-react";
import { Notice } from "@/components/admin/AdminField";
import { Panel } from "@/components/admin/kit/Panel";
import { StatusBadge, Tag } from "@/components/admin/kit/StatusBadge";
import { SubmitButton } from "@/components/admin/ui";
import { requestPlanUpgrade } from "@/app/admin/plan-actions";
import { getDb } from "@/db";
import { expense_groups, organizations, plan_requests, users } from "@/db/schema";
import { getEntitlements, getPlans } from "@/lib/faro/entitlements";
import { AI_LEVEL_LABEL, ANNUAL_FREE_MONTHS, annualUsd, formatArs, formatUsd, type FaroPlan } from "@/lib/faro/plans";
import { getUsdArs } from "@/lib/faro/pricing";
import { cn } from "@/lib/utils";
import { FARO_MODULES } from "@/modules/registry";

const day = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "long", year: "numeric" });

function Usage({ label, used, max }: { label: string; used: number; max: number | null }) {
  const pct = max ? Math.min(100, Math.round((used / max) * 100)) : 0;
  return (
    <div className="rounded-md border border-line bg-canvas px-4 py-3">
      <p className="text-[13px] text-muted">{label}</p>
      <p className="font-display text-[30px] leading-tight text-ink">
        {used}
        <span className="text-[18px] text-muted"> / {max ?? "∞"}</span>
      </p>
      {max != null && (
        <div className="mt-2 h-1.5 rounded bg-navy-soft" role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={used} aria-label={label}>
          <div className={cn("h-1.5 rounded", pct >= 90 ? "bg-danger" : "bg-navy")} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

const ars = (p: FaroPlan, usdArs: number) => (p.free || !p.priceUsd ? "Gratis" : `${formatArs(p.priceUsd * usdArs)} / mes`);

/**
 * "Plan y facturación" del dueño del tenant: plan actual, uso contra los
 * límites, comparación con precios en pesos y "Quiero mejorar mi plan" (queda
 * un pedido en el Faro Manager). Todo sale del tenant de la sesión.
 */
export async function PlanBilling({ studioId, back, pedido }: { studioId: string; back: string; pedido?: string }) {
  const e = (await getEntitlements(studioId))!;
  const db = getDb();
  const [plans, usdArs, [orgs], [staff], [groups], pending] = await Promise.all([
    getPlans(),
    getUsdArs(),
    db.select({ n: count() }).from(organizations).where(and(eq(organizations.studio_id, studioId), inArray(organizations.status, ["onboarding", "activa", "pausada"]))),
    db.select({ n: count() }).from(users).where(and(eq(users.studioId, studioId), inArray(users.role, ["dueno", "contador", "colaborador"]), eq(users.active, true))),
    db.select({ n: count() }).from(expense_groups).where(eq(expense_groups.studio_id, studioId)),
    db.select({ to: plan_requests.to_plan }).from(plan_requests).where(and(eq(plan_requests.studio_id, studioId), eq(plan_requests.status, "pendiente"))),
  ]);
  const kind = e.tenant.kind;
  const options = plans.filter((p) => p.kind === kind);
  const trialLeft = e.tenant.status === "prueba" && e.tenant.trial_ends_at ? Math.max(0, Math.ceil((e.tenant.trial_ends_at.getTime() - Date.now()) / 86400000)) : null;
  const overrideOf = new Map(e.overrides.map((o) => [o.module, o]));
  return (
    <div className="grid gap-6 [&>*]:min-w-0">
      {pedido === "1" && <Notice>Listo: recibimos tu pedido. El equipo de Faro te escribe para activar el plan.</Notice>}
      {pedido === "error" && <Notice tone="error">No pudimos registrar el pedido. Elegí otro plan.</Notice>}

      <Panel title={`Plan ${e.plan.name}`} icon={Compass} action={<Tag>{ars(e.plan, usdArs)}</Tag>}>
        <p className="text-[15px] text-muted">
          {e.plan.tagline} IA: {AI_LEVEL_LABEL[e.plan.ai]}. Soporte: {e.plan.support}.
        </p>
        {trialLeft != null && (
          <p className="mt-3 rounded-md border border-line bg-navy-soft px-4 py-2.5 text-[14px] text-ink">
            Estás en la prueba gratis: te quedan <strong className="font-semibold">{trialLeft} días</strong> (hasta el {day.format(e.tenant.trial_ends_at!)}). No te cobramos nada sin avisarte.
          </p>
        )}
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {kind === "studio" ? (
            <>
              <Usage label="Organizaciones" used={orgs.n} max={e.limits.organizations} />
              <Usage label="Personas del estudio" used={staff.n} max={e.limits.staffUsers} />
              <Usage label="Lectura inteligente por mes" used={0} max={e.limits.smartDocsPerMonth} />
            </>
          ) : (
            <>
              <Usage label="Grupos de gastos" used={groups.n} max={null} />
              {kind === "personal" && <Usage label="Comprobantes por mes" used={0} max={e.limits.invoicesPerMonth} />}
              <Usage label="Lectura inteligente por mes" used={0} max={e.limits.smartDocsPerMonth} />
            </>
          )}
        </div>
        {kind === "studio" && e.plan.extraOrgUsd != null && (
          <p className="mt-3 text-[13px] text-muted">
            Cada organización extra por encima de las incluidas: {formatArs(e.plan.extraOrgUsd * usdArs)} / mes ({formatUsd(e.plan.extraOrgUsd)}).
          </p>
        )}
      </Panel>

      <section aria-labelledby="comparar">
        <h2 id="comparar" className="font-display text-[26px] text-ink">
          Comparar planes
        </h2>
        <p className="mt-1 text-[14px] text-muted">
          Precios en pesos de referencia (1 USD = {formatArs(usdArs)}). Pagando el año, {ANNUAL_FREE_MONTHS} meses de regalo.
        </p>
        <div className={cn("mt-4 grid gap-4", options.length >= 3 ? "lg:grid-cols-3" : "sm:grid-cols-2")}>
          {options.map((p) => {
            const current = p.key === e.plan.key;
            const asked = pending.some((r) => r.to === p.key);
            const upgrade = !current && p.priceUsd > e.plan.priceUsd;
            return (
              <article key={p.key} className={cn("flex flex-col rounded-lg border bg-surface p-5", current ? "border-navy ring-1 ring-navy" : "border-line")}>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-[19px] font-semibold text-ink">{p.name}</h3>
                  {current ? <StatusBadge status="activa" label="Tu plan" /> : p.recommended ? <Tag>Recomendado</Tag> : null}
                </div>
                <p className="mt-1 text-[14px] text-muted">{p.tagline}</p>
                <p className="mt-4 font-display text-[34px] leading-none text-ink">{ars(p, usdArs)}</p>
                {!p.free && (
                  <p className="mt-1 text-[12px] text-muted">
                    {formatUsd(p.priceUsd)} / mes · anual {formatArs(annualUsd(p) * usdArs)}
                    {p.trialDays ? ` · ${p.trialDays} días gratis` : ""}
                  </p>
                )}
                <ul className="mt-4 grid gap-1.5 text-[13px] text-ink">
                  {kind === "studio" && <li>{p.limits.organizations == null ? "Organizaciones ilimitadas" : `Hasta ${p.limits.organizations} organizaciones`}</li>}
                  {kind === "studio" && <li>{p.limits.staffUsers == null ? "Equipo ilimitado" : `${p.limits.staffUsers} personas del estudio`}</li>}
                  <li>{AI_LEVEL_LABEL[p.ai]}</li>
                  {FARO_MODULES.filter((m) => !m.core && p.modules.includes(m.key))
                    .slice(0, 6)
                    .map((m) => (
                      <li key={m.key} className="flex gap-1.5">
                        <Check className="mt-0.5 size-3.5 shrink-0 text-rose-deep" aria-hidden />
                        {m.name}
                      </li>
                    ))}
                </ul>
                <div className="mt-auto pt-5">
                  {upgrade &&
                    (asked ? (
                      <p className="text-[13px] text-muted">Pedido enviado: te escribimos pronto.</p>
                    ) : (
                      <form action={requestPlanUpgrade}>
                        <input type="hidden" name="plan" value={p.key} />
                        <input type="hidden" name="back" value={back} />
                        <SubmitButton pendingText="Enviando…">Quiero mejorar mi plan</SubmitButton>
                      </form>
                    ))}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <Panel title="Módulos" bodyClassName="p-0">
        <ul className="divide-y divide-line">
          {FARO_MODULES.filter((m) => m.minPlan[kind]).map((m) => {
            const on = e.modules.has(m.key);
            const o = overrideOf.get(m.key);
            const from = options.find((p) => p.modules.includes(m.key));
            return (
              <li key={m.key} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-medium text-ink">
                    {on ? <Check className="size-4 text-[#1f5f36]" aria-hidden /> : <Minus className="size-4 text-muted" aria-hidden />}
                    {m.name}
                    {m.status === "proximamente" && <StatusBadge status="pendiente" label="Próximamente" />}
                    {o && <Tag>{o.enabled ? "Habilitado por Faro" : "Deshabilitado por Faro"}</Tag>}
                  </p>
                  <p className="mt-0.5 text-[13px] text-muted">{m.description}</p>
                </div>
                {!on && from && <span className="text-[13px] text-muted">Disponible en el plan {from.name}</span>}
              </li>
            );
          })}
        </ul>
      </Panel>

      <Panel title="Facturación" icon={CreditCard}>
        <p className="text-[14px] text-muted">
          El cobro en línea todavía no está activo: cuando pidas un plan pago, el equipo de Faro te contacta para activarlo y te manda la factura. Los precios se muestran en pesos con la conversión de referencia del día.
        </p>
      </Panel>
    </div>
  );
}
