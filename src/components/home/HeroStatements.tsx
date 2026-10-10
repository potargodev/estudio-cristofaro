"use client";

import { useEffect, useRef, useState } from "react";
import { loadGsap, padMasks, reducedMotion } from "@/lib/motion/gsap";
import { cn } from "@/lib/utils";

/**
 * Titular rotativo del hero: cada `interval` s la frase sale hacia arriba línea
 * por línea con máscara y entra la siguiente. El h1 (para lectores de pantalla
 * y buscadores) es siempre la primera frase; las frases visibles van ocultas
 * para lectores. Se puede pausar (y se pausa sola con reduced-motion).
 */
export function HeroStatements({ statements, interval }: { statements: string[]; interval: number }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduce, setReduce] = useState(false);
  const busy = useRef(false);
  const stack = useRef<HTMLDivElement>(null);

  useEffect(() => setReduce(reducedMotion()), []);

  useEffect(() => {
    if (reduce || paused || statements.length < 2) return;
    // Durante la intro (primera visita) la primera frase espera a que termine
    const t = window.setTimeout(() => go((index + 1) % statements.length), interval * 1000);
    return () => window.clearTimeout(t);
  }, [index, paused, reduce, interval, statements.length]); // eslint-disable-line react-hooks/exhaustive-deps

  function go(next: number) {
    const root = stack.current;
    if (!root || busy.current) return;
    const out = root.children[index] as HTMLElement;
    const inc = root.children[next] as HTMLElement;
    busy.current = true;
    loadGsap().then(({ gsap, SplitText }) => {
      const a = SplitText.create(out, { type: "lines", mask: "lines" });
      padMasks(a.masks);
      const b = SplitText.create(inc, { type: "lines", mask: "lines" });
      padMasks(b.masks);
      gsap.set(inc, { visibility: "visible" });
      gsap
        .timeline({
          onComplete: () => {
            a.revert();
            b.revert();
            gsap.set(out, { visibility: "hidden" });
            busy.current = false;
            setIndex(next);
          },
        })
        .to(a.lines, { yPercent: -110, duration: 0.8, stagger: 0.06, ease: "expo.in" })
        .from(b.lines, { yPercent: 110, duration: 1.2, stagger: 0.08, ease: "expo.out" }, 0.55);
    });
  }

  return (
    <div className="relative mt-5">
      <h1 className="sr-only">{statements[0]}</h1>
      <div ref={stack} aria-hidden className="display grid max-w-[13ch] text-paper">
        {statements.map((s, i) => (
          <p key={s} data-intro-heading={i === 0 ? "" : undefined} className="[grid-area:1/1]" style={i === index ? undefined : { visibility: "hidden" }}>
            {s}
          </p>
        ))}
      </div>
      {!reduce && statements.length > 1 && (
        <div data-intro="fade" className="mt-8 flex items-center gap-4">
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
          <ol className="flex items-center gap-2" aria-hidden>
            {statements.map((s, i) => (
              <li key={s} className="relative h-px w-8 overflow-hidden bg-hair-strong sm:w-12">
                {i === index && (
                  <span
                    key={`${index}-${paused}`}
                    className={cn("absolute inset-0 origin-left bg-rose-light", paused && "scale-x-100")}
                    style={paused ? undefined : { animation: `hero-progress ${interval}s linear both` }}
                  />
                )}
                {i < index && <span className="absolute inset-0 bg-paper/40" />}
              </li>
            ))}
          </ol>
          <span className="tabular text-[12px] text-paper/50">
            0{index + 1} / 0{statements.length}
          </span>
        </div>
      )}
    </div>
  );
}
