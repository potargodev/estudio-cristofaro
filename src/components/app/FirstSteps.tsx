import { ListChecks } from "lucide-react";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getPrefs } from "@/lib/prefs";
import { cn } from "@/lib/utils";
import { getGuide } from "@/modules/onboarding/server";
import { HideFirstSteps } from "./HideFirstSteps";

/**
 * Widget compacto del Inicio: «Te faltan 3 pasos». Desaparece cuando están
 * todos hechos, si la guía está apagada o si la persona lo cerró.
 */
export async function FirstSteps({ className, path }: { className?: string; path?: string }) {
  const g = await getGuide(undefined, path);
  if (!g || g.disabled) return null;
  // El del Inicio se puede cerrar (el de una Flota, no: es de ese espacio)
  const me = path ? null : await getCurrentUser();
  if (me && (await getPrefs(me.id)).hideFirstSteps) return null;
  const done = g.steps.filter((s) => s.done).length;
  const left = g.steps.length - done;
  if (left === 0) return null;
  const next = g.steps.find((s) => !s.done)!;
  return (
    <section aria-label="Primeros pasos" className={cn("flex flex-wrap items-center gap-3 rounded-md border border-line bg-surface px-4 py-3", className)}>
      <ListChecks className="size-5 shrink-0 text-rose-deep mt-0.5" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-ui font-medium">Te {left === 1 ? "falta 1 paso" : `faltan ${left} pasos`}</p>
        <div className="mt-1.5 flex items-center gap-2">
          <span className="h-1.5 w-24 overflow-hidden rounded-full bg-navy-soft" aria-hidden>
            <span className="block h-full rounded-full bg-navy" style={{ width: `${(done / g.steps.length) * 100}%` }} />
          </span>
          <span className="truncate text-caption text-muted">Ahora: {next.title}</span>
        </div>
      </div>
      <Link href={path ? next.href : "/primeros-pasos"} className="inline-flex h-9 items-center rounded-md bg-navy px-3.5 text-meta font-medium text-paper hover:bg-night">
        {path ? "Hacer este paso" : "Ver los pasos"}
      </Link>
      {!path && <HideFirstSteps />}
    </section>
  );
}
