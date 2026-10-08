"use client";

import { m, useReducedMotion } from "motion/react";

const ease = [0.22, 1, 0.36, 1] as const;

/** Etiqueta con un tilde que se dibuja, como las filas del resumen del hero. */
export function HeaderEyebrow({ label }: { label: string }) {
  const reduce = useReducedMotion();
  return (
    <m.p
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease }}
      className="mb-5 inline-flex items-center gap-2 rounded-full border border-rose/40 bg-surface px-3 py-1 text-sm text-rose-deep"
    >
      <svg aria-hidden viewBox="0 0 16 16" className="size-4">
        <m.path
          d="M3 8.5l3 3 7-7"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={reduce ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.45, ease: "easeOut", delay: 0.35 }}
        />
      </svg>
      {label}
    </m.p>
  );
}

/** Línea rosé que se dibuja debajo del título. */
export function HeaderRule() {
  const reduce = useReducedMotion();
  return (
    <m.span
      aria-hidden
      initial={reduce ? false : { scaleX: 0 }}
      animate={{ scaleX: 1 }}
      transition={{ duration: 0.9, ease, delay: 0.25 }}
      className="mt-6 block h-px w-24 origin-left bg-rose"
    />
  );
}
