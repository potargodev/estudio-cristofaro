import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { Plan } from "@/lib/types";
import { cn } from "@/lib/utils";

export function PlanCard({ plan }: { plan: Plan }) {
  return (
    <article
      className={cn(
        "card-hover flex flex-col rounded-md border bg-surface p-6",
        plan.highlighted ? "border-navy ring-1 ring-navy" : "border-line hover:border-navy/40",
      )}
    >
      {plan.highlighted && <p className="mb-3 text-sm font-medium text-rose-deep">El más elegido</p>}
      <h3 className="text-xl font-semibold">{plan.name}</h3>
      <p className="mt-3 text-2xl font-semibold tracking-tight">{plan.price_label || "Precio a medida"}</p>
      {plan.description && <p className="mt-3 text-[15px] leading-relaxed text-muted">{plan.description}</p>}
      <ul className="mt-5 flex-1 space-y-2.5 text-[15px]">
        {plan.features.map((f) => (
          <li key={f} className="flex gap-2.5">
            <svg aria-hidden viewBox="0 0 16 16" className="mt-1 size-4 shrink-0 text-rose-deep">
              <path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <Button asChild size="lg" variant={plan.highlighted ? "default" : "outline"} className="mt-6 h-11 text-base">
        <Link href={`/diagnostico?plan=${encodeURIComponent(plan.name)}`}>Pedir propuesta</Link>
      </Button>
    </article>
  );
}
