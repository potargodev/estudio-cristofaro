"use client";

import { CircleHelp, Compass, ListChecks } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { markTourSeenAction, setGuideDisabledAction } from "@/app/actions/onboarding";
import { tourFor, type Tour } from "@/modules/onboarding/catalog";
import { helpFor } from "@/lib/help-map";
import { cn } from "@/lib/utils";

// Onboarding guiado: el botón "Guía" (siempre visible arriba) abre un menú con
// el interruptor de la guía, el tour de la pantalla y los primeros pasos.
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

/** Botón «Guía»: menú con el interruptor, el tour de esta pantalla y los primeros pasos */
export function GuideButton({ className, compact }: { className?: string; compact?: boolean }) {
  const g = useGuide();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  const toggle = async () => {
    const disabled = !g.disabled;
    setState({ disabled });
    await setGuideDisabledAction(disabled, window.location.pathname);
  };
  return (
    <div ref={box} className="relative">
      <button type="button" data-tour="guia" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu" className={cn("inline-flex h-9 items-center gap-1.5 px-2.5 text-[13px]", className)} aria-label="Guía: recorridos y primeros pasos">
        <Compass className="size-4" aria-hidden />
        <span className={cn(compact ? "sr-only" : "hidden sm:inline")}>Guía</span>
      </button>
      {open && (
        <div role="menu" aria-label="Guía" className="app-ui absolute right-0 top-full z-50 mt-2 w-72 rounded-md border border-line bg-surface p-1.5 text-[14px] text-ink shadow-[0_16px_40px_-16px_rgba(0,0,0,0.35)]">
          <button type="button" role="menuitemcheckbox" aria-checked={!g.disabled} onClick={toggle} className="flex w-full items-center justify-between gap-3 rounded-[4px] px-3 py-2.5 text-left hover:bg-canvas">
            <span>
              <span className="block font-medium">Guía {g.disabled ? "apagada" : "prendida"}</span>
              <span className="block text-[12px] text-muted">{g.disabled ? "No aparece nada solo." : "Un recorrido corto la primera vez que entrás a cada pantalla."}</span>
            </span>
            <span aria-hidden className={cn("relative h-5 w-9 shrink-0 rounded-full transition-colors", g.disabled ? "bg-line" : "bg-navy")}>
              <span className={cn("absolute top-0.5 size-4 rounded-full bg-surface shadow transition-[left]", g.disabled ? "left-0.5" : "left-[18px]")} />
            </span>
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!g.hasTour}
            onClick={() => {
              setOpen(false);
              window.dispatchEvent(new Event(START_TOUR));
            }}
            className="flex w-full items-center gap-2.5 rounded-[4px] px-3 py-2.5 text-left hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Compass className="size-4 text-muted" aria-hidden /> {g.hasTour ? "Ver el tour de esta pantalla" : "Esta pantalla no tiene tour"}
          </button>
          <Link href="/primeros-pasos" role="menuitem" onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-[4px] px-3 py-2.5 hover:bg-canvas">
            <ListChecks className="size-4 text-muted" aria-hidden /> Primeros pasos
          </Link>
          <Link href="/ayuda" role="menuitem" onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-[4px] px-3 py-2.5 hover:bg-canvas">
            <CircleHelp className="size-4 text-muted" aria-hidden /> Centro de ayuda
          </Link>
        </div>
      )}
    </div>
  );
}

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
      <div ref={card} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="tour-titulo" aria-describedby="tour-texto" className="app-ui fixed rounded-lg border border-line bg-surface p-5 text-ink shadow-xl outline-none motion-safe:transition-[top,left] motion-safe:duration-200" style={style}>
        <p className="text-[12px] text-muted">
          Paso {i + 1} de {tour.steps.length}
        </p>
        <h2 id="tour-titulo" className="mt-1 text-[17px] font-semibold">
          {step.title}
        </h2>
        <p id="tour-texto" className="mt-1 text-[14px] text-muted">
          {step.text}
        </p>
        <div className="mt-4 flex items-center justify-between gap-2">
          <button type="button" onClick={onEnd} className="text-[13px] text-muted underline-offset-4 hover:underline">
            Saltear
          </button>
          <div className="flex gap-2">
            {i > 0 && (
              <button type="button" onClick={() => setI(i - 1)} className="h-9 rounded-md border border-line px-3 text-[14px] hover:border-muted">
                Atrás
              </button>
            )}
            <button type="button" onClick={() => (last ? onEnd() : setI(i + 1))} className="h-9 rounded-md bg-navy px-4 text-[14px] font-medium text-paper hover:bg-night">
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
    <Link href={helpFor(pathname)} data-tour="ayuda" className={cn("inline-flex h-9 items-center gap-1.5 px-2.5 text-[13px]", className)} aria-label="Ayuda sobre esta pantalla" title="Ayuda sobre esta pantalla">
      <CircleHelp className="size-4" aria-hidden />
      <span className={cn(compact ? "sr-only" : "hidden lg:inline")}>Ayuda</span>
    </Link>
  );
}
