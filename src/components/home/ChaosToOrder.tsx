"use client";

import { FileText, Mail } from "lucide-react";
import { useEffect, useRef } from "react";
import { isDesktop, loadGsap, reducedMotion } from "@/lib/motion/gsap";
import { Container, SectionIndex } from "@/components/web/ui";

const BEFORE = [
  "Te enterás de los vencimientos cuando ya pasaron.",
  "Mandás el mismo comprobante tres veces.",
  "Para saber cuánto pagaste tenés que reconstruirlo.",
  "Nadie sabe quién tiene que responder.",
];
const AFTER = [
  "Alertas antes de cada vencimiento, con el importe listo.",
  "Subís cada documento una vez y queda ordenado.",
  "Un resumen mensual de una página, en criollo.",
  "Un responsable asignado que contesta en menos de 24 h.",
];

// Desorden inicial de cada pieza: desplazamiento (en % de la pieza), giro y escala
const CHAOS = [
  { x: -160, y: -120, r: -14, s: 1.05 },
  { x: 140, y: -170, r: 9, s: 0.95 },
  { x: -210, y: 60, r: 7, s: 1 },
  { x: 180, y: 110, r: -11, s: 1.08 },
  { x: -90, y: 190, r: 15, s: 0.9 },
  { x: 230, y: -40, r: -6, s: 1 },
  { x: -250, y: -30, r: 12, s: 0.95 },
  { x: 60, y: 230, r: -9, s: 1.05 },
];

/** Pieza del dashboard: arranca dispersa y vuela a su lugar con el scroll */
function Piece({ i, className, children }: { i: number; className?: string; children: React.ReactNode }) {
  return (
    <div data-piece={i} className={`border border-hair-ink bg-surface ${className ?? ""}`}>
      {children}
    </div>
  );
}

/**
 * "Del caos al orden": en escritorio la sección queda fija (~250vh) y, con el
 * scroll, las burbujas de WhatsApp, los PDF, las filas de planilla y el mail
 * vuelan a su lugar y arman el panel del cliente. En el celular y con
 * reduced-motion se ve directo el panel ordenado.
 */
