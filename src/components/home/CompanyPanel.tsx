"use client";

import { useEffect, useRef } from "react";
import { Counter } from "@/components/web/Counter";
import { SplitHeading } from "@/components/web/SplitHeading";
import { Container, SectionIndex } from "@/components/web/ui";
import { DEMO } from "@/lib/home";
import { loadGsap, reducedMotion } from "@/lib/motion/gsap";
import { cn } from "@/lib/utils";

const money = (n: number) => "$" + new Intl.NumberFormat("es-AR").format(n);

const MENU = ["Inicio", "Vencimientos", "Documentos", "Solicitudes", "Sueldos", "Indicadores", "Mi equipo"];
// Impuestos pagados por mes (miles de pesos, ejemplo)
const CHART = [
  ["may", 820],
  ["jun", 940],
  ["jul", 880],
  ["ago", 1120],
  ["sep", 1040],
  ["oct", 1284],
] as const;
const NOTIFS = [
  { t: "IVA vence en 3 días", d: `${money(DEMO.ivaAmount)}. Tocá para pagar con VEP.` },
  { t: "Recibos de sueldo listos", d: "12 recibos de septiembre." },
  { t: "Lucía respondió tu consulta", d: "Sobre el alta de la diseñadora." },
  { t: "Tu mes de septiembre, en una página", d: "Resumen mensual disponible." },
];

function Chart() {
  const W = 420;
  const H = 140;
  const max = 1400;
  const pts = CHART.map(([, v], i) => [20 + (i * (W - 40)) / (CHART.length - 1), H - 20 - (v / max) * (H - 40)] as const);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" aria-hidden>
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} stroke="rgba(247,245,243,0.08)" />
      ))}
      <path data-chart d={d} fill="none" stroke="#c9a596" strokeWidth="1.5" pathLength={1} strokeDasharray="1" />
      {pts.map(([x, y], i) => (
        <g key={i}>
          <circle data-dot cx={x} cy={y} r="2.5" fill="#0f1320" stroke="#c9a596" />
          <text x={x} y={H - 4} textAnchor="middle" fontSize="10" fill="rgba(247,245,243,0.45)">
            {CHART[i][0]}
          </text>
        </g>
      ))}
    </svg>
  );
}

/**
 * "Tu panel de empresa": el panel de escritorio rota de rotateX(18deg) a 0 al
 * entrar, los KPIs cuentan, el gráfico se dibuja y las notificaciones entran
 * apiladas en el celular.
 */
