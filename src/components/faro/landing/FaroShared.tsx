"use client";

import { ArrowRight, Building2, Plane, Receipt } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { SplitHeading } from "@/components/web/SplitHeading";
import { Container, CtaLink, SectionIndex } from "@/components/web/ui";
import { reducedMotion } from "@/lib/motion/gsap";
import { cn } from "@/lib/utils";

// docs/faro-producto.md §2.e. Los números de la demo son coherentes:
// Cena $48.000 (pagó Ana, entre 3) y Nafta $30.000 (pagó Juan, entre 3):
// a cada uno le tocan $26.000 → Ana +22.000, Juan +4.000, Lucía −26.000.
// Simplificado: Lucía → Ana $22.000 y Lucía → Juan $4.000 (2 transferencias).

const money = (n: number) => `$ ${n.toLocaleString("es-AR")}`;
const PEOPLE = [
  { name: "Ana", c: "#c9a596" },
  { name: "Juan", c: "#c9a596" },
  { name: "Lucía", c: "#9ba3ba" },
];
const EXPENSES = [
  { title: "Cena en Godoy Cruz", amount: 48000, payer: "Ana", icon: Receipt },
  { title: "Nafta", amount: 30000, payer: "Juan", icon: Building2, company: true },
];

function Demo() {
  const ref = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(4);
  useEffect(() => {
    if (reducedMotion() || !ref.current) return;
    let t: number | undefined;
    const io = new IntersectionObserver(([e]) => {
      window.clearInterval(t);
      if (!e.isIntersecting) return;
      setStep(0);
      t = window.setInterval(() => setStep((s) => (s >= 5 ? 0 : s + 1)), 1600);
    });
    io.observe(ref.current);
    return () => {
      io.disconnect();
      window.clearInterval(t);
    };
  }, []);
  const show = (n: number) => step >= n || step === 5;
  return (
    <div ref={ref} className="border border-hair-strong bg-navy-deep p-5" role="img" aria-label="Ejemplo: grupo de viaje con dos gastos divididos y las deudas simplificadas en dos transferencias">
      <div className="flex items-center gap-3 border-b border-hair pb-4">
        <span className="grid size-10 place-items-center bg-gold/15 text-gold">
          <Plane className="size-5" strokeWidth={1.5} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-paper">Viaje a Mendoza</p>
          <p className="text-[12px] text-paper/55">Socios · 3 personas · pesos</p>
        </div>
        <div className="flex -space-x-2">
          {PEOPLE.map((p) => (
            <span key={p.name} className="grid size-8 place-items-center rounded-full border-2 border-navy-deep text-[12px] font-semibold text-night" style={{ background: p.c }}>
              {p.name[0]}
            </span>
          ))}
        </div>
      </div>
      <ul className="mt-4 grid gap-3">
        {EXPENSES.map((e, i) =>
          show(i + 1) ? (
            <li key={e.title} className="faro-demo-in border border-hair p-3">
              <p className="flex items-center justify-between gap-3 text-[14px] text-paper">
                <span className="flex items-center gap-2">
                  <e.icon className="size-4 text-gold" strokeWidth={1.5} aria-hidden />
                  {e.title}
                </span>
                <span className="font-display text-[20px]">{money(e.amount)}</span>
              </p>
              <p className="mt-1 text-[12px] text-paper/55">Pagó {e.payer} · en partes iguales</p>
              <div className="mt-2 grid grid-cols-3 gap-1.5 text-center text-[11px]">
                {PEOPLE.map((p) => (
                  <span key={p.name} className="border border-hair py-1 text-paper/75">
                    {p.name} {money(e.amount / 3)}
                  </span>
                ))}
              </div>
              {e.company && <p className="mt-2 text-[12px] text-gold">De la empresa: pasa a los gastos de la organización con el ticket.</p>}
            </li>
          ) : null,
        )}
      </ul>
      <div className={cn("mt-4 border-t border-hair pt-4 transition-opacity duration-500", show(3) ? "opacity-100" : "opacity-0")}>
        <p className="text-[12px] text-paper/55">Saldos</p>
        <div className="mt-2 grid grid-cols-3 gap-2 text-[13px]">
          {[
            ["Ana", 22000],
            ["Juan", 4000],
            ["Lucía", -26000],
          ].map(([n, v]) => (
            <p key={n} className="border border-hair px-2 py-1.5">
              <span className="block text-paper/60">{n}</span>
              <span className={Number(v) >= 0 ? "text-[#8fd1a5]" : "text-[#f0a493]"}>{Number(v) >= 0 ? `le deben ${money(Number(v))}` : `debe ${money(-Number(v))}`}</span>
            </p>
          ))}
        </div>
      </div>
      <div className={cn("mt-4 transition-opacity duration-500", show(4) ? "opacity-100" : "opacity-0")}>
        <p className="text-[12px] text-paper/55">Deudas simplificadas · 2 transferencias</p>
        <ul className="mt-2 grid gap-1.5 text-[14px] text-paper">
          {[
            ["Lucía", "Ana", 22000],
            ["Lucía", "Juan", 4000],
          ].map(([a, b, v]) => (
            <li key={String(b)} className="flex items-center gap-2">
              {a} <ArrowRight className="size-4 text-gold" aria-hidden /> {b}
              <span className="ml-auto font-display text-[18px]">{money(Number(v))}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

const POINTS = [
  "Grupos de socios, equipo, oficina, proyecto, viaje o personales, con invitados sin cuenta",
  "En partes iguales, por porcentaje, por partes, por montos exactos o por ítem del ticket",
  "Pesos y dólares con la cotización que elijas: oficial, MEP o manual",
  "Deudas simplificadas: el mínimo de transferencias posible",
  "Rendición de gastos de empleados y aportes y retiros entre socios",
  "Lo que es de la empresa o deducible pasa a la contabilidad, con su comprobante",
];

export function FaroShared() {
  return (
    <section id="gastos" aria-labelledby="gastos-titulo" className="scroll-mt-16 border-t border-hair bg-night py-16 lg:py-32">
      <Container>
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-6">
            <SectionIndex n="04">Grupos de gastos</SectionIndex>
            <SplitHeading id="gastos-titulo" className="display-md mt-8 text-paper">
              Dividí gastos con socios, equipo o amigos, y que lo de la empresa quede en la contabilidad.
            </SplitHeading>
            <ul className="mt-10 divide-y divide-hair border-y border-hair text-[15px] text-paper/75">
              {POINTS.map((p) => (
                <li key={p} className="py-3.5">
                  {p}
                </li>
              ))}
            </ul>
            <p className="mt-6 text-[14px] text-paper/55">Incluido en todos los planes, para estudios, autónomos, empresas y empleados.</p>
            <CtaLink tone="gold" href="/faro/registro" className="mt-8">
              Empezar gratis
            </CtaLink>
          </div>
          <div className="lg:col-span-5 lg:col-start-8">
            <Demo />
          </div>
        </div>
      </Container>
    </section>
  );
}
