import { and, count, eq, inArray } from "drizzle-orm";
import { Check, Compass, Minus } from "lucide-react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/kit/PageHeader";
import { Panel } from "@/components/admin/kit/Panel";
import { StatusBadge, Tag } from "@/components/admin/kit/StatusBadge";
import { getDb } from "@/db";
import { organizations, users } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { getEntitlements } from "@/lib/faro/entitlements";
import { FARO_MODULES } from "@/lib/faro/modules";
import { AI_LEVEL_LABEL, plansFor, priceLabel } from "@/lib/faro/plans";

export const metadata: Metadata = { title: "Plan y módulos" };

const day = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", year: "numeric" });

function Usage({ label, used, max }: { label: string; used: number; max: number | null }) {
  const pct = max ? Math.min(100, Math.round((used / max) * 100)) : 0;
  return (
    <div className="border border-line bg-paper px-4 py-3">
      <p className="text-[13px] text-muted">{label}</p>
      <p className="font-display text-[30px] leading-tight text-ink">
        {used}
        <span className="text-[18px] text-muted"> / {max ?? "∞"}</span>
      </p>
      {max != null && (
        <div className="mt-2 h-1.5 bg-navy-soft" aria-hidden>
          <div className={pct >= 90 ? "h-1.5 bg-danger" : "h-1.5 bg-rose-deep"} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

export default async function PlanPage() {
  const admin = await requireAdmin();
  const e = (await getEntitlements(admin.studioId))!;
  const db = getDb();
  const [[orgs], [staff]] = await Promise.all([
    db.select({ n: count() }).from(organizations).where(and(eq(organizations.studio_id, admin.studioId), inArray(organizations.status, ["onboarding", "activa", "pausada"]))),
    db.select({ n: count() }).from(users).where(and(eq(users.studioId, admin.studioId), inArray(users.role, ["admin", "contador", "colaborador"]), eq(users.active, true))),
  ]);
  const plans = plansFor(e.tenant.kind);
  const overrideOf = new Map(e.overrides.map((o) => [o.module, o]));
  return (
    <div className="max-w-5xl">
      <PageHeader title="Plan y módulos" description="Lo que incluye el plan de Faro del estudio. Los límites se aplican solos; para cambiar de plan escribinos." />
      <div className="grid gap-6 [&>*]:min-w-0">
        <Panel title={`Plan ${e.plan.name}`} icon={Compass} action={<Tag>{priceLabel(e.plan)}</Tag>}>
          <p className="text-[15px] text-muted">{e.plan.tagline} IA: {AI_LEVEL_LABEL[e.plan.ai]}. Soporte: {e.plan.support}.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Usage label="Organizaciones" used={orgs.n} max={e.limits.organizations} />
            <Usage label="Personas del estudio" used={staff.n} max={e.limits.staffUsers} />
            <Usage label="Lectura inteligente por mes" used={0} max={e.limits.smartDocsPerMonth} />
          </div>
        </Panel>
        <Panel title="Módulos" bodyClassName="p-0">
          <ul className="divide-y divide-line">
            {FARO_MODULES.filter((m) => m.minPlan[e.tenant.kind]).map((m) => {
              const on = e.modules.has(m.key);
              const o = overrideOf.get(m.key);
              const from = plans.find((p) => p.modules.includes(m.key));
              return (
                <li key={m.key} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-medium text-ink">
                      {on ? <Check className="size-4 text-[#1f5f36]" aria-hidden /> : <Minus className="size-4 text-muted" aria-hidden />}
                      {m.name}
                      {m.status === "proximamente" && <StatusBadge status="pendiente" label="Próximamente" />}
                      {o && <Tag>{o.enabled ? "Habilitado por Faro" : "Deshabilitado por Faro"}{o.expiresAt ? ` hasta ${day.format(o.expiresAt)}` : ""}</Tag>}
                    </p>
                    <p className="mt-0.5 text-[13px] text-muted">{m.description}</p>
                  </div>
                  {!on && from && <span className="text-[13px] text-muted">Desde el plan {from.name}</span>}
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
