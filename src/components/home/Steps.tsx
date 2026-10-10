import { CalendarCheck, FileSignature, Settings, Video } from "lucide-react";
import { SplitHeading } from "@/components/web/SplitHeading";
import { Container, SectionIndex } from "@/components/web/ui";

const STEPS = [
  { t: "Llamada de diagnóstico", d: "20 minutos por Meet para entender tu empresa y qué te frena hoy.", icon: Video },
  { t: "Propuesta cerrada", d: "Plan, módulos y abono por escrito. Sin letra chica.", icon: FileSignature },
  { t: "Implementación", d: "Ordenamos lo pendiente, conectamos tus datos e invitamos a tu equipo.", icon: Settings },
  { t: "Ciclo mensual", d: "Liquidamos, presentamos y te avisamos. Vos aprobás y pagás.", icon: CalendarCheck },
];

/**
 * Cómo empezamos: flujo de cuatro pasos unidos por una línea que se dibuja con
 * el scroll (animación de CSS atada a la vista; sin soporte, se ve dibujada).
 * Horizontal en escritorio y vertical en el celular.
 */
export function Steps() {
  return (
    <section aria-labelledby="pasos-titulo" className="border-t border-hair bg-navy-deep py-24 lg:py-36">
      <Container>
        <SectionIndex n="08">Proceso</SectionIndex>
        <SplitHeading id="pasos-titulo" className="display-md mt-8 max-w-[14ch] text-paper">
          Cómo empezamos.
        </SplitHeading>
        <div className="relative mt-16">
          {/* Línea de base y línea que se dibuja: vertical en el celular, horizontal en escritorio */}
          <span aria-hidden className="absolute bottom-6 left-7 top-7 w-px bg-hair-strong lg:bottom-auto lg:left-7 lg:right-[calc(25%-3.25rem)] lg:top-7 lg:h-px lg:w-auto" />
          <span
            aria-hidden
            className="steps-line absolute bottom-6 left-7 top-7 w-px origin-top bg-rose-light lg:bottom-auto lg:left-7 lg:right-[calc(25%-3.25rem)] lg:top-7 lg:h-px lg:w-auto lg:origin-left"
          />
          <ol className="relative grid gap-12 lg:grid-cols-4 lg:gap-8">
          {STEPS.map((s, i) => (
            <li key={s.t} className="relative grid grid-cols-[3.5rem_1fr] gap-x-5 lg:block">
              <span className="relative z-10 grid size-14 place-items-center border border-hair-strong bg-navy-deep text-rose-light">
                <s.icon className="size-6" strokeWidth={1.3} aria-hidden />
              </span>
              <div className="lg:mt-8">
                <p className="tabular font-display text-[clamp(2.4rem,3.6vw,3.4rem)] leading-none text-gold">
                  <span className="sr-only">Paso </span>0{i + 1}
                </p>
                <h3 className="mt-4 text-[18px] font-medium text-paper">{s.t}</h3>
                <p className="mt-2 max-w-[30ch] text-[15px] leading-relaxed text-paper/65">{s.d}</p>
              </div>
            </li>
          ))}
          </ol>
        </div>
      </Container>
    </section>
  );
}
