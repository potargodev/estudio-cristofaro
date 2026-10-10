"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import { SplitHeading } from "@/components/web/SplitHeading";
import { Container, SectionIndex } from "@/components/web/ui";
import { cn } from "@/lib/utils";

export interface IndustryPreview {
  key: string;
  name: string;
  description: string;
  obligations: string[];
  documents: string[];
  tasks: string[];
}

/** Selector de rubros: lo que Faro precarga al elegir el rubro de una organización */
export function FaroIndustries({ items }: { items: IndustryPreview[] }) {
  const [key, setKey] = useState(items[0]?.key);
  const it = items.find((x) => x.key === key) ?? items[0];
  if (!it) return null;
  const cols = [
    { title: "Obligaciones típicas", list: it.obligations },
    { title: "Documentos que se piden", list: it.documents },
    { title: "Tareas del mes", list: it.tasks },
  ];
  return (
    <section id="rubros" aria-labelledby="rubros-titulo" className="scroll-mt-16 border-t border-hair bg-night py-16 lg:py-32">
      <Container>
        <div className="grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-6">
            <SectionIndex n="06">Ecosistemas por industria</SectionIndex>
            <SplitHeading id="rubros-titulo" className="display-md mt-8 text-paper">
              Elegí el rubro y arranca configurado.
            </SplitHeading>
          </div>
          <p className="self-end text-[15px] leading-relaxed text-paper/65 lg:col-span-4 lg:col-start-9">
            {items.length} plantillas con obligaciones, documentos y tareas típicas. Son sugerencias: el estudio las revisa y las marca como validadas.
          </p>
        </div>
        <div role="tablist" aria-label="Rubros" className="mt-12 flex flex-wrap gap-2">
          {items.map((x) => (
            <button
              key={x.key}
              role="tab"
              type="button"
              aria-selected={x.key === it.key}
              onClick={() => setKey(x.key)}
              className={cn("rounded-[2px] border px-3 py-1.5 text-[13px] transition-colors duration-300", x.key === it.key ? "border-gold bg-gold/10 text-paper" : "border-hair-strong text-paper/60 hover:text-paper")}
            >
              {x.name}
            </button>
          ))}
        </div>
        <div role="tabpanel" key={it.key} className="mt-8 rounded-lg border border-hair-strong bg-navy-deep p-5 sm:p-7">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-display text-[28px] text-paper">{it.name}</h3>
            <span className="rounded border border-hair px-2 py-0.5 text-[11px] text-paper/55">Plantilla en revisión por el estudio</span>
          </div>
          <p className="mt-1 max-w-2xl text-[14px] text-paper/60">{it.description}</p>
          <div className="mt-6 grid gap-6 md:grid-cols-3">
            {cols.map((c, ci) => (
              <div key={c.title}>
                <p className="text-[11px] uppercase tracking-[0.12em] text-paper/45">{c.title}</p>
                <ul className="mt-3 grid gap-2">
                  {c.list.slice(0, 5).map((x, i) => (
                    <li key={x} className="faro-demo-in flex items-start gap-2 text-[13px] text-paper/85" style={{ "--d": ci * 120 + i * 60 } as React.CSSProperties}>
                      <Check className="mt-0.5 size-3.5 shrink-0 text-gold" aria-hidden /> {x}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}
