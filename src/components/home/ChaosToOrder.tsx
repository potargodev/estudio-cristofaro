"use client";

import { ArrowRight, BellRing, CalendarCheck, FileSpreadsheet, FileText, FolderCheck, Mail, MessageCircle, UserRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { Container, SectionIndex } from "@/components/web/ui";
import { onceVisible, reducedMotion } from "@/lib/motion/gsap";

interface Row {
  topic: string;
  /** Cómo es hoy */
  problem: string;
  /** De dónde sale el desorden (lo que se reconoce al instante) */
  source: { icon: LucideIcon; text: string };
  /** Cómo queda con el estudio */
  solution: string;
  /** Su equivalente en la plataforma */
  result: { icon: LucideIcon; label: string; detail: string; status: string };
}

const ROWS: Row[] = [
  {
    topic: "Vencimientos",
    problem: "Te enterás del vencimiento cuando ya pasó.",
    source: { icon: MessageCircle, text: "WhatsApp · ¿Cuándo vence IVA?" },
    solution: "Te avisamos antes, con el importe y el VEP listos.",
    result: { icon: BellRing, label: "IVA septiembre", detail: "Vence el 20/10 · $642.180", status: "Aviso enviado" },
  },
  {
    topic: "Documentos",
    problem: "Mandás el mismo comprobante tres veces.",
    source: { icon: FileText, text: "factura_FINAL(2).pdf · descargado 3 veces" },
    solution: "Lo subís una vez y queda archivado, por período y tipo.",
    result: { icon: FolderCheck, label: "Factura de proveedor", detail: "Septiembre · Compras", status: "Clasificado" },
  },
  {
    topic: "Pagos",
    problem: "Para saber cuánto pagaste, armás otra planilla.",
    source: { icon: FileSpreadsheet, text: "pagos_2026_v4.xlsx · ¿pagado?" },
    solution: "Cada mes, un resumen de una página para leer en dos minutos.",
    result: { icon: CalendarCheck, label: "Resumen de septiembre", detail: "4 presentaciones · $1.284.300", status: "Disponible" },
  },
  {
    topic: "Consultas",
    problem: "No sabés quién te va a responder.",
    source: { icon: Mail, text: "Recibos de sueldo · sin leer" },
    solution: "Tu contador asignado te contesta en menos de 24 h.",
    result: { icon: UserRound, label: "Lucía González", detail: "Respondió tu consulta", status: "En 3 h" },
  },
];

/**
 * Del caos al orden. En escritorio, el planteo queda fijo a la izquierda
 * mientras a la derecha pasan cuatro comparaciones (hoy → con el estudio).
 * Cada una se revela al entrar en pantalla: lo de hoy se apaga y se tacha, y
 * aparece su equivalente ordenado. Estático con reduced-motion.
 */
export function ChaosToOrder() {
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const rows = [...el.querySelectorAll<HTMLElement>("[data-row]")];
    if (reducedMotion()) {
      rows.forEach((r) => (r.dataset.on = "1"));
      return;
    }
    const stops = rows.map((r) => onceVisible(r, () => (r.dataset.on = "1"), "0px 0px -20% 0px"));
    return () => stops.forEach((s) => s());
  }, []);

  return (
    <section ref={root} aria-labelledby="caos-titulo" className="on-paper border-t border-hair-ink bg-paper py-16 text-ink lg:py-32">
      <Container className="grid gap-14 lg:grid-cols-12 lg:gap-12">
        {/* Planteo */}
        <div className="lg:col-span-4">
          <div className="lg:sticky lg:top-32">
            <SectionIndex n="02" light>
              Del caos al orden
            </SectionIndex>
            <h2 id="caos-titulo" className="display-sm mt-6 max-w-[14ch]">
              Del grupo de WhatsApp a un sistema que avisa solo.
            </h2>
            <p className="mt-6 max-w-sm text-[16px] leading-relaxed text-muted">
              Mails, planillas y mensajes sueltos pasan a un solo lugar, con fechas, estados y una persona que responde.
            </p>
            <dl className="mt-10 grid grid-cols-2 border-t border-hair-ink text-[13px]">
              <div className="border-r border-hair-ink py-4 pr-4">
                <dt className="text-muted">Hoy</dt>
                <dd className="mt-1 text-ink">Todo depende de acordarse.</dd>
              </div>
              <div className="py-4 pl-4">
                <dt className="text-rose-deep">Con Estudio Cristofaro</dt>
                <dd className="mt-1 text-ink">Todo tiene fecha y dueño.</dd>
              </div>
            </dl>
            <a href="#plataforma" className="mt-8 inline-flex items-center gap-2 text-[15px] text-ink underline decoration-hair-ink underline-offset-[6px] hover:decoration-rose-deep">
              Ver la plataforma <ArrowRight className="size-4" aria-hidden />
            </a>
          </div>
        </div>

        {/* Comparaciones */}
        <ol className="border-b border-hair-ink lg:col-span-8">
          {ROWS.map((r, i) => (
            <li key={r.topic} data-row className="group border-t border-hair-ink py-8 lg:py-10">
              <p className="flex items-center gap-3 text-[13px] text-muted">
                <span className="tabular text-rose-deep">0{i + 1}</span>
                {r.topic}
              </p>
              <div className="mt-5 grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-10">
                {/* Hoy */}
                <div className="min-w-0">
                  <p className="text-[12px] text-muted">Hoy</p>
                  <p className="mt-1.5 text-[18px] leading-snug text-ink transition-[color,text-decoration-color] delay-200 duration-700 [text-decoration-line:line-through] [text-decoration-color:transparent] group-data-[on]:text-muted group-data-[on]:[text-decoration-color:var(--color-rose-deep)]">
                    {r.problem}
                  </p>
                  <p className="mt-4 inline-flex max-w-full items-center gap-2.5 border border-dashed border-hair-ink px-3 py-2 text-[13px] text-muted">
                    <r.source.icon className="size-4 shrink-0" strokeWidth={1.5} aria-hidden />
                    <span className="min-w-0 truncate">{r.source.text}</span>
                  </p>
                </div>
                {/* Con el estudio */}
                <div className="min-w-0 translate-y-3 opacity-0 transition-[opacity,transform] delay-500 duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-data-[on]:translate-y-0 group-data-[on]:opacity-100">
                  <p className="text-[12px] text-rose-deep">Con Estudio Cristofaro</p>
                  <p className="mt-1.5 text-[18px] font-medium leading-snug text-ink">{r.solution}</p>
                  <div className="mt-4 flex items-center gap-3 border border-hair-ink bg-white px-3.5 py-3 shadow-[0_10px_30px_-18px_rgba(28,34,53,0.35)]">
                    <span className="grid size-9 shrink-0 place-items-center bg-navy text-paper">
                      <r.result.icon className="size-4" strokeWidth={1.5} aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-medium text-ink">{r.result.label}</span>
                      <span className="tabular block truncate text-[13px] text-muted">{r.result.detail}</span>
                    </span>
                    <span className="shrink-0 border border-rose/40 bg-rose-soft px-2 py-0.5 text-[12px] text-rose-deep">{r.result.status}</span>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}
