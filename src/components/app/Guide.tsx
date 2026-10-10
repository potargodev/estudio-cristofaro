"use client";

import { Check, CircleHelp, Compass, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { loadGuideAction, markTourSeenAction, setGuideDisabledAction } from "@/app/actions/onboarding";
import { tourFor, type GuideView, type Tour } from "@/modules/onboarding/catalog";
import { helpFor } from "@/lib/help-map";
import { cn } from "@/lib/utils";

// Onboarding guiado: el botón "Guía" (siempre visible arriba) abre el panel con
// los primeros pasos y el recorrido de la pantalla. GuideHost va una sola vez
// por layout: muestra el panel y los tours (salteables, con teclado y sin
// animaciones si la persona pidió menos movimiento). El progreso vive en la base.

const OPEN = "faro:guia";

export function GuideButton({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <button type="button" data-tour="guia" onClick={() => window.dispatchEvent(new Event(OPEN))} className={cn("inline-flex h-9 items-center gap-1.5 px-2.5 text-[13px]", className)} aria-label="Guía: primeros pasos y recorrido">
      <Compass className="size-4" aria-hidden />
      <span className={cn(compact ? "sr-only" : "hidden sm:inline")}>Guía</span>
    </button>
  );
}

export function GuideHost({ boot }: { boot: { toursSeen: string[]; disabled: boolean } | null }) {
  const pathname = usePathname();
  const [seen, setSeen] = useState<string[]>(boot?.toursSeen ?? []);
  const [disabled, setDisabled] = useState(boot?.disabled ?? false);
  const [tour, setTour] = useState<Tour | null>(null);
  const [panel, setPanel] = useState(false);
  const [guide, setGuide] = useState<GuideView | null>(null);

  // Tour automático la primera vez que se entra a una pantalla que lo tiene
  useEffect(() => {
    if (!boot || disabled) return;
    const t = tourFor(pathname);
    if (!t || seen.includes(t.id)) return;
    const id = setTimeout(() => setTour(t), 700);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, disabled]);

  const openPanel = useCallback(async () => {
    setPanel(true);
    setGuide(await loadGuideAction(window.location.pathname));
  }, []);
  useEffect(() => {
    const h = () => void openPanel();
    window.addEventListener(OPEN, h);
    return () => window.removeEventListener(OPEN, h);
  }, [openPanel]);

  const finishTour = useCallback(
    (t: Tour) => {
      setTour(null);
      if (!seen.includes(t.id)) {
        setSeen((s) => [...s, t.id]);
        void markTourSeenAction(t.id, window.location.pathname);
      }
    },
    [seen],
  );

  const toggleGuide = async () => {
    const next = !disabled;
    setDisabled(next);
    setGuide((g) => (g ? { ...g, disabled: next } : g));
    await setGuideDisabledAction(next, window.location.pathname);
  };

  if (!boot) return null;
  const screenTour = tourFor(pathname);
  const steps = guide?.steps ?? [];
  const done = steps.filter((s) => s.done).length;
  return (
    <>
      {panel && (
        <div className="fixed inset-0 z-[60]">
          <button type="button" aria-label="Cerrar la guía" className="absolute inset-0 bg-night/50" onClick={() => setPanel(false)} />
          <aside role="dialog" aria-modal="true" aria-labelledby="guia-titulo" className="app-ui absolute inset-y-0 right-0 flex w-[380px] max-w-[92vw] flex-col border-l border-line bg-surface text-ink shadow-xl motion-safe:animate-[guia-in_.2s_ease-out]">
            <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-rose-deep">{guide?.profileLabel ?? "Guía"}</p>
                <h2 id="guia-titulo" className="mt-1 font-display text-[26px] leading-tight">
                  Primeros pasos
                </h2>
              </div>
              <button type="button" onClick={() => setPanel(false)} aria-label="Cerrar" className="grid size-9 place-items-center rounded-md hover:bg-canvas" autoFocus>
                <X className="size-5" aria-hidden />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {!guide ? (
                <p className="text-[14px] text-muted">Cargando…</p>
              ) : (
                <>
                  <p className="text-[14px] text-muted">
                    {done === steps.length ? "¡Listo! Hiciste todos los pasos." : `${done} de ${steps.length} hechos. Se marcan solos cuando hacés cada cosa.`}
                  </p>
                  <div className="mt-3 h-1.5 rounded bg-navy-soft" aria-hidden>
                    <div className="h-full rounded bg-navy motion-safe:transition-[width]" style={{ width: `${steps.length ? (done / steps.length) * 100 : 0}%` }} />
                  </div>
                  <ol className="mt-5 grid gap-2">
                    {steps.map((s) => (
                      <li key={s.key}>
                        <Link href={s.href} onClick={() => setPanel(false)} className={cn("flex gap-3 rounded-md border p-3 transition-colors", s.done ? "border-line bg-canvas" : "border-line hover:border-muted")}>
                          <span className={cn("mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border", s.done ? "border-navy bg-navy text-gold" : "border-line")}>{s.done && <Check className="size-3.5" aria-hidden />}</span>
                          <span className="min-w-0">
                            <span className={cn("block text-[14px] font-medium", s.done && "text-muted line-through decoration-1")}>{s.title}</span>
                            <span className="block text-[13px] text-muted">{s.text}</span>
                            <span className="sr-only">{s.done ? "Hecho" : "Pendiente"}</span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ol>
                </>
              )}
            </div>
            <div className="grid gap-2 border-t border-line px-5 py-4 text-[14px]">
              {screenTour && (
                <button
                  type="button"
                  onClick={() => {
                    setPanel(false);
                    setTour(screenTour);
                  }}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-navy px-4 font-medium text-paper hover:bg-night"
                >
                  <Compass className="size-4" aria-hidden /> Recorrer esta pantalla
                </button>
              )}
              <Link href="/ayuda" onClick={() => setPanel(false)} className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line px-4 hover:border-muted">
                <CircleHelp className="size-4" aria-hidden /> Centro de ayuda
              </Link>
              <label className="mt-1 flex items-center justify-between gap-3 text-[13px] text-muted">
                Mostrar recorridos automáticos
                <input type="checkbox" checked={!disabled} onChange={toggleGuide} className="size-4 accent-navy" />
              </label>
            </div>
          </aside>
        </div>
      )}
      {tour && <TourOverlay key={tour.id} tour={tour} onEnd={() => finishTour(tour)} />}
    </>
  );
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
