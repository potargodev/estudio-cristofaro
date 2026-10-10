import { ArrowRight, Check, CircleHelp } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { cn } from "@/lib/utils";
import { getGuide } from "@/modules/onboarding/server";

/**
 * Primeros pasos, dentro del marco de la app: stepper vertical con barra de
 * progreso. Cada paso se marca solo cuando la persona hace la acción de verdad.
 */
export default async function FirstStepsPage() {
  const g = await getGuide();
  if (!g) redirect("/ingresar");
  const total = g.steps.length;
  const done = g.steps.filter((s) => s.done).length;
  const current = g.steps.findIndex((s) => !s.done);
  return (
    <div className="grid gap-6 pb-10">
      <header>
        <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-rose-deep">{g.profileLabel}</p>
        <h1 className="mt-1 font-display text-[clamp(2rem,6vw,2.6rem)] leading-tight">Primeros pasos</h1>
        <p className="mt-1 text-[15px] text-muted">Se marcan solos cuando hacés cada cosa: no hay que tildar nada.</p>
      </header>

      <section aria-label="Progreso" className="rounded-md border border-line bg-surface p-4">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[15px] font-medium">
            {done} de {total} listos
          </p>
          <p className="text-[13px] text-muted">{done === total ? "¡Terminaste!" : `Te ${total - done === 1 ? "falta 1 paso" : `faltan ${total - done} pasos`}`}</p>
        </div>
        <div role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label={`${done} de ${total} pasos listos`} className="mt-3 h-2 overflow-hidden rounded-full bg-navy-soft">
          <div className="h-full rounded-full bg-navy motion-safe:transition-[width] motion-safe:duration-500" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
        </div>
      </section>

      <ol className="relative grid gap-0">
        {g.steps.map((s, i) => {
          const status = s.done ? "listo" : i === current ? "actual" : "pendiente";
          return (
            <li key={s.key} className="relative grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-3 pb-6 last:pb-0">
              {i < total - 1 && <span aria-hidden className={cn("absolute left-[1.2rem] top-10 h-[calc(100%-2.5rem)] w-px", s.done ? "bg-navy" : "bg-line")} />}
              <span
                aria-hidden
                className={cn(
                  "grid size-10 place-items-center rounded-full border text-[15px] font-semibold tabular-nums",
                  status === "listo" && "border-navy bg-navy text-gold",
                  status === "actual" && "border-navy bg-surface text-ink ring-4 ring-navy-soft",
                  status === "pendiente" && "border-line bg-surface text-muted",
                )}
              >
                {s.done ? <Check className="size-5" /> : i + 1}
              </span>
              <div className={cn("min-w-0 rounded-md border p-4", status === "actual" ? "border-navy/40 bg-surface" : "border-line bg-surface")}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h2 className={cn("text-[16px] font-semibold", s.done && "text-muted")}>{s.title}</h2>
                  <span className={cn("rounded px-2 py-0.5 text-[12px]", status === "listo" ? "bg-navy-soft text-ink" : status === "actual" ? "bg-gold/20 text-ink" : "text-muted")}>
                    {status === "listo" ? "Listo" : status === "actual" ? "Ahora" : "Pendiente"}
                  </span>
                </div>
                <p className="mt-1 text-[14px] text-muted">{s.text}</p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  {!s.done && (
                    <Link href={s.href} className={cn("inline-flex h-10 items-center gap-1.5 rounded-md px-4 text-[14px] font-medium", status === "actual" ? "bg-navy text-paper hover:bg-night" : "border border-line hover:border-muted")}>
                      Hacer este paso <ArrowRight className="size-4" aria-hidden />
                    </Link>
                  )}
                  {s.help && (
                    <Link href={`/ayuda/${s.help}`} className="inline-flex items-center gap-1.5 text-[13px] text-muted underline-offset-4 hover:text-ink hover:underline">
                      <CircleHelp className="size-3.5" aria-hidden /> Cómo se hace
                    </Link>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
