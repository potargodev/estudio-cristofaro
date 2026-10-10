import Link from "next/link";
import { SplitHeading } from "@/components/web/SplitHeading";
import { Container, SectionIndex } from "@/components/web/ui";
import { AUDIENCES } from "@/lib/audiences";

export function ForWhom() {
  return (
    <section id="para-quien" aria-labelledby="para-quien-titulo" className="scroll-mt-20 border-t border-hair bg-night py-16 lg:py-36">
      <Container>
        <div className="grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <SectionIndex n="01">Para quién</SectionIndex>
            <SplitHeading id="para-quien-titulo" className="display-md mt-8 text-paper">
              Para empresas de servicios que ya no entran en una planilla.
            </SplitHeading>
            <p className="mt-8 max-w-sm text-[15px] leading-relaxed text-paper/65">
              Entre 5 y 30 personas, con dueños que todavía administran y sin un área contable propia.
            </p>
          </div>
          <ol className="border-t border-hair lg:col-span-7 lg:col-start-6">
            {AUDIENCES.map((a, i) => (
              <li key={a.slug} className="border-b border-hair">
                <Link href={`/${a.slug}`} className="group grid grid-cols-[3rem_1fr] gap-x-4 py-8 lg:grid-cols-[4rem_1fr_14rem] lg:items-baseline">
                  <span className="tabular text-[13px] text-rose-light">0{i + 1}</span>
                  <span className="font-display text-[clamp(1.8rem,3vw,2.75rem)] leading-[1.02] text-paper transition-colors duration-500 group-hover:text-rose-light">
                    {a.name}
                  </span>
                  <span className="col-start-2 mt-3 text-[14px] leading-relaxed text-paper/60 lg:col-start-3 lg:mt-0">{a.summary}</span>
                </Link>
              </li>
            ))}
          </ol>
        </div>
      </Container>
    </section>
  );
}
