"use client";

import { m, useReducedMotion } from "motion/react";

export const inputClass =
  "mt-1.5 block w-full rounded-md border border-line bg-surface px-3.5 py-2.5 text-[16px] placeholder:text-muted/70 focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy/25";

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
      <label htmlFor={name} className="block text-[15px] font-medium">
        {label}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-sm text-muted">{hint}</p>}
      {error && (
        <p id={`${name}-error`} className="mt-1 text-sm text-danger">
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

export function SentMessage({ title, text }: { title: string; text: string }) {
  const reduce = useReducedMotion();
  const ease = [0.22, 1, 0.36, 1] as const;
  return (
    <m.div
      role="status"
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease }}
      className="flex gap-4 rounded-md border border-navy bg-navy-soft p-6"
    >
      {/* Check breve: el círculo se dibuja y después el tilde */}
      <svg aria-hidden viewBox="0 0 40 40" className="size-10 shrink-0 text-rose-deep">
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
        <p className="text-lg font-semibold text-navy-deep">{title}</p>
        <p className="mt-2 leading-relaxed text-ink/80">{text}</p>
      </div>
    </m.div>
  );
}
