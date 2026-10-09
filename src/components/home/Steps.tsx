import { SplitHeading } from "@/components/web/SplitHeading";
import { Container, SectionIndex } from "@/components/web/ui";

const STEPS = [
  { t: "Llamada de diagnóstico", d: "20 minutos por Meet para entender tu empresa y qué te frena hoy." },
  { t: "Propuesta cerrada", d: "Plan, módulos y abono por escrito. Sin letra chica." },
  { t: "Implementación", d: "Ordenamos lo pendiente, conectamos tus datos e invitamos a tu equipo." },
  { t: "Ciclo mensual", d: "Liquidamos, presentamos y te avisamos. Vos aprobás y pagás." },
];

/** Cómo empezamos: secuencia real, numerada, sobre una línea de tiempo */
export function Steps() {
  return (
    <section aria-labelledby="pasos-titulo" className="border-t border-hair bg-navy-deep py-24 lg:py-36">
      <Container>
        <SectionIndex n="08">Proceso</SectionIndex>
        <SplitHeading id="pasos-titulo" className="display-md mt-8 max-w-[14ch] text-paper">
          Cómo empezamos.
        </SplitHeading>
        <ol className="mt-16 grid border-t border-hair sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.t} className="relative border-b border-hair py-8 sm:pr-8 lg:border-b-0 lg:border-r lg:px-8 lg:first:pl-0 lg:last:border-r-0">
              <span aria-hidden className="absolute -top-px left-0 h-px w-10 bg-rose-light lg:left-8 lg:first:left-0" />
              <p className="tabular font-display text-[clamp(3rem,5vw,4.5rem)] leading-none text-paper/20">
                <span className="sr-only">Paso </span>0{i + 1}
              </p>
              <h3 className="mt-8 text-[18px] font-medium text-paper">{s.t}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-paper/60">{s.d}</p>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}
