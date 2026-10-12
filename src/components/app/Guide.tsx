"use client";

import { CircleHelp } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { markTourSeenAction, setGuideDisabledAction } from "@/app/actions/onboarding";
import { tourFor, type Tour } from "@/modules/onboarding/catalog";
import { helpFor } from "@/lib/help-map";
import { cn } from "@/lib/utils";

// Onboarding guiado: el "?" de la barra superior (HelpMenu) tiene el
// interruptor de la guía, el tour de la pantalla y los primeros pasos.
// GuideHost va una sola vez por layout y muestra los tours (salteables, con
// teclado y sin animaciones si la persona pidió menos movimiento). El progreso
// y la preferencia viven en la base.

// Estado compartido entre el botón «Guía» (en la barra) y GuideHost (uno por layout)
type GuideState = { ready: boolean; disabled: boolean; hasTour: boolean };
let state: GuideState = { ready: false, disabled: false, hasTour: false };
const listeners = new Set<() => void>();
const setState = (patch: Partial<GuideState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const useGuide = () => useSyncExternalStore(subscribe, () => state, () => state);
const START_TOUR = "faro:tour";

/** Estado de la guía para el menú "?" de la barra superior */
export const useGuideState = useGuide;

/** Prende o apaga la guía (queda guardado en la base) */
export async function toggleGuide() {
  const disabled = !state.disabled;
  setState({ disabled });
  await setGuideDisabledAction(disabled, window.location.pathname);
}

/** Muestra el tour de la pantalla actual */
export const startTour = () => window.dispatchEvent(new Event(START_TOUR));

/**
 * Tours: cada uno se muestra una sola vez por pantalla y por usuario (se marca
 * visto apenas aparece, y queda guardado en la base). Con la guía apagada no
 * aparece nada automático; el tour siempre se puede ver desde el menú «Guía».
 */
export function GuideHost({ boot }: { boot: { toursSeen: string[]; disabled: boolean } | null }) {
  const pathname = usePathname();
  const seen = useRef<string[]>(boot?.toursSeen ?? []);
  const g = useGuide();
  const [tour, setTour] = useState<Tour | null>(null);

  useEffect(() => {
    if (boot) setState({ ready: true, disabled: boot.disabled });
  }, [boot]);
  useEffect(() => setState({ hasTour: !!boot && !!tourFor(pathname) }), [boot, pathname]);

  const show = useCallback((t: Tour) => {
    setTour(t);
    if (!seen.current.includes(t.id)) {
      seen.current = [...seen.current, t.id];
      void markTourSeenAction(t.id, window.location.pathname);
    }
  }, []);

  // Tour automático la primera vez que se entra a una pantalla que lo tiene
  useEffect(() => {
    if (!boot || g.disabled || !g.ready) return;
    const t = tourFor(pathname);
    if (!t || seen.current.includes(t.id)) return;
    const id = setTimeout(() => show(t), 700);
    return () => clearTimeout(id);
  }, [pathname, g.disabled, g.ready, boot, show]);

  // «Ver el tour de esta pantalla» (desde el menú)
  useEffect(() => {
    const h = () => {
      const t = tourFor(window.location.pathname);
      if (t) show(t);
    };
    window.addEventListener(START_TOUR, h);
    return () => window.removeEventListener(START_TOUR, h);
  }, [show]);

  if (!boot) return null;
  return tour ? <TourOverlay key={tour.id} tour={tour} onEnd={() => setTour(null)} /> : null;
}

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

function TourOverlay({ tour, onEnd }: { tour: Tour; onEnd: () => void }) {
  const [i, setI] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const step = tour.steps[i];
  const last = i === tour.steps.length - 1;

  useLayoutEffect(() => {
    const measure = () => {
      const el = step.target ? (Array.from(document.querySelectorAll(step.target)) as HTMLElement[]).find((e) => e.getClientRects().length && e.offsetWidth > 0) : null;
      if (!el) return setBox(null);
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
      const r = el.getBoundingClientRect();
      setBox({ top: r.top - 6, left: r.left - 6, width: r.width + 12, height: r.height + 12 });
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step]);

  useEffect(() => {
    card.current?.focus();
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") onEnd();
      if (e.key === "ArrowRight") setI((x) => Math.min(x + 1, tour.steps.length - 1));
      if (e.key === "ArrowLeft") setI((x) => Math.max(x - 1, 0));
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [i, onEnd, tour.steps.length]);

  // La tarjeta va debajo del elemento si entra; si no, arriba; sin elemento, centrada
  const vw = typeof window === "undefined" ? 1024 : window.innerWidth;
  const vh = typeof window === "undefined" ? 768 : window.innerHeight;
  const W = Math.min(340, vw - 32);
  let style: React.CSSProperties = { width: W, left: (vw - W) / 2, top: Math.max(16, vh / 2 - 110) };
  if (box) {
    const left = Math.min(Math.max(16, box.left), vw - W - 16);
    style = box.top + box.height + 220 < vh ? { width: W, left, top: box.top + box.height + 10 } : { width: W, left, top: Math.max(16, box.top - 220) };
  }
  return (
    <div className="fixed inset-0 z-[70]" role="presentation">
      {box ? (
        <div aria-hidden className="pointer-events-none fixed rounded-md shadow-[0_0_0_9999px_rgba(17,21,33,0.55)] ring-2 ring-gold motion-safe:transition-all motion-safe:duration-200" style={box} />
      ) : (
        <div aria-hidden className="fixed inset-0 bg-night/55" />
      )}
      <div ref={card} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="tour-titulo" aria-describedby="tour-texto" className="app-ui fixed rounded-md border border-line bg-surface p-5 text-ink shadow-overlay outline-none motion-safe:transition-[top,left] motion-safe:duration-200" style={style}>
        <p className="text-caption text-muted">
          Paso {i + 1} de {tour.steps.length}
        </p>
        <h2 id="tour-titulo" className="mt-1 text-title font-semibold">
          {step.title}
        </h2>
        <p id="tour-texto" className="mt-1 text-ui text-muted">
          {step.text}
        </p>
        <div className="mt-4 flex items-center justify-between gap-2">
          <button type="button" onClick={onEnd} className="text-meta text-muted underline-offset-4 hover:underline">
            Saltear
          </button>
          <div className="flex gap-2">
            {i > 0 && (
              <button type="button" onClick={() => setI(i - 1)} className="h-(--control-h) rounded-md border border-line px-3 text-ui hover:border-muted">
                Atrás
              </button>
            )}
            <button type="button" onClick={() => (last ? onEnd() : setI(i + 1))} className="h-(--control-h) rounded-md bg-navy px-4 text-ui font-medium text-paper hover:bg-night">
              {last ? "Listo" : "Siguiente"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Botón "?" de la pantalla: abre el artículo de ayuda que corresponde */
export function HelpLink({ className, compact }: { className?: string; compact?: boolean }) {
  const pathname = usePathname();
  return (
    <Link href={helpFor(pathname)} data-tour="ayuda" className={cn("inline-flex h-(--control-h) items-center gap-1.5 px-2.5 text-meta", className)} aria-label="Ayuda sobre esta pantalla" title="Ayuda sobre esta pantalla">
      <CircleHelp className="size-4" aria-hidden />
      <span className={cn(compact ? "sr-only" : "hidden lg:inline")}>Ayuda</span>
    </Link>
  );
}
