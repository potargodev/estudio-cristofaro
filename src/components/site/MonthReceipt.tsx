"use client";

// Pieza central del hero: el "comprobante" de un mes con el estudio.
// Ilustrativo — muestra cómo se ve el resumen mensual que recibe el cliente.
// Se completa en vivo una sola vez al cargar: cada fila aparece y se tilda, y al
// final cae el sello "Todo al día". Con prefers-reduced-motion se ve el estado final.

import { m, useReducedMotion, type TargetAndTransition } from "motion/react";

const rows = [
  { label: "IVA septiembre", state: "Presentado" },
  { label: "Ingresos Brutos", state: "Presentado" },
  { label: "Sueldos y F.931", state: "Liquidado" },
  { label: "Monotributo socios", state: "Pagado" },
];

const ease = [0.22, 1, 0.36, 1] as const;
const FIRST_ROW = 0.45; // s
const ROW_GAP = 0.42; // s entre filas
const rowDelay = (i: number) => FIRST_ROW + i * ROW_GAP;
const AFTER_ROWS = rowDelay(rows.length);

export function MonthReceipt() {
  const reduce = useReducedMotion();
  // Sin movimiento: todo arranca en su estado final
  const initial = (state: TargetAndTransition) => (reduce ? false : state);

  return (
    <figure className="relative mx-auto w-full max-w-[400px]" aria-label="Ejemplo del resumen mensual que recibe un cliente">
      <m.div
        initial={initial({ opacity: 0, y: 16 })}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease }}
        className="perforated relative bg-surface px-7 pb-10 pt-11 shadow-[0_24px_60px_-28px_rgba(28,34,53,0.4)]"
      >
        <div className="flex items-baseline justify-between border-b border-dashed border-line pb-4">
          <div>
            <p className="text-[13px] text-muted">Resumen mensual</p>
            <p className="text-lg font-semibold">Septiembre 2026</p>
          </div>
          <p className="text-[13px] text-muted">Cliente PyME</p>
        </div>

        <ul className="divide-y divide-dashed divide-line">
          {rows.map((r, i) => (
            <m.li
              key={r.label}
              initial={initial({ opacity: 0, y: 6 })}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease, delay: rowDelay(i) }}
              className="flex items-center justify-between py-3 text-[15px]"
            >
              <span>{r.label}</span>
              <span className="inline-flex items-center gap-1.5 text-rose-deep">
                <svg aria-hidden viewBox="0 0 16 16" className="size-4">
                  <m.path
                    d="M3 8.5l3 3 7-7"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={initial({ pathLength: 0 })}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.35, ease: "easeOut", delay: rowDelay(i) + 0.22 }}
                  />
                </svg>
                <m.span
                  initial={initial({ opacity: 0 })}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3, delay: rowDelay(i) + 0.32 }}
                >
                  {r.state}
                </m.span>
              </span>
            </m.li>
          ))}
        </ul>

        <m.div
          initial={initial({ opacity: 0, y: 6 })}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease, delay: AFTER_ROWS }}
          className="mt-2 rounded-[4px] bg-rose-soft/60 px-3 py-3"
        >
          <p className="text-[13px] text-ink/70">Próximo vencimiento</p>
          <p className="mt-0.5 font-semibold">IVA octubre · te avisamos 5 días antes</p>
        </m.div>

        <p className="mt-5 text-[13px] leading-relaxed text-muted">
          Cada mes recibís esta página: qué se presentó, qué se pagó y qué viene.
        </p>
      </m.div>

      {/* Fuera del bloque perforado (su máscara lo recortaba) y sobre el margen
          superior, para no tapar ninguna fila del resumen. Cae al final. */}
      <m.div
        aria-hidden
        initial={initial({ opacity: 0, scale: 1.7, rotate: -18 })}
        animate={{ opacity: 1, scale: 1, rotate: -8 }}
        transition={{ type: "spring", stiffness: 420, damping: 22, mass: 0.9, delay: AFTER_ROWS + 0.35 }}
        className="absolute -top-5 right-3 rounded-[6px] border-[3px] border-rose bg-surface px-3 py-1.5 text-center text-rose-deep sm:-right-4"
      >
        <span className="block text-[11px] font-semibold leading-tight">Todo</span>
        <span className="block text-lg font-bold leading-tight">al día</span>
      </m.div>
    </figure>
  );
}
