import type { Metadata } from "next";
import { Notice } from "@/components/admin/AdminField";
import { ModuleIcon } from "@/components/admin/kit/ModuleIcon";
import { PageHeader } from "@/components/admin/kit/PageHeader";
import { requireFaro } from "@/lib/auth";
import { getModuleStatuses, getPlans } from "@/lib/faro/entitlements";
import { cn } from "@/lib/utils";
import { FARO_MODULES } from "@/modules/registry";
import { setModuleReleaseAction } from "../catalog-actions";

export const metadata: Metadata = { title: "Módulos" };

const STATES = [
  ["proximamente", "Próximamente"],
  ["beta", "Beta"],
  ["disponible", "Disponible"],
] as const;

/** Registro de módulos con su liberación global (de "próximamente" a "disponible") */
export default async function ModulosPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const me = await requireFaro();
  const owner = me.faroRole === "faro_owner";
  const [statuses, plans] = await Promise.all([getModuleStatuses(), getPlans()]);
  return (
    <>
      {sp.ok && <Notice>{sp.ok}</Notice>}
      {sp.error && <Notice tone="error">{sp.error}</Notice>}
      <PageHeader title="Módulos" description="El registro de src/modules/registry.ts. Liberar un módulo lo habilita para todos los tenants cuyo plan lo incluye." />
      <ul className="grid gap-3">
        {FARO_MODULES.map((m) => {
          const st = statuses[m.key];
          const inPlans = plans.filter((p) => p.modules.includes(m.key)).map((p) => p.name);
          return (
            <li key={m.key} className="flex flex-wrap items-center gap-4 rounded-lg border border-line bg-surface p-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-md bg-navy text-gold">
                <ModuleIcon name={m.icon} className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-ink">
                  {m.name} <code className="ml-1 text-[12px] font-normal text-muted">{m.key}</code>
                </p>
                <p className="text-[13px] text-muted">
                  {m.core ? "Núcleo: en todos los planes" : inPlans.length ? `En: ${inPlans.join(", ")}` : "En ningún plan todavía"} · {m.tools.length} herramientas · {m.events.length} eventos
                </p>
              </div>
              <div className="flex gap-1" role="group" aria-label={`Estado de ${m.name}`}>
                {STATES.map(([v, label]) => (
                  <form key={v} action={setModuleReleaseAction}>
                    <input type="hidden" name="module" value={m.key} />
                    <input type="hidden" name="status" value={v} />
                    <button disabled={!owner || st === v} className={cn("h-8 rounded-md border px-3 text-[12px]", st === v ? "border-navy bg-navy text-paper" : "border-line hover:border-muted")}>
                      {label}
                    </button>
                  </form>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
