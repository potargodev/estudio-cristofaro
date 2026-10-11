"use client";

import { useEffect, useRef, useState } from "react";
import { reducedMotion } from "@/lib/motion/gsap";
import { cn } from "@/lib/utils";
import { HERO_SLIDE_EVENT } from "@/lib/hero";

/**
 * Titular rotativo del hero: cada `interval` s la frase se funde (su propio
 * fundido, aparte del de la foto) y entra la siguiente. Todas comparten la
 * misma celda de la grilla, así el bloque tiene la altura de la más larga y
 * no salta el layout. El h1 (para lectores de pantalla
 * y buscadores) es siempre la primera frase; las frases visibles van ocultas
 * para lectores. Se puede pausar (y se pausa sola con reduced-motion).
 */
/** Sin palabra huérfana: la última palabra viaja con la anterior */
const noOrphan = (t: string) => t.replace(/\s+(\S+)$/, "\u00a0$1");

export function HeroStatements({ statements, interval }: { statements: string[]; interval: number }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hover, setHover] = useState(false);
  const [reduce, setReduce] = useState(false);
  const busy = useRef(false);
  const stack = useRef<HTMLDivElement>(null);
  // Tiempo ya visto de la frase actual: al pausar (botón o hover) y reanudar, sigue desde ahí
  const elapsed = useRef(0);
  const shownIndex = useRef(0);
  const stopped = paused || hover;

  useEffect(() => setReduce(reducedMotion()), []);

  // Pausa al pasar el mouse por el hero (no en pantallas táctiles)
  useEffect(() => {
    const section = stack.current?.closest("section");
    if (!section || !window.matchMedia("(hover: hover)").matches) return;
    const on = () => setHover(true);
    const off = () => setHover(false);
    section.addEventListener("mouseenter", on);
    section.addEventListener("mouseleave", off);
    return () => {
      section.removeEventListener("mouseenter", on);
      section.removeEventListener("mouseleave", off);
    };
  }, []);

  // El fondo (zoom de la foto) se pausa junto con las frases
  useEffect(() => {
    window.dispatchEvent(new CustomEvent(HERO_SLIDE_EVENT, { detail: { paused: stopped } }));
  }, [stopped]);

  useEffect(() => {
    // Frase nueva: el tiempo arranca de cero
    if (shownIndex.current !== index) {
      shownIndex.current = index;
      elapsed.current = 0;
    }
    if (reduce || stopped || statements.length < 2) return;
    const start = performance.now();
    const t = window.setTimeout(() => go((index + 1) % statements.length), Math.max(0, interval * 1000 - elapsed.current));
    return () => {
      window.clearTimeout(t);
      elapsed.current += performance.now() - start;
    };
  }, [index, stopped, reduce, interval, statements.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const [prev, setPrev] = useState<number | null>(null);
  function go(next: number) {
    if (busy.current || next === index) return;
    busy.current = true;
    // La foto del fondo cambia junto con la frase (cada una con su propio fundido)
    window.dispatchEvent(new CustomEvent(HERO_SLIDE_EVENT, { detail: next }));
    setPrev(index);
    setIndex(next);
    window.setTimeout(() => {
      busy.current = false;
      setPrev(null);
    }, 700);
  }

  return (
    <div className="relative mt-6">
      <h1 className="sr-only">{statements[0]}</h1>
      <div ref={stack} aria-hidden className="hero-statement grid text-paper">
        {statements.map((s, i) => (
          <p
            key={s}
            {...(i === 0 ? { "data-intro": "fade" } : {})}
            className={cn(
              "[grid-area:1/1] transition-[opacity,transform] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
              i === index ? "translate-y-0 opacity-100" : i === prev ? "-translate-y-3 opacity-0" : "translate-y-3 opacity-0",
            )}
            style={i === index || i === prev ? undefined : { visibility: "hidden" }}
          >
            {noOrphan(s)}
          </p>
        ))}
      </div>
      {!reduce && statements.length > 1 && (
        <div data-intro="fade" className="mt-8 flex items-center gap-2.5 sm:gap-4">
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            aria-label={paused ? "Reanudar las frases" : "Pausar las frases"}
            className="grid size-8 place-items-center border border-hair-strong text-paper/80 transition-colors hover:border-paper/60 hover:text-paper"
          >
            {paused ? (
              <svg viewBox="0 0 12 12" className="size-3" aria-hidden>
                <path d="M3 1.5v9l7-4.5z" fill="currentColor" />
              </svg>
            ) : (
              <svg viewBox="0 0 12 12" className="size-3" aria-hidden>
                <path d="M3 1.5h2v9H3zM7 1.5h2v9H7z" fill="currentColor" />
              </svg>
            )}
          </button>
          <button
            type="button"
            onClick={() => go((index - 1 + statements.length) % statements.length)}
            aria-label="Frase anterior"
            className="grid size-8 place-items-center border border-hair-strong text-paper/80 transition-colors hover:border-paper/60 hover:text-paper"
          >
            <svg viewBox="0 0 12 12" className="size-3" aria-hidden>
              <path d="M7.5 2 3.5 6l4 4" fill="none" stroke="currentColor" strokeWidth="1.4" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => go((index + 1) % statements.length)}
            aria-label="Frase siguiente"
            className="grid size-8 place-items-center border border-hair-strong text-paper/80 transition-colors hover:border-paper/60 hover:text-paper"
          >
            <svg viewBox="0 0 12 12" className="size-3" aria-hidden>
              <path d="m4.5 2 4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.4" />
            </svg>
          </button>
          <ol className="flex min-w-0 items-center gap-1.5 sm:gap-2" aria-hidden>
            {statements.map((s, i) => (
              <li key={s} className="relative h-px w-4 overflow-hidden bg-hair-strong sm:w-12">
                {i === index && (
                  <span
                    key={index}
                    className="absolute inset-0 origin-left bg-rose-light"
                    style={{ animation: `hero-progress ${interval}s linear both`, animationPlayState: stopped ? "paused" : "running" }}
                  />
                )}
                {i < index && <span className="absolute inset-0 bg-paper/40" />}
              </li>
            ))}
          </ol>
          <span className="tabular text-caption text-paper/55">
            0{index + 1} / 0{statements.length}
          </span>
        </div>
      )}
    </div>
  );
}
