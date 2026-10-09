import Image from "next/image";
import { Counter } from "@/components/web/Counter";
import { SplitHeading } from "@/components/web/SplitHeading";
import { Container } from "@/components/web/ui";
import { STUDIO_FACTS } from "@/lib/home";

/**
 * Responsable: sección oscura (las de papel de la home son "Del caos al orden" y Servicios). La foto es un
 * placeholder hasta tener el retrato real del equipo (/public/equipo).
 */
export function Responsible() {
  return (
    <section aria-labelledby="responsable-titulo" className="overflow-hidden border-t border-hair bg-night py-24 text-paper lg:py-36">
      <Container>
        <div className="grid gap-12 lg:grid-cols-12">
          <figure className="relative lg:col-span-5">
            <div className="duotone relative aspect-[4/5] w-[86%] overflow-hidden bg-navy lg:w-full">
              <Image src="/hero/hero-3.jpg" alt="" fill sizes="(min-width:1024px) 34vw, 86vw" className="object-cover object-[62%_50%]" />
            </div>
            <span aria-hidden className="absolute -bottom-6 right-0 h-px w-1/2 bg-rose-light lg:-right-10" />
          </figure>
          <div className="flex flex-col justify-center lg:col-span-6 lg:col-start-7">
            <p className="flex items-center gap-3 text-[13px] text-paper/60">
              <span className="tabular text-rose-light">09</span>
              <span aria-hidden className="h-px w-8 bg-hair-strong" />
              <span>Tu responsable</span>
            </p>
            <SplitHeading id="responsable-titulo" className="display-md mt-8">
              Una persona con nombre y apellido, no un ticket.
            </SplitHeading>
            <p className="mt-8 max-w-lg text-[17px] leading-relaxed text-paper/65">
              Cada empresa tiene un contador asignado que conoce su historia, responde en el día y se sienta con la dirección cuando hay que decidir.
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
