import Link from "next/link";
import type { Plan } from "@/lib/types";

export function PlanCard({ plan }: { plan: Plan }) {
  return (
    <article
      className={`flex flex-col rounded-md border p-6 ${
        plan.highlighted ? "border-green bg-surface ring-1 ring-green" : "border-line bg-surface"
      }`}
    >
      {plan.highlighted && <p className="mb-3 text-sm font-medium text-green">El más elegido</p>}
      <h3 className="text-xl font-semibold">{plan.name}</h3>
      <p className="mt-3 text-2xl font-semibold tracking-tight">{plan.price_label || "Precio a medida"}</p>
      {plan.description && <p className="mt-3 text-[15px] leading-relaxed text-muted">{plan.description}</p>}
      <ul className="mt-5 flex-1 space-y-2.5 text-[15px]">
        {plan.features.map((f) => (
          <li key={f} className="flex gap-2.5">
            <svg aria-hidden viewBox="0 0 16 16" className="mt-1 size-4 shrink-0 text-green">
              <path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <Link
        href={`/diagnostico?plan=${encodeURIComponent(plan.name)}`}
        className={`mt-6 rounded-md px-4 py-2.5 text-center font-medium ${
          plan.highlighted ? "bg-green text-paper hover:bg-green-deep" : "border border-green/40 text-green hover:bg-green-soft"
        }`}
      >
        Pedir propuesta
      </Link>
    </article>
  );
}
