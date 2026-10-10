import { Counter } from "@/components/web/Counter";
import { MaskText } from "@/components/web/MaskText";
import { Container, CtaLink, TextLink } from "@/components/web/ui";

const TODAY = [
  { label: "Vencimientos esta semana", value: 18, tone: "text-gold" },
  { label: "Documentos nuevos de clientes", value: 42, tone: "text-paper" },
  { label: "Solicitudes por responder", value: 7, tone: "text-rose-light" },
  { label: "Propuestas de la IA para aprobar", value: 3, tone: "text-paper" },
];

/** Torre del faro en línea fina, con el foco encendido */
function Lighthouse() {
  return (
    <svg viewBox="0 0 120 220" className="h-full w-auto" aria-hidden>
      <g fill="none" stroke="currentColor" strokeWidth="1" className="text-gold/70">
        <path d="M44 210 L52 70 L68 70 L76 210 Z" />
        <path d="M47 160 L73 160 M49 120 L71 120 M51 90 L69 90" />
        <path d="M48 70 L72 70 L72 58 L48 58 Z" />
        <path d="M52 58 L60 44 L68 58" />
        <path d="M30 210 L90 210" />
      </g>
      <circle cx="60" cy="64" r="3" className="fill-gold" />
    </svg>
  );
}

export function FaroHero() {
  return (
    <section aria-label="Presentación" className="relative isolate overflow-hidden bg-night pb-16 pt-32 lg:min-h-[100svh] lg:pb-20 lg:pt-40">
      <Container>
        <div className="grid gap-12 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-7">
            <p className="flex items-center gap-3 text-[13px] text-paper/65">
              <span className="tabular text-gold">Faro</span>
              <span aria-hidden className="h-px w-8 bg-hair-strong" />
              Para personas, autónomos y estudios contables
            </p>
            <MaskText as="h1" className="display-hero mt-8 text-paper">
              Tu gestión y tus finanzas, a la vista.
            </MaskText>
            <p className="mt-8 max-w-xl text-[17px] leading-relaxed text-paper/75">
              Faro es una herramienta, no un estudio contable. Empezá gratis con Bitácora para tus finanzas personales; si sos autónomo, facturá y sabé cuánto pagar; si sos contador, gestioná tu cartera y conectá a tus clientes. Creada por contadores.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-6">
              <CtaLink tone="gold" href="/faro/registro">Crear mi cuenta gratis</CtaLink>
              <TextLink href="/faro/registro?tipo=studio" className="text-[15px] text-paper">
                Soy estudio contable
              </TextLink>
            </div>
          </div>
          <div className="relative mt-24 lg:col-span-5 lg:mt-0">
            {/* El haz sale del foco de la torre (en el celular, desde arriba a la derecha) */}
            <div className="absolute -top-24 right-6 h-36 w-[78px] lg:-top-28 lg:h-44 lg:w-[96px]">
              <div aria-hidden className="absolute left-1/2 top-[29%] -z-10 size-[180vmax] -translate-x-1/2 -translate-y-1/2">
                <div className="faro-beam" />
              </div>
              <div aria-hidden className="faro-glow absolute left-1/2 top-[29%] -z-10 size-[46vmin] -translate-x-1/2 -translate-y-1/2 rounded-full" />
              <Lighthouse />
            </div>
            <div className="border border-hair-strong bg-navy-deep/80 p-6 backdrop-blur-sm">
              <p className="text-[13px] text-paper/60">Hoy en tu estudio</p>
              <ul className="mt-4 divide-y divide-hair">
                {TODAY.map((t) => (
                  <li key={t.label} className="flex items-baseline justify-between gap-4 py-3">
                    <span className="text-[14px] text-paper/75">{t.label}</span>
                    <Counter value={t.value} className={`font-display text-[34px] leading-none ${t.tone}`} />
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-[12px] text-paper/50">Ejemplo ilustrativo</p>
            </div>
          </div>
        </div>
        <ul className="mt-16 grid border-t border-hair text-[13px] text-paper/65 sm:grid-cols-3">
          {["Bitácora gratis, la puerta de entrada", "IA que propone, una persona que aprueba", "Creada por contadores, para todos"].map((g, i) => (
            <li key={g} className="flex items-center gap-3 border-b border-hair py-3 sm:border-b-0 sm:border-l sm:px-4 sm:first:border-l-0 sm:first:pl-0">
              <span className="tabular text-gold">0{i + 1}</span>
              {g}
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
