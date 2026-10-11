import { SplitHeading } from "@/components/web/SplitHeading";
import { Container, SectionIndex } from "@/components/web/ui";
import { FARO_MODULES } from "@/lib/faro/modules";
import { getPlan } from "@/lib/faro/plans";
import { Reveal } from "./Reveal";

const SHOWN = FARO_MODULES.filter((m) => !["tango_files", "personal_invoicing", "shared_expenses"].includes(m.key));
const STATUS = { disponible: "Disponible", beta: "En beta", proximamente: "Próximamente" } as const;

export function FaroModules() {
  return (
    <section id="modulos" aria-labelledby="modulos-titulo" className="scroll-mt-16 border-t border-hair bg-night py-16 lg:py-32">
      <Container>
        <div className="grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-6">
            <SectionIndex n="10">Módulos</SectionIndex>
            <SplitHeading id="modulos-titulo" className="display-md mt-8 text-paper">
              Un núcleo sólido y módulos que se prenden.
            </SplitHeading>
          </div>
          <p className="self-end text-body leading-relaxed text-paper/65 lg:col-span-4 lg:col-start-9">
            Estudios, organizaciones, usuarios, auditoría, portal, vencimientos, documentos, solicitudes, agenda, alertas, grupos de gastos, Vigía, Bitácora y Mensajes están en todos los planes. El resto se suma según el plan.
          </p>
        </div>
        <Reveal as="ul" className="mt-14 grid gap-px bg-hair sm:grid-cols-2 lg:grid-cols-4" stagger={0.04}>
          {SHOWN.map((m) => (
            <li key={m.key} data-reveal className="flex flex-col bg-night p-6">
              <p className="flex items-center justify-between gap-3 text-caption">
                <span className={m.status === "disponible" ? "text-gold" : "text-paper/50"}>{STATUS[m.status]}</span>
                <span className="text-paper/45">Desde {getPlan(m.minPlan.studio ?? m.minPlan.personal)?.name}</span>
              </p>
              <h3 className="mt-4 font-display text-headline leading-tight text-paper">{m.name}</h3>
              <p className="mt-3 text-ui leading-relaxed text-paper/60">{m.description}</p>
            </li>
          ))}
        </Reveal>
      </Container>
    </section>
  );
}
