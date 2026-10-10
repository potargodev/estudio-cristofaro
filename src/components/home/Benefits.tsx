"use client";

import { useEffect, useRef } from "react";
import { Container, SectionIndex } from "@/components/web/ui";
import { isDesktop, loadScrollTrigger, reducedMotion } from "@/lib/motion/gsap";

const BENEFITS = [
  { t: "Alertas antes de cada vencimiento", d: "Te avisamos por mail y WhatsApp con el importe y el VEP listos. Nada te toma por sorpresa." },
  { t: "Resumen mensual en una página", d: "Qué se presentó, cuánto pagaste y qué viene. En criollo, para leer en dos minutos." },
  { t: "Documentos seguros y ordenados", d: "Cada comprobante, recibo y balance clasificado por período y tipo. Descarga privada." },
  { t: "Tu equipo, con su propio acceso", d: "Dirección, RRHH y administración ven y hacen solo lo que les corresponde." },
  { t: "Pedidos con seguimiento", d: "Cada consulta tiene responsable, estado y respuesta. Nadie se pregunta quién la tiene." },
  { t: "Números para decidir", d: "Impuestos pagados, cargas sociales e indicadores mes a mes, sin armar planillas." },
];

/**
 * Beneficios: en escritorio, scroll horizontal fijo con 6 paneles grandes
 * numerados y un índice fino en rosé. En el celular (o con reduced-motion),
 * los paneles van uno debajo del otro.
 */
export function Benefits() {
  const root = useRef<HTMLElement>(null);
  const bar = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (reducedMotion() || !isDesktop()) return;
    let ctx: { revert: () => void } | undefined;
    loadScrollTrigger().then(({ gsap }) => {
      const el = root.current;
      if (!el) return;
      ctx = gsap.context(() => {
        const track = el.querySelector<HTMLElement>("[data-track]")!;
        const dist = () => track.scrollWidth - window.innerWidth;
        gsap.to(track, {
          x: () => -dist(),
          ease: "none",
          scrollTrigger: {
            trigger: "[data-hpin]",
            start: "top top",
            end: () => "+=" + dist(),
            pin: true,
            scrub: 0.6,
            invalidateOnRefresh: true,
            onUpdate: (s) => {
              if (bar.current) bar.current.style.transform = `scaleX(${s.progress})`;
              const i = Math.min(BENEFITS.length - 1, Math.floor(s.progress * BENEFITS.length));
              el.querySelectorAll("[data-idx]").forEach((n, k) => n.classList.toggle("text-rose-light", k === i));
            },
          },
        });
      }, el);
    });
    return () => ctx?.revert();
  }, []);

  return (
    <section ref={root} aria-labelledby="beneficios-titulo" className="border-t border-hair bg-night">
      <div data-hpin className="overflow-hidden py-24 lg:flex lg:h-[100svh] lg:flex-col lg:justify-center lg:py-0">
        <Container>
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <SectionIndex n="05">Beneficios</SectionIndex>
              <h2 id="beneficios-titulo" className="display-sm mt-6 max-w-[16ch] text-paper">
                Lo que cambia en tu día a día.
              </h2>
            </div>
            <ol aria-hidden className="hidden items-center gap-4 text-[12px] text-paper/55 lg:flex">
              {BENEFITS.map((_, i) => (
                <li key={i} data-idx className={`tabular transition-colors duration-300 ${i === 0 ? "text-rose-light" : ""}`}>
                  0{i + 1}
                </li>
              ))}
              <li className="relative ml-2 h-px w-24 bg-hair-strong">
                <span ref={bar} className="absolute inset-0 origin-left bg-rose-light" style={{ transform: "scaleX(0)" }} />
              </li>
            </ol>
          </div>
        </Container>
        <div className="mt-12 lg:mt-16">
          <ol data-track className="flex flex-col border-t border-hair lg:w-max lg:flex-row lg:border-t-0 lg:pl-[max(3rem,calc((100vw-1360px)/2+3rem))]">
            {BENEFITS.map((b, i) => (
              <li
                key={b.t}
                className="flex flex-col justify-between gap-10 border-b border-hair px-5 py-10 sm:px-8 lg:h-[52vh] lg:w-[34rem] lg:border-b-0 lg:border-l lg:px-10 lg:py-2 xl:w-[38rem]"
              >
                <span className="tabular font-display text-[clamp(4rem,8vw,7.5rem)] leading-none text-gold">0{i + 1}</span>
                <div>
                  <h3 className="font-display text-[clamp(1.8rem,2.6vw,2.6rem)] leading-[1.05] text-paper">{b.t}</h3>
                  <p className="mt-4 max-w-[30ch] text-[15px] leading-relaxed text-paper/60">{b.d}</p>
                </div>
              </li>
            ))}
            <li aria-hidden className="hidden lg:block lg:w-[20vw] lg:border-l lg:border-hair" />
          </ol>
        </div>
      </div>
    </section>
  );
}
