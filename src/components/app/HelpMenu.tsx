"use client";

import { BookOpen, CircleHelp, Compass, FileQuestion, ListChecks } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Popover } from "@/components/ds/Popover";
import { helpFor } from "@/lib/help-map";
import { cn } from "@/lib/utils";
import { startTour, toggleGuide, useGuideState } from "./Guide";

/**
 * "?" de la barra superior (docs/faro-producto.md §2.o, regla 4): junta todo
 * lo de ayuda. El tour de esta pantalla, Primeros pasos, el artículo de esta
 * pantalla, el Centro de ayuda y el interruptor de la Guía.
 */
export function HelpMenu({ className }: { className?: string }) {
  const g = useGuideState();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useEffect(() => setOpen(false), [pathname]);
  const article = helpFor(pathname);
  const item = "flex w-full items-center gap-2.5 rounded-md px-3 py-2.5 text-left hover:bg-canvas";
  return (
    <div className="relative">
      <button
        ref={btn}
        type="button"
        data-tour="ayuda"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Ayuda y guía"
        title="Ayuda y guía"
        className={cn("grid size-9 place-items-center", className)}
      >
        <CircleHelp className="size-[18px]" strokeWidth={1.6} aria-hidden />
      </button>
      <Popover open={open} onClose={close} anchor={btn} label="Ayuda" className="w-[min(18rem,calc(100vw-1rem))] border border-line bg-surface p-1.5 text-ui text-ink">
          <button
            type="button"
            role="menuitem"
            disabled={!g.hasTour}
            onClick={() => {
              setOpen(false);
              startTour();
            }}
            className={cn(item, "disabled:cursor-not-allowed disabled:opacity-50")}
          >
            <Compass className="size-4 text-muted" aria-hidden /> {g.hasTour ? "Ver el tour de esta pantalla" : "Esta pantalla no tiene tour"}
          </button>
          <Link href="/primeros-pasos" role="menuitem" className={item}>
            <ListChecks className="size-4 text-muted" aria-hidden /> Primeros pasos
          </Link>
          {article !== "/ayuda" && (
            <Link href={article} role="menuitem" className={item}>
              <FileQuestion className="size-4 text-muted" aria-hidden /> Ayuda sobre esta pantalla
            </Link>
          )}
          <Link href="/ayuda" role="menuitem" className={item}>
            <BookOpen className="size-4 text-muted" aria-hidden /> Centro de ayuda
          </Link>
          {g.ready && (
            <>
              <div className="my-1 border-t border-line" />
              <button type="button" role="menuitemcheckbox" aria-checked={!g.disabled} onClick={() => void toggleGuide()} className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2.5 text-left hover:bg-canvas">
                <span>
                  <span className="block font-medium">Guía {g.disabled ? "apagada" : "prendida"}</span>
                  <span className="block text-caption text-muted">{g.disabled ? "No aparece nada solo." : "Un recorrido corto la primera vez que entrás a cada pantalla."}</span>
                </span>
                <span aria-hidden className={cn("relative h-5 w-9 shrink-0 rounded-full transition-colors", g.disabled ? "bg-line" : "bg-navy")}>
                  <span className={cn("absolute top-0.5 size-4 rounded-full bg-surface shadow motion-safe:transition-[left]", g.disabled ? "left-0.5" : "left-[18px]")} />
                </span>
              </button>
            </>
          )}
      </Popover>
    </div>
  );
}
