"use client";

import { Pause, Play } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";
import type { HeroSlide } from "@/lib/hero";
import { cn } from "@/lib/utils";

/** prefers-reduced-motion en vivo (sin depender de motion) */
function useReducedMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduce(mq.matches);
    const on = () => setReduce(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduce;
}

/**
 * Hero a sangre completa con fotos en crossfade cada `interval` segundos, Ken
 * Burns sutil y velo azul noche desde la izquierda (contraste AA del texto
 * verificado con un píxel blanco debajo: el velo nunca baja de 0,78 donde hay
 * texto). El texto y los botones (children) quedan fijos. Se pausa con el
 * mouse encima, con el foco adentro o con el botón; con prefers-reduced-motion
 * queda la primera foto fija. En el celular la foto se recorta a 4:5.
 */
export function HeroSlider({ slides, interval, children }: { slides: HeroSlide[]; interval: number; children: React.ReactNode }) {
  const reduce = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [stopped, setStopped] = useState(false);
  // Las fotos 2 a 5 se cargan después de la primera (que es la del LCP)
  const [rest, setRest] = useState(false);
  const paused = hovered || focused || stopped;
  const moving = !reduce && slides.length > 1;

  useEffect(() => {
    const t = window.setTimeout(() => setRest(true), 1800);
    return () => window.clearTimeout(t);
  }, []);
  useEffect(() => {
    if (!moving || paused) return;
    const t = window.setTimeout(() => setIndex((i) => (i + 1) % slides.length), interval * 1000);
    return () => window.clearTimeout(t);
  }, [moving, paused, index, interval, slides.length]);

  return (
    <section
      aria-label="Presentación"
      className={cn("grain relative isolate overflow-hidden bg-navy-deep text-paper", paused && "hero-paused")}
      style={{ "--hero-interval": `${interval}s`, "--kb-duration": `${interval + 1.4}s` } as React.CSSProperties}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
      }}
    >
      {/* Fotos: 4:5 arriba en el celular, a sangre completa desde md */}
      <div aria-hidden className="absolute inset-x-0 top-0 -z-10 aspect-[4/5] overflow-hidden md:inset-0 md:aspect-auto">
        {slides.map((s, i) =>
          i === 0 || rest ? (
            <div
              key={s.src}
              className={cn(
                "absolute inset-0 transition-opacity duration-[1400ms] ease-out",
                i === (reduce ? 0 : index) ? "opacity-100" : "opacity-0",
              )}
            >
              <Image
                src={s.src}
                alt={s.alt}
                fill
                priority={i === 0}
                fetchPriority={i === 0 ? "high" : "low"}
                loading={i === 0 ? undefined : "lazy"}
                sizes="100vw"
                quality={70}
                className={cn("object-cover object-[var(--pos-m)] md:object-[var(--pos)]", moving && i === index && "ken-burns")}
                style={{ "--pos": s.position, "--pos-m": s.mobilePosition } as React.CSSProperties}
              />
            </div>
          ) : null,
        )}
        {/* Velo: de abajo en el celular (el texto va debajo de la foto), desde la izquierda en escritorio */}
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgb(20_24_38/0.2)_0%,rgb(20_24_38/0.45)_35%,rgb(20_24_38/0.82)_48%,rgb(20_24_38/0.92)_62%,rgb(20_24_38)_100%)] md:bg-[linear-gradient(90deg,rgb(20_24_38/0.94)_0%,rgb(20_24_38/0.86)_55%,rgb(20_24_38/0.45)_74%,rgb(20_24_38/0.15)_100%)]" />
      </div>

      {children}

      {moving && (
        <div className="relative mx-auto flex max-w-6xl items-center gap-3 px-4 pb-6 sm:px-6 md:absolute md:inset-x-0 md:bottom-6 md:pb-0">
          <ol className="flex gap-2" aria-label="Fotos">
            {slides.map((s, i) => (
              <li key={s.src}>
                <button
                  type="button"
                  onClick={() => setIndex(i)}
                  aria-label={`Mostrar foto ${i + 1} de ${slides.length}`}
                  aria-current={i === index ? "true" : undefined}
                  className="group grid h-6 w-9 place-items-center"
                >
                  <span className="relative block h-0.5 w-full overflow-hidden rounded-full bg-paper/30 group-hover:bg-paper/50">
                    {i === index && <span key={index} className="hero-progress absolute inset-0 rounded-full bg-rose-light" />}
                    {i < index && <span className="absolute inset-0 rounded-full bg-paper/70" />}
                  </span>
                </button>
              </li>
            ))}
          </ol>
          <button
            type="button"
            onClick={() => setStopped((v) => !v)}
            aria-label={stopped ? "Reanudar las fotos" : "Pausar las fotos"}
            className="grid size-8 place-items-center rounded-full border border-paper/30 text-paper/80 transition-colors hover:border-paper/60 hover:text-paper"
          >
            {stopped ? <Play className="size-3.5" aria-hidden /> : <Pause className="size-3.5" aria-hidden />}
          </button>
        </div>
      )}
    </section>
  );
}
