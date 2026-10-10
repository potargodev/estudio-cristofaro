import { Lock, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ModuleIcon } from "@/components/admin/kit/ModuleIcon";
import { PageHeader } from "@/components/admin/kit/PageHeader";
import { requireTenant } from "@/lib/auth";
import { getEntitlements, getModuleStatuses, getPlans } from "@/lib/faro/entitlements";
import { cn } from "@/lib/utils";
import { FARO_MODULES } from "@/modules/registry";

export const metadata: Metadata = { title: "Módulos" };

/** Catálogo de módulos del tenant: activos, disponibles en otro plan y próximamente */
export default async function ModulosPage() {
  const me = await requireTenant();
  const [e, statuses, plans] = await Promise.all([getEntitlements(me.studioId), getModuleStatuses(), getPlans()]);
  const kind = e!.tenant.kind;
  const list = FARO_MODULES.filter((m) => m.minPlan[kind] || m.core);
  const state = (key: string) => (statuses[key] === "proximamente" ? "proximamente" : e!.modules.has(key as never) ? "activo" : "plan");
  const order = { activo: 0, plan: 1, proximamente: 2 } as const;
  return (
    <div className="max-w-6xl">
      <PageHeader title="Módulos" description={`Lo que tiene tu plan ${e!.plan.name}, lo que suma un plan superior y lo que viene.`} />
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {list
          .sort((a, b) => order[state(a.key)] - order[state(b.key)])
          .map((m) => {
            const st = state(m.key);
            const plan = plans.find((p) => p.kind === kind && p.modules.includes(m.key));
            const href = st === "activo" && m.nav[0] ? m.nav[0].href : `/admin/modulos/${m.key}`;
            return (
              <li key={m.key}>
                <Link href={href} className={cn("group flex h-full flex-col rounded-lg border bg-surface p-5 transition-colors hover:border-muted", st === "activo" ? "border-line" : "border-dashed border-line")}>
                  <div className="flex items-start justify-between gap-3">
                    <span className={cn("grid size-10 place-items-center rounded-md", st === "activo" ? "bg-navy text-gold" : "bg-navy-soft text-muted")}>
                      <ModuleIcon name={m.icon} className="size-5" />
                    </span>
                    {st === "activo" ? (
                      <span className="rounded-md bg-[#e3efe6] px-2 py-0.5 text-[12px] font-medium text-[#24583a]">{m.core ? "Núcleo" : "Activo"}</span>
                    ) : st === "plan" ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-rose-soft px-2 py-0.5 text-[12px] font-medium text-rose-deep">
                        <Lock className="size-3" aria-hidden /> Plan {plan?.name ?? "superior"}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-md bg-navy-soft px-2 py-0.5 text-[12px] font-medium text-muted">
                        <Sparkles className="size-3" aria-hidden /> Próximamente
                      </span>
                    )}
                  </div>
                  <p className="mt-4 text-[17px] font-semibold text-ink">{m.name}</p>
                  <p className="mt-1 flex-1 text-[14px] text-muted">{m.description}</p>
                </Link>
              </li>
            );
          })}
      </ul>
    </div>
  );
}
