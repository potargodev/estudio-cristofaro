import { stats } from "@/lib/content";
import { NumberTicker } from "./NumberTicker";

// Franja de números del estudio. Los valores se cargan en src/lib/content.ts (TODO).
export function StatsBand() {
  return (
    <section aria-label="El estudio en números" className="grain bg-navy-deep text-paper">
      <dl className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:grid-cols-3 sm:px-6">
        {stats.map((s) => (
          <div key={s.label} className="flex flex-col-reverse gap-1 sm:border-l sm:border-rose-light/30 sm:pl-6 sm:first:border-l-0 sm:first:pl-0">
            <dt className="text-[15px] text-paper/75">{s.label}</dt>
            <dd className="font-display text-6xl leading-none text-rose-light sm:text-7xl">
              <NumberTicker value={s.value} prefix={s.prefix} suffix={s.suffix} />
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
