import { Check, Compass } from "lucide-react";
import Link from "next/link";
import { getGuide } from "@/modules/onboarding/server";
import { cn } from "@/lib/utils";

/** Tarjeta "Primeros pasos" del inicio: desaparece cuando están todos hechos o si la guía está apagada */
export async function FirstSteps({ className, path }: { className?: string; path?: string }) {
  const g = await getGuide(undefined, path);
  if (!g || g.disabled) return null;
  const done = g.steps.filter((s) => s.done).length;
  if (done === g.steps.length) return null;
  const next = g.steps.find((s) => !s.done);
  return (
    <section aria-labelledby="primeros-pasos" className={cn("rounded-lg border border-line bg-surface p-5", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="primeros-pasos" className="flex items-center gap-2 text-[17px] font-semibold text-ink">
            <span className="grid size-8 place-items-center rounded-md bg-navy text-gold">
              <Compass className="size-4" aria-hidden />
            </span>
            Primeros pasos
          </h2>
          <p className="mt-1 text-[14px] text-muted">
            {done} de {g.steps.length} hechos · se marcan solos cuando los hacés.
          </p>
        </div>
        {next && (
          <Link href={next.href} className="inline-flex h-9 items-center rounded-md bg-navy px-4 text-[14px] font-medium text-paper hover:bg-night">
            Seguir: {next.title.toLowerCase()}
          </Link>
        )}
      </div>
      <ol className="mt-4 grid gap-2 sm:grid-cols-2">
        {g.steps.map((s) => (
          <li key={s.key}>
            <Link href={s.href} className="flex items-start gap-2.5 rounded-md px-1 py-1 text-[14px] hover:bg-canvas">
              <span className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border", s.done ? "border-navy bg-navy text-gold" : "border-line")}>{s.done && <Check className="size-3" aria-hidden />}</span>
              <span className={cn(s.done ? "text-muted line-through decoration-1" : "text-ink")}>{s.title}</span>
              <span className="sr-only">{s.done ? "(hecho)" : "(pendiente)"}</span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