export function CompanyPanel() {
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    if (reducedMotion()) return;
    let ctx: { revert: () => void } | undefined;
    loadGsap().then(({ gsap }) => {
      if (!root.current) return;
      ctx = gsap.context(() => {
        const tl = gsap.timeline({ scrollTrigger: { trigger: "[data-desk]", start: "top 85%", once: true } });
        tl.from("[data-desk]", { rotateX: 18, y: 60, opacity: 0.2, duration: 1.6, transformPerspective: 1600, transformOrigin: "50% 0%" })
          .from("[data-chart]", { strokeDashoffset: 1, duration: 1.6, ease: "power2.inOut" }, 0.5)
          .from("[data-dot]", { opacity: 0, stagger: 0.12, duration: 0.3 }, 0.7)
          .from("[data-notif]", { y: 40, opacity: 0, stagger: 0.18, duration: 0.9 }, 0.6);
      }, root);
    });
    return () => ctx?.revert();
  }, []);

  return (
    <section ref={root} aria-labelledby="panel-titulo" className="overflow-hidden border-t border-hair bg-navy-deep py-24 lg:py-36">
      <Container>
        <div className="grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <SectionIndex n="04">Incluido en todos los planes</SectionIndex>
            <SplitHeading id="panel-titulo" className="display-md mt-8 text-paper">
              Tu panel de empresa, abierto las 24 horas.
            </SplitHeading>
          </div>
          <p className="self-end text-[17px] leading-relaxed text-paper/65 lg:col-span-4 lg:col-start-9">
            Lo que antes era un mail al contador ahora es una pantalla que se actualiza sola.
          </p>
        </div>

        <div className="relative mt-16 [perspective:1600px] lg:grid lg:grid-cols-12 lg:items-end" role="img" aria-label={`Ejemplo del panel de ${DEMO.client}: 8 de 10 tareas resueltas, ${money(DEMO.toPay)} a pagar en octubre, 2 documentos por confirmar.`}>
          <div data-desk className="grid border border-hair-strong bg-night lg:col-span-10 lg:col-start-1 lg:row-start-1 lg:grid-cols-[13rem_1fr]" aria-hidden>
            <nav className="hidden border-r border-hair p-5 text-[13px] lg:block">
              <p className="font-display text-[20px] text-paper">{DEMO.client}</p>
              <ul className="mt-6">
                {MENU.map((m, i) => (
                  <li key={m} className={cn("border-l py-1.5 pl-3", i === 0 ? "border-rose-light text-paper" : "border-transparent text-paper/50")}>
                    {m}
                  </li>
                ))}
              </ul>
              <div className="mt-8 border-t border-hair pt-4">
                <p className="text-[11px] text-paper/45">Tu responsable</p>
                <p className="mt-1 text-paper">Lucía González</p>
                <p className="text-[12px] text-paper/50">Responde en menos de 24 h</p>
              </div>
            </nav>
            <div className="p-5 sm:p-7 lg:pr-24">
              <div className="flex items-baseline justify-between border-b border-hair pb-4">
                <p className="text-[15px] text-paper">Hola, {DEMO.user}</p>
                <p className="text-[12px] text-paper/45">Octubre</p>
              </div>
              <div className="mt-6 grid gap-px bg-hair sm:grid-cols-3">
                <div className="bg-night p-4">
                  <p className="text-[12px] text-paper/55">Resuelto</p>
                  <p className="tabular mt-3 font-display text-[clamp(1.9rem,2.5vw,2.5rem)] leading-none text-paper">
                    <Counter value={8} />
                    <span className="text-paper/35">/10</span>
                  </p>
                </div>
                <div className="bg-night p-4">
                  <p className="text-[12px] text-paper/55">A pagar en octubre</p>
                  <p className="tabular mt-3 font-display text-[clamp(1.9rem,2.5vw,2.5rem)] leading-none text-paper">
                    <Counter value={DEMO.toPay} prefix="$" />
                  </p>
                  <p className="mt-2 text-[12px] text-paper/45">3 pagos pendientes</p>
                </div>
                <div className="bg-night p-4">
                  <p className="text-[12px] text-paper/55">Documentos por confirmar</p>
                  <p className="tabular mt-3 font-display text-[clamp(1.9rem,2.5vw,2.5rem)] leading-none text-rose-light">
                    <Counter value={2} />
                  </p>
                </div>
              </div>
              <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
                <div>
                  <p className="text-[12px] text-paper/55">Impuestos pagados por mes</p>
                  <div className="mt-3">
                    <Chart />
                  </div>
                </div>
                <div className="text-[13px] text-paper/80">
                  <p className="text-[12px] text-paper/55">Próximos vencimientos</p>
                  {[
                    ["F.931", "09/10"],
                    ["Ganancias anticipo 5", "13/10"],
                    ["Ingresos Brutos CABA", "16/10"],
                    ["IVA septiembre", "20/10"],
                  ].map(([t, d]) => (
                    <p key={t} className="flex justify-between border-b border-hair py-2">
                      {t}
                      <span className="tabular text-paper/50">{d}</span>
                    </p>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Celular con notificaciones */}
          <div
            aria-hidden
            className="relative z-10 mx-auto mt-10 w-[17rem] border border-hair-strong bg-night p-3 lg:col-span-3 lg:col-start-10 lg:row-start-1 lg:-mb-12 lg:ml-auto lg:mr-0 lg:mt-0 lg:w-full lg:max-w-[17rem]"
          >
            <div className="flex justify-between px-1 pb-3 text-[11px] text-paper/45">
              <span className="tabular">9:41</span>
              <span>Estudio Cristofaro</span>
            </div>
            <div className="space-y-2">
              {NOTIFS.map((n) => (
                <div data-notif key={n.t} className="border border-hair bg-navy-deep px-3 py-2.5">
                  <p className="text-[12px] text-paper">{n.t}</p>
                  <p className="mt-0.5 text-[11px] leading-snug text-paper/55">{n.d}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
