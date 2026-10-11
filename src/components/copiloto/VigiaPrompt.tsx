"use client";

import { ArrowRight, WandSparkles } from "lucide-react";
import { openVigia } from "@/components/vigia/events";

/** Inicio personal: el Vigía arriba, a un toque (abre el panel sin salir del Inicio) */
export function VigiaPrompt() {
  return (
    <a
      href="/vigia"
      onClick={(e) => {
        if (openVigia()) e.preventDefault();
      }}
      className="group flex items-center gap-4 rounded-md border border-line bg-surface p-4 transition-colors hover:border-muted sm:p-5"
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-md bg-navy text-gold">
        <WandSparkles className="size-5" strokeWidth={1.5} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] font-medium text-ink">Contale al Vigía</span>
        <span className="block truncate text-[14px] text-muted">«Ayer 5000 de nafta y 3200 en el chino», una foto del ticket o un audio.</span>
      </span>
      <ArrowRight className="size-4 shrink-0 text-muted transition-transform motion-safe:group-hover:translate-x-0.5" aria-hidden />
    </a>
  );
}
