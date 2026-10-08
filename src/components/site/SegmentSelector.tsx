"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type { Segment } from "@/lib/content";
import { cn } from "@/lib/utils";

// Selector "¿Qué tipo de contribuyente sos?". Al pasar el mouse (o con el foco
// del teclado) la fila se expande y muestra parte de lo que incluye ese segmento.
// En pantallas táctiles el primer toque expande y el segundo entra a la landing.
export function SegmentSelector({ segments }: { segments: Segment[] }) {
  const [active, setActive] = useState<string | null>(null);
  const canHover = useRef<boolean | null>(null);

  function hoverCapable() {
    canHover.current ??= window.matchMedia("(hover: hover)").matches;
    return canHover.current;
  }

  return (
    <ul className="border-t border-ink/80" onMouseLeave={() => hoverCapable() && setActive(null)}>
      {segments.map((s) => {
        const open = active === s.slug;
        const panelId = `segmento-${s.slug}`;
        return (
          <li
            key={s.slug}
            className={cn("border-b border-line transition-colors duration-300", open && "bg-surface")}
            onMouseEnter={() => hoverCapable() && setActive(s.slug)}
            onFocus={() => setActive(s.slug)}
          >
            <Link
              href={`/${s.slug}`}
              aria-expanded={open}
              aria-controls={panelId}
              onClick={(e) => {
                // Táctil: el primer toque solo despliega la fila
                if (!hoverCapable() && !open) {
                  e.preventDefault();
                  setActive(s.slug);
                }
              }}
              className="group flex items-center justify-between gap-6 py-5 sm:px-3"
            >
              <span>
                <span className="block text-xl font-medium">{s.question}</span>
                <span className="mt-1 block text-[15px] text-muted">{s.title}</span>
              </span>
              <svg
                aria-hidden
                viewBox="0 0 24 24"
                className={cn(
                  "size-6 shrink-0 text-rose-deep transition-transform duration-300 ease-out motion-reduce:transition-none",
                  open && "translate-x-1",
                )}
              >
                <path d="M5 12h14m-6-6 6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
            <div
              id={panelId}
              aria-hidden={!open}
              inert={!open}
              className={cn(
                "grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none",
                open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
              )}
            >
              <div className="overflow-hidden">
                <div className="pb-5 sm:px-3">
                  <ul className="grid gap-2 text-[15px] text-ink/80 sm:grid-cols-3 sm:gap-4">
                    {s.includes.slice(0, 3).map((item) => (
                      <li key={item} className="flex gap-2 leading-snug">
                        <svg aria-hidden viewBox="0 0 16 16" className="mt-0.5 size-4 shrink-0 text-rose-deep">
                          <path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        {item}
                      </li>
                    ))}
                  </ul>
                  <Link href={`/${s.slug}`} className="link-underline mt-3 inline-block text-sm font-medium text-rose-deep">
                    Ver todo lo que incluye
                  </Link>
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
