"use client";

import { useEffect, useRef } from "react";
import { Container } from "@/components/web/ui";
import { isDesktop, loadScrollTrigger, reducedMotion } from "@/lib/motion/gsap";

const BENEFITS = [
  { t: "Alertas antes de cada vencimiento", d: "Te avisamos en la app y por mail, con el importe. Nada te toma por sorpresa." },
  { t: "Mensajes con el estudio", d: "Chateás con tu contador en tiempo real, con adjuntos y avisos en el celular." },
  { t: "Documentos seguros y ordenados", d: "Cada comprobante, recibo y balance clasificado por período y tipo. Descarga privada." },
  { t: "Tu equipo, con su propio acceso", d: "Dirección, RRHH, administración y empleados ven y hacen solo lo que les corresponde. Cada uno, con su Vigía y su Bitácora privada." },
  { t: "Pedidos con seguimiento", d: "Cada consulta tiene responsable, estado y respuesta. Nadie se pregunta quién la tiene." },
  { t: "Números para decidir", d: "Lo que pagaste de impuestos y los gastos y rendiciones de la empresa, mes a mes, sin armar planillas." },
];

/**
 * Beneficios: en escritorio, scroll horizontal fijo con 6 paneles grandes
 * numerados y un índice fino en rosé. En el celular (o con reduced-motion),
 * los paneles van uno debajo del otro (en escritorio con reduced-motion, en
 * una grilla de tres columnas: sin animación no hay forma de llegar a los que
 * quedan afuera).
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
              el.querySelectorAll("[data-idx]").forEach((n, k) => (n.classList.toggle("font-semibold", k === i), n.classList.toggle("underline", k === i)));
            },
          },
        });
      }, el);
    });
    return () => ctx?.revert();
  }, []);

  return (
    <section ref={root} aria-labelledby="beneficios-titulo" className="bg-gold text-[#1c2235]">
      <div data-hpin className="overflow-hidden py-16 lg:py-24 lg:motion-safe:flex lg:motion-safe:h-[100svh] lg:motion-safe:flex-col lg:motion-safe:justify-center lg:motion-safe:py-0">
        <Container>
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="flex items-center gap-3 text-meta text-[#1c2235]">
                <span className="tabular">05</span>
                <span aria-hidden className="h-px w-8 bg-[#1c2235]/40" />
                <span>Beneficios</span>
              </p>
              <h2 id="beneficios-titulo" className="display-sm mt-6 max-w-[16ch] text-[#1c2235]">
                Lo que cambia en tu día a día.
              </h2>
            </div>
            <ol aria-hidden className="hidden items-center gap-4 text-caption text-[#1c2235] lg:motion-safe:flex">
              {BENEFITS.map((_, i) => (
                <li key={i} data-idx className={`tabular underline-offset-4 ${i === 0 ? "font-semibold underline" : ""}`}>
                  0{i + 1}
                </li>
              ))}
              <li className="relative ml-2 h-px w-24 bg-[#1c2235]/25">
                <span ref={bar} className="absolute inset-0 origin-left bg-[#1c2235]" style={{ transform: "scaleX(0)" }} />
              </li>
            </ol>
          </div>
        </Container>
        <div className="mt-10 lg:mt-16">
          <ol data-track className="flex flex-col gap-4 px-5 sm:px-8 lg:motion-safe:w-max lg:motion-safe:flex-row lg:motion-safe:gap-6 lg:motion-safe:px-0 lg:motion-safe:pl-[max(3rem,calc((100vw-1360px)/2+3rem))] lg:motion-reduce:mx-auto lg:motion-reduce:grid lg:motion-reduce:max-w-[1360px] lg:motion-reduce:grid-cols-3 lg:motion-reduce:gap-6 lg:motion-reduce:px-12">
            {BENEFITS.map((b, i) => (
              <li
                key={b.t}
                className="flex flex-col justify-between gap-5 lg:motion-safe:h-[52vh] lg:motion-safe:w-[30rem] xl:motion-safe:w-[34rem]"
              >
                <span className="tabular font-display text-[2.75rem] leading-none text-[#1c2235] lg:text-[clamp(4rem,8vw,7.5rem)]">0{i + 1}</span>
                <div className="bg-[#1c2235] p-6 lg:min-h-[15rem] lg:p-8">
                  <h3 className="font-display text-[1.6rem] leading-[1.1] text-gold lg:text-[clamp(1.8rem,2.4vw,2.4rem)] lg:leading-[1.05]">{b.t}</h3>
                  <p className="mt-4 max-w-[32ch] text-body leading-relaxed text-white">{b.d}</p>
                </div>
              </li>
            ))}
            <li aria-hidden className="hidden lg:motion-safe:block lg:w-[20vw]" />
          </ol>
        </div>
      </div>
    </section>
  );
}
