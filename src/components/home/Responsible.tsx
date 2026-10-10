import Image from "next/image";
import { Counter } from "@/components/web/Counter";
import { SplitHeading } from "@/components/web/SplitHeading";
import { Container } from "@/components/web/ui";
import { STUDIO_FACTS } from "@/lib/home";

/**
 * Atención personalizada: sección oscura (las de papel de la home son "Del caos
 * al orden" y Servicios), con la foto del contador trabajando con un cliente.
 */
export function Responsible() {
  return (
    <section aria-labelledby="responsable-titulo" className="overflow-hidden border-t border-hair bg-night py-24 text-paper lg:py-36">
      <Container>
        <div className="grid gap-12 lg:grid-cols-12">
          <figure className="relative lg:col-span-6">
            <div className="relative aspect-[4/3] overflow-hidden bg-navy">
              <Image
                src="/hero/atencion.webp"
                alt="Un contador del estudio revisa informes en su escritorio, con el sello de Estudio Cristofaro en la pared"
                fill
                sizes="(min-width:1024px) 46vw, 100vw"
                className="object-cover object-[58%_50%]"
              />
            </div>
          </figure>
          <div className="flex flex-col justify-center lg:col-span-6 lg:pl-6">
            <p className="flex items-center gap-3 text-[13px] text-paper/60">
              <span className="tabular text-rose-light">09</span>
              <span aria-hidden className="h-px w-8 bg-hair-strong" />
              <span>Atención personalizada</span>
            </p>
            <SplitHeading id="responsable-titulo" className="display-md mt-8">
              Tu empresa, en manos de alguien que la conoce.
            </SplitHeading>
            <p className="mt-8 max-w-lg text-[17px] leading-relaxed text-paper/65">
              Desde el primer día tenés un contador asignado. Sabe cómo trabaja tu empresa, te contesta por el canal que uses y se sienta con
              vos cuando hay que tomar una decisión. Sin call center y sin explicar todo de nuevo cada vez.
            </p>
            <dl className="mt-12 grid grid-cols-3 border-t border-hair">
              <div className="flex flex-col-reverse gap-3 border-r border-hair py-6 pr-4">
                <dt className="text-[13px] text-paper/55">años de trayectoria</dt>
                <dd className="tabular whitespace-nowrap font-display text-[clamp(2.1rem,5vw,4.5rem)] leading-none">
                  <Counter value={STUDIO_FACTS.years} />
                </dd>
              </div>
              <div className="flex flex-col-reverse gap-3 border-r border-hair px-4 py-6">
                <dt className="text-[13px] text-paper/55">empresas acompañadas</dt>
                <dd className="tabular whitespace-nowrap font-display text-[clamp(2.1rem,5vw,4.5rem)] leading-none">
                  <Counter value={STUDIO_FACTS.companies} />
                </dd>
              </div>
              <div className="flex flex-col-reverse gap-3 py-6 pl-4">
                <dt className="text-[13px] text-paper/55">primera respuesta</dt>
                <dd className="tabular whitespace-nowrap font-display text-[clamp(2.1rem,5vw,4.5rem)] leading-none">
                  &lt;<Counter value={24} /> h
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </Container>
    </section>
  );
}
