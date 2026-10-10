import { HERO_INTERVAL, HERO_SLIDES, HERO_STATEMENTS } from "@/lib/hero";
import { SCHEDULE_HREF } from "@/lib/site";
import { CtaLink, TextLink } from "@/components/web/ui";
import { HeroMotion } from "./HeroMotion";
import { HeroStatements } from "./HeroStatements";

const GUARANTEES = ["Respuesta en menos de 24 h hábiles", "Abono mensual fijo", "Conectado con Tango"];

// La intro se ve una sola vez por sesión y solo con movimiento permitido: el
// script marca el estado inicial antes de pintar (sin parpadeo).
const introScript = `!function(){try{var d=document.documentElement;if(matchMedia('(prefers-reduced-motion: reduce)').matches||sessionStorage.getItem('intro-visto'))return;sessionStorage.setItem('intro-visto','1');d.classList.add('intro');setTimeout(function(){d.classList.remove('intro')},2600)}catch(e){}}()`;

export function Hero() {
  return (
    <section aria-label="Presentación" className="relative isolate min-h-[100svh] overflow-hidden bg-night">
      <script dangerouslySetInnerHTML={{ __html: introScript }} />
      <HeroMotion slides={HERO_SLIDES} interval={HERO_INTERVAL}>
        <div className="relative z-10 mx-auto flex min-h-[100svh] max-w-[1360px] flex-col justify-end px-5 pb-8 pt-28 sm:px-8 lg:px-12">
          <p data-intro="fade" className="text-[14px] text-paper/70">
            Estudio contable para PyMEs de servicios en CABA y GBA
          </p>
          <HeroStatements statements={HERO_STATEMENTS} interval={HERO_INTERVAL} />
          <div data-intro="line" className="mt-10 h-px origin-left bg-hair-strong" />
          <div className="grid gap-8 pt-8 lg:grid-cols-12">
            <p data-intro="fade" className="max-w-xl text-[17px] leading-relaxed text-paper/80 lg:col-span-6">
              Impuestos, contabilidad y sueldos resueltos por un equipo con nombre y apellido, y una plataforma donde ves qué está hecho, qué tenés
              que pagar y qué viene después.
            </p>
            <div data-intro="fade" className="flex flex-wrap items-center gap-6 lg:col-span-6 lg:justify-end">
              <CtaLink href={SCHEDULE_HREF}>Agendar 20 minutos con el estudio</CtaLink>
              <TextLink href="#plataforma" className="text-[15px] text-paper">
                Ver la plataforma
              </TextLink>
            </div>
          </div>
          <ul data-intro="fade" className="mt-10 grid border-t border-hair text-[13px] text-paper/65 sm:grid-cols-3">
            {GUARANTEES.map((g, i) => (
              <li key={g} className="flex items-center gap-3 border-b border-hair py-3 sm:border-b-0 sm:border-l sm:px-4 sm:first:border-l-0 sm:first:pl-0">
                <span className="tabular text-rose-light">0{i + 1}</span>
                {g}
              </li>
            ))}
          </ul>
        </div>
      </HeroMotion>
    </section>
  );
}
