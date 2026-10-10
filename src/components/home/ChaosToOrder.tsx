"use client";

import { ArrowRight, BellRing, CalendarCheck, FileSpreadsheet, FileText, FolderCheck, Mail, MessageCircle, UserRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { Container, SectionIndex } from "@/components/web/ui";
import { onceVisible, reducedMotion } from "@/lib/motion/gsap";
import { cn } from "@/lib/utils";

interface Row {
  /** Cómo es hoy */
  problem: string;
  /** De dónde sale el desorden (lo que se reconoce al instante) */
  source: { icon: LucideIcon; label: string; detail: string };
  /** Cómo queda con el estudio */
  solution: string;
  /** Su equivalente en la plataforma */
  result: { icon: LucideIcon; label: string; detail: string; status: string };
}

const ROWS: Row[] = [
  {
    problem: "Te enterás de los vencimientos cuando ya pasaron.",
    source: { icon: MessageCircle, label: "WhatsApp", detail: "¿Cuándo vence IVA?" },
    solution: "Alertas antes de cada vencimiento, con el importe listo.",
    result: { icon: BellRing, label: "IVA septiembre", detail: "Vence el 20/10 · $642.180", status: "Aviso enviado" },
  },
  {
    problem: "Mandás el mismo comprobante tres veces.",
    source: { icon: FileText, label: "factura_FINAL(2).pdf", detail: "Descargado 3 veces" },
    solution: "Subís cada documento una vez y queda ordenado.",
    result: { icon: FolderCheck, label: "Factura proveedor", detail: "Septiembre · Compras", status: "Clasificado" },
  },
  {
    problem: "Para saber cuánto pagaste tenés que reconstruirlo.",
    source: { icon: FileSpreadsheet, label: "pagos_2026_v4.xlsx", detail: "IIBB septiembre · ¿pagado?" },
    solution: "Un resumen mensual de una página, en criollo.",
    result: { icon: CalendarCheck, label: "Resumen de septiembre", detail: "4 presentaciones · $1.284.300", status: "Disponible" },
  },
  {
    problem: "Nadie sabe quién tiene que responder.",
    source: { icon: Mail, label: "RRHH Agencia Norte", detail: "Recibos de sueldo · sin leer" },
    solution: "Un responsable asignado que contesta en menos de 24 h.",
    result: { icon: UserRound, label: "Lucía González", detail: "Respondió tu consulta", status: "En 3 h" },
  },
];

/**
 * Del caos al orden: cuatro filas que comparan cómo es hoy y cómo queda con el
 * estudio. Cada fila se revela al entrar en pantalla: el desorden se apaga,
 * una línea rosé lo cruza y aparece su equivalente ordenado. Sin secciones
 * fijas (no compite con el scroll de otras secciones) y estático con
 * reduced-motion.
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
    const stops = rows.map((r) => onceVisible(r, () => (r.dataset.on = "1"), "0px 0px -25% 0px"));
    return () => stops.forEach((s) => s());
  }, []);

  return (
    <section ref={root} aria-labelledby="caos-titulo" className="on-paper border-t border-hair-ink bg-paper py-24 text-ink lg:py-32">
      <Container>
        <div className="grid gap-8 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-7">
            <SectionIndex n="02" light>
              Del caos al orden
            </SectionIndex>
            <h2 id="caos-titulo" className="display-md mt-6 max-w-[18ch]">
              La administración no tiene por qué vivir en WhatsApp, mails y planillas.
            </h2>
          </div>
          <p className="max-w-md text-[16px] leading-relaxed text-muted lg:col-span-5 lg:justify-self-end">
            Lo que hoy está desparramado pasa a tener un lugar, un estado y alguien que responde.
          </p>
        </div>

        {/* Encabezados de las dos columnas (escritorio) */}
        <div aria-hidden className="mt-16 hidden grid-cols-[1fr_4rem_1fr] border-b border-hair-ink pb-4 text-[13px] lg:grid">
          <p className="flex items-center gap-3 text-muted">
            <span className="tabular">01</span> Hoy
          </p>
          <span />
          <p className="flex items-center gap-3 text-ink">
            <span className="tabular text-rose-deep">02</span> Con Estudio Cristofaro
          </p>
        </div>

        <ol className="mt-10 lg:mt-0">
          {ROWS.map((r, i) => (
            <li
              key={r.problem}
              data-row
              className="group grid grid-cols-1 gap-5 border-b border-hair-ink py-8 lg:grid-cols-[1fr_4rem_1fr] lg:items-center lg:gap-0 lg:py-10"
            >
              {/* Hoy */}
              <div className="flex min-w-0 gap-5 transition-opacity duration-700 group-data-[on]:opacity-60 lg:pr-8">
                <span className="tabular pt-1 text-[13px] text-muted">0{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] text-muted lg:hidden">Hoy</p>
                  <p className="text-[18px] leading-snug text-ink lg:text-[20px]">{r.problem}</p>
                  <div className="mt-4 inline-flex max-w-full items-center gap-3 border border-dashed border-hair-ink px-3 py-2 text-[13px] text-muted">
                    <r.source.icon className="size-4 shrink-0" strokeWidth={1.5} aria-hidden />
                    <span className="min-w-0 truncate">
                      <span className="text-ink/80">{r.source.label}</span> · {r.source.detail}
                    </span>
                  </div>
                </div>
              </div>

              {/* Línea que cruza de un estado al otro */}
              <div aria-hidden className="relative hidden h-px self-center bg-hair-ink lg:block">
                <span className="absolute inset-0 origin-left scale-x-0 bg-rose-deep transition-transform delay-300 duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-data-[on]:scale-x-100" />
                <ArrowRight className="absolute -right-1 top-1/2 size-4 -translate-y-1/2 text-rose-deep opacity-0 transition-opacity delay-700 duration-300 group-data-[on]:opacity-100" />
              </div>

              {/* Con el estudio */}
              <div className="min-w-0 translate-y-3 opacity-0 transition-[opacity,transform] delay-500 duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-data-[on]:translate-y-0 group-data-[on]:opacity-100 lg:pl-8">
                <p className="text-[13px] text-rose-deep lg:hidden">Con Estudio Cristofaro</p>
                <p className="text-[18px] font-medium leading-snug text-ink lg:text-[20px]">{r.solution}</p>
                <div className="mt-4 flex max-w-md items-center gap-3 border border-hair-ink bg-white px-4 py-3 shadow-[0_10px_30px_-18px_rgba(28,34,53,0.35)]">
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
            </li>
          ))}
        </ol>

        <p className="display-sm mt-14 max-w-[24ch]">Todo en un lugar, con alguien que responde.</p>
      </Container>
    </section>
  );
}
