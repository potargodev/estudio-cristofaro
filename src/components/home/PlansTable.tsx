"use client";

import { useEffect, useRef, useState } from "react";
import { SplitHeading } from "@/components/web/SplitHeading";
import { Container, CtaLink, SectionIndex, TextLink } from "@/components/web/ui";
import { HOME_PLANS, MODULES, PLAN_ROWS, priceLabel } from "@/lib/plans-web";
import { loadGsap, reducedMotion } from "@/lib/motion/gsap";
import { SCHEDULE_HREF } from "@/lib/site";
import { cn } from "@/lib/utils";

/**
 * Planes como tabla editorial con hairlines: al pasar el mouse se ilumina la
 * columna; "Empresa en Control" lleva borde rosé de 1px. Las filas aparecen
 * en secuencia. En el celular, cada plan es un bloque con sus puntos.
 * `full`: la comparación completa de /planes (sin el encabezado de la home).
 */
export function PlansTable({
  rows = PLAN_ROWS,
  full = false,
  prices = {},
}: {
  rows?: [string, string, string, string][];
  full?: boolean;
  prices?: Record<string, string | null>;
}) {
  const ROWS = rows;
  const root = useRef<HTMLElement>(null);
  const [col, setCol] = useState<number | null>(null);
  useEffect(() => {
    if (reducedMotion()) return;
    let ctx: { revert: () => void } | undefined;
    loadGsap().then(({ gsap }) => {
      if (!root.current) return;
      ctx = gsap.context(() => {
        gsap.from("[data-row]", { opacity: 0, y: 14, duration: 0.8, stagger: 0.06, scrollTrigger: { trigger: "[data-table]", start: "top 80%", once: true } });
      }, root);
    });
    return () => ctx?.revert();
  }, []);

  const cell = (c: number) => cn("px-5 py-4 align-top transition-colors duration-300", col === c && "bg-paper/[0.035]", c === 2 && "border-x border-rose-light");

  return (
    <section ref={root} id="planes" aria-labelledby={full ? undefined : "planes-titulo"} aria-label={full ? "Comparación de planes" : undefined} className={cn("scroll-mt-16 bg-night", full ? "py-16 lg:py-24" : "border-t border-hair py-24 lg:py-36")}>
      <Container>
        {!full && <div className="grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <SectionIndex n="07">Planes</SectionIndex>
            <SplitHeading id="planes-titulo" className="display-md mt-8 text-paper">
              Un plan según el momento de tu empresa.
            </SplitHeading>
          </div>
          <p className="self-end text-[15px] leading-relaxed text-paper/60 lg:col-span-4 lg:col-start-9">
            Todos incluyen la plataforma, las alertas y un responsable asignado. El precio final depende de razones sociales, empleados y volumen. La
            implementación inicial se cotiza aparte.
          </p>
        </div>}

        {/* Escritorio: tabla */}
        <div data-table className={cn("hidden lg:block", !full && "mt-16")} onMouseLeave={() => setCol(null)}>
          <table className="w-full table-fixed border-collapse text-left text-[14px] text-paper/80">
            <caption className="sr-only">Comparación de planes</caption>
            <colgroup>
              <col className="w-[28%]" />
              <col />
              <col />
              <col />
            </colgroup>
            <thead>
              <tr data-row className="align-bottom">
                <td className="pb-6" />
                {HOME_PLANS.map((p, i) => (
                  <th key={p.key} scope="col" onMouseEnter={() => setCol(i + 1)} className={cn(cell(i + 1), "pb-6 pt-6 font-normal", i === 1 && "border-t")}>
                    {"featured" in p && <span className="mb-3 block text-[12px] text-rose-light">El más elegido</span>}
                    <span className="block font-display text-[2rem] leading-none text-paper">{p.name}</span>
                    <span className="tabular mt-3 block text-[14px] text-paper/55">{priceLabel(p.key, prices)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map(([label, ...vals]) => (
                <tr data-row key={label} className="border-t border-hair">
                  <th scope="row" className="py-4 pr-6 align-top text-[13px] font-normal text-paper/50">
                    {label}
                  </th>
                  {vals.map((v, i) => (
                    <td key={i} onMouseEnter={() => setCol(i + 1)} className={cn(cell(i + 1), v === "—" && "text-paper/30")}>
                      {v === "—" ? <span aria-label="No incluido">—</span> : v}
                    </td>
                  ))}
                </tr>
              ))}
              <tr data-row className="border-t border-hair">
                <td />
                {HOME_PLANS.map((p, i) => (
                  <td key={p.key} onMouseEnter={() => setCol(i + 1)} className={cn(cell(i + 1), "pb-6 pt-6", i === 1 && "border-b")}>
                    {i === 1 ? (
                      <CtaLink href={SCHEDULE_HREF} magnetic={false}>
                        Hablar de este plan
                      </CtaLink>
                    ) : (
                      <TextLink href={SCHEDULE_HREF} className="text-paper">
                        Hablar de este plan
                      </TextLink>
                    )}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        {/* Celular y tablet: bloques */}
        <ul className={cn("grid gap-px border border-hair bg-hair lg:hidden", !full && "mt-14")}>
          {HOME_PLANS.map((p) => (
            <li key={p.key} className={cn("bg-night p-6", "featured" in p && "outline outline-1 -outline-offset-1 outline-rose-light")}>
              {"featured" in p && <p className="mb-2 text-[12px] text-rose-light">El más elegido</p>}
              <h3 className="font-display text-[2rem] leading-none text-paper">{p.name}</h3>
              <p className="tabular mt-2 text-[14px] text-paper/55">{priceLabel(p.key, prices)}</p>
              <ul className="mt-5 border-t border-hair text-[14px] text-paper/80">
                {(full
                  ? ROWS.flatMap(([label, ...vals]) => {
                      const v = vals[HOME_PLANS.indexOf(p)];
                      return v === "—" ? [] : [v === "Incluido" ? label : `${label}: ${v}`];
                    })
                  : p.bullets
                ).map((b) => (
                  <li key={b} className="border-b border-hair py-2.5">
                    {b}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>

        <div className="mt-16 grid gap-6 border-t border-hair pt-8 lg:grid-cols-12">
          <p className="text-[13px] text-paper/50 lg:col-span-3">Módulos para sumar</p>
          <ul className="flex flex-wrap gap-x-8 gap-y-3 text-[15px] text-paper/80 lg:col-span-9">
            {MODULES.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
        {!full && (
          <p className="mt-10">
            <TextLink href="/planes" className="text-[15px] text-rose-light">
              Ver la comparación completa
            </TextLink>
          </p>
        )}
      </Container>
    </section>
  );
}
