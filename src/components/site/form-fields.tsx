"use client";

import { m, useReducedMotion } from "motion/react";

// Campos de la web (tema oscuro): rectos, borde hairline y foco en rosé
export const inputClass =
  "mt-2 block w-full rounded-[2px] border border-hair-strong bg-night px-3.5 py-3 text-[16px] text-paper placeholder:text-paper/35 transition-colors focus:border-rose-light focus:outline-none aria-[invalid=true]:border-danger";

export function Field({
  label,
  name,
  error,
  hint,
  children,
}: {
  label: string;
  name: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-[14px] text-paper/80">
        {label}
      </label>
      {children}
      {hint && !error && <p className="mt-1.5 text-[13px] text-paper/50">{hint}</p>}
      {error && (
        <p id={`${name}-error`} className="mt-1.5 text-[13px] text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function Honeypot() {
  return (
    <div aria-hidden className="absolute left-[-9999px] top-auto h-px w-px overflow-hidden">
      <label>
        No completar
        <input type="text" name="website" tabIndex={-1} autoComplete="off" />
      </label>
    </div>
  );
}

export function SentMessage({ title, text, children }: { title: string; text: string; children?: React.ReactNode }) {
  const reduce = useReducedMotion();
  const ease = [0.22, 1, 0.36, 1] as const;
  return (
    <m.div
      role="status"
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease }}
      className="flex gap-4 border border-rose-light/60 bg-navy-deep p-6"
    >
      {/* Check breve: el círculo se dibuja y después el tilde */}
      <svg aria-hidden viewBox="0 0 40 40" className="size-10 shrink-0 text-rose-light">
        <m.circle
          cx="20"
          cy="20"
          r="17"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          initial={reduce ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.5, ease, delay: 0.1 }}
        />
        <m.path
          d="M12.5 20.5l5 5 10-11"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={reduce ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.35, ease: "easeOut", delay: 0.5 }}
        />
      </svg>
      <div>
        <p className="font-display text-2xl text-paper">{title}</p>
        <p className="mt-2 leading-relaxed text-paper/75">{text}</p>
        {children}
      </div>
    </m.div>
  );
}