export function ChaosToOrder() {
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    if (reducedMotion() || !isDesktop()) return;
    let ctx: { revert: () => void } | undefined;
    loadGsap().then(({ gsap }) => {
      if (!root.current) return;
      ctx = gsap.context(() => {
        const pieces = gsap.utils.toArray<HTMLElement>("[data-piece]");
        const tl = gsap.timeline({
          scrollTrigger: { trigger: "[data-pin]", start: "top top", end: "+=150%", scrub: 0.8, pin: true, anticipatePin: 1 },
        });
        pieces.forEach((p, i) => {
          const c = CHAOS[i % CHAOS.length];
          tl.from(p, { xPercent: c.x, yPercent: c.y, rotation: c.r, scale: c.s, ease: "power3.inOut", duration: 1 }, i * 0.04);
        });
        tl.from("[data-frame]", { opacity: 0, duration: 0.4 }, 0.55)
          .from("[data-frame-line]", { scaleX: 0, transformOrigin: "left", duration: 0.5, stagger: 0.05 }, 0.5)
          .to("[data-before]", { opacity: 0, yPercent: -10, duration: 0.3 }, 0.35)
          .from("[data-after]", { opacity: 0, yPercent: 10, duration: 0.3 }, 0.6)
          .from("[data-after] li", { opacity: 0, x: -12, stagger: 0.05, duration: 0.25 }, 0.7);
      }, root);
    });
    return () => ctx?.revert();
  }, []);

  return (
    <section ref={root} aria-labelledby="caos-titulo" className="bg-paper text-ink">
      <div data-pin className="flex min-h-[100svh] items-center py-24 lg:py-0">
        <Container>
          <div className="grid items-center gap-14 lg:grid-cols-12">
            <div className="relative lg:col-span-5">
              <SectionIndex n="02" light>Del caos al orden</SectionIndex>
              <div className="relative mt-8">
                <div data-before>
                  <h2 id="caos-titulo" className="display-sm text-ink">
                    Hoy: la administración vive en WhatsApp, mails y planillas.
                  </h2>
                  <ul className="mt-8 space-y-3 text-[15px] text-muted">
                    {BEFORE.map((b) => (
                      <li key={b} className="border-l border-hair-ink pl-4">
                        {b}
                      </li>
                    ))}
                  </ul>
                </div>
                <div data-after className="mt-14 lg:absolute lg:inset-0 lg:mt-0">
                  <p className="display-sm text-ink">
                    Con Estudio Cristofaro: todo en un lugar, con alguien que responde.
                  </p>
                  <ul className="mt-8 space-y-3 text-[15px] text-ink/85">
                    {AFTER.map((b) => (
                      <li key={b} className="border-l border-rose pl-4">
                        {b}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            {/* El panel que se arma */}
            <div className="relative lg:col-span-7" aria-label="Panel de la empresa, ordenado" role="img">
              <div data-frame className="border border-hair-ink bg-surface p-4 sm:p-6">
                <div className="flex items-center justify-between border-b border-hair-ink pb-3 text-[12px] text-muted">
                  <span>Agencia Norte · octubre</span>
                  <span className="tabular">8 de 10 resuelto</span>
                </div>
                <div className="mt-4 grid grid-cols-6 gap-3">
                  <div className="col-span-6 sm:col-span-4">
                    <p data-frame-line className="mb-2 border-b border-hair-ink pb-1 text-[11px] text-rose-deep">
                      Vencimientos
                    </p>
                    {[
                      ["IVA septiembre", "20/10", "$642.180"],
                      ["Ganancias anticipo 5", "13/10", "$214.900"],
                      ["Ingresos Brutos CABA", "16/10", "$98.420"],
                    ].map(([t, d, a], k) => (
                      <Piece key={t} i={k} className="mb-2 grid grid-cols-[1fr_auto_auto] gap-3 px-3 py-2 text-[12px] text-ink/85">
                        <span>{t}</span>
                        <span className="tabular text-muted">{d}</span>
                        <span className="tabular">{a}</span>
                      </Piece>
                    ))}
                  </div>
                  <div className="col-span-6 sm:col-span-2">
                    <p data-frame-line className="mb-2 border-b border-hair-ink pb-1 text-[11px] text-rose-deep">
                      Documentos
                    </p>
                    {["factura-0012.pdf", "recibos-sept.pdf"].map((f, k) => (
                      <Piece key={f} i={3 + k} className="mb-2 flex items-center gap-2 px-3 py-2 text-[12px] text-ink/85">
                        <FileText className="size-3.5 text-rose-deep" aria-hidden />
                        {f}
                      </Piece>
                    ))}
                  </div>
                  <div className="col-span-6 sm:col-span-3">
                    <p data-frame-line className="mb-2 border-b border-hair-ink pb-1 text-[11px] text-rose-deep">
                      Solicitudes
                    </p>
                    <Piece i={5} className="px-3 py-2 text-[12px] text-ink/85">
                      <span className="block bg-[#dcf2e3] px-2 py-1 text-[#1d4a30]">¿Me pasás el VEP de IVA?</span>
                      <span className="mt-1 block border-l border-rose pl-2 text-muted">Listo: está en Vencimientos.</span>
                    </Piece>
                  </div>
                  <div className="col-span-6 sm:col-span-3">
                    <p data-frame-line className="mb-2 border-b border-hair-ink pb-1 text-[11px] text-rose-deep">
                      Resumen del mes
                    </p>
                    <Piece i={6} className="flex items-center gap-2 px-3 py-2 text-[12px] text-ink/85">
                      <Mail className="size-3.5 text-rose-deep" aria-hidden />
                      Tu septiembre, en una página
                    </Piece>
                    <Piece i={7} className="mt-2 px-3 py-2 text-[12px] text-muted">
                      Responde: Lucía G. · menos de 24 h
                    </Piece>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Container>
      </div>
    </section>
  );
}
