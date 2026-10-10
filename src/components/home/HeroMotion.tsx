"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { HERO_SLIDE_EVENT, type HeroSlide } from "@/lib/hero";
import { reducedMotion } from "@/lib/motion/gsap";
import { cn } from "@/lib/utils";

/** Duración del fundido entre fotos (ms) */
const FADE_MS = 1100;

/**
 * Fondo del hero: foto a sangre completa (a opacidad plena) con velos azul
 * noche por encima para que el texto siempre se lea. Fundido real: la foto
 * nueva pasa de 0 a 1 en 1,1 s mientras la anterior queda a opacidad plena
 * debajo hasta que termina; nunca hay dos capas a medias ni fondo vacío. La
 * siguiente foto se precarga. Zoom lento y parallax leve, apagados con
 * prefers-reduced-motion.
 */
export function HeroMotion({ slides, children }: { slides: HeroSlide[]; children: React.ReactNode }) {
  const [index, setIndex] = useState(0);
  const [prev, setPrev] = useState<number | null>(null);
  const [reduce, setReduce] = useState(false);
  const [paused, setPaused] = useState(false);
  const media = useRef<HTMLDivElement>(null);
  const fadeTimer = useRef<number | undefined>(undefined);

  useEffect(() => setReduce(reducedMotion()), []);

  // El titular (HeroStatements) marca el ritmo: cada frase trae su foto
  useEffect(() => {
    const onSlide = (e: Event) => {
      const detail = (e as CustomEvent<number | { paused: boolean }>).detail;
      if (typeof detail === "object") return setPaused(detail.paused);
      const next = detail % slides.length;
      setIndex((cur) => {
        if (cur === next) return cur;
        setPrev(cur);
        window.clearTimeout(fadeTimer.current);
        // La anterior se va recién cuando la nueva terminó de aparecer
        fadeTimer.current = window.setTimeout(() => setPrev(null), FADE_MS + 50);
        return next;
      });
    };
    window.addEventListener(HERO_SLIDE_EVENT, onSlide);
    return () => {
      window.removeEventListener(HERO_SLIDE_EVENT, onSlide);
      window.clearTimeout(fadeTimer.current);
    };
  }, [slides.length]);

  // Parallax leve: la foto baja a menor velocidad que el scroll
  useEffect(() => {
    if (reduce) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const y = Math.min(window.scrollY, window.innerHeight);
        if (media.current) media.current.style.transform = `translate3d(0, ${(y * 0.18).toFixed(1)}px, 0)`;
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [reduce]);

  const next = (index + 1) % slides.length;
  return (
    <div className={cn(paused && "hero-paused")}>
      <div aria-hidden className="absolute inset-0 -z-10 overflow-hidden bg-night">
        {/* Celular: la foto completa (16:9) arriba, fundida en el azul; escritorio: a sangre completa */}
        <div ref={media} className="absolute inset-x-0 top-16 aspect-[16/9] will-change-transform md:inset-0 md:top-0 md:aspect-auto">
          {slides.map((s, i) => {
            const isActive = i === index;
            const isPrev = i === prev;
            const isNext = i === next && !isActive;
            // Solo se montan la actual, la que se va y la siguiente (precargada, invisible)
            if (!isActive && !isPrev && !isNext) return null;
            return (
              <div
                key={s.src}
                className={cn("absolute inset-0 overflow-hidden", isActive ? "z-[2]" : isPrev ? "z-[1]" : "z-0 opacity-0")}
                style={isActive && prev !== null && !reduce ? { animation: `hero-fade ${FADE_MS}ms ease-in-out both` } : undefined}
              >
                <div className={cn("absolute inset-0", !reduce && (isActive || isPrev) && "hero-zoom")}>
                  <Image
                    src={s.src}
                    alt={s.alt}
                    fill
                    priority={i === 0}
                    loading={i === 0 ? undefined : "eager"}
                    fetchPriority={i === 0 ? "high" : "low"}
                    sizes="100vw"
                    quality={70}
                    className="object-cover md:object-[var(--pos)]"
                    style={{ "--pos": s.position, "--pos-m": s.mobilePosition } as React.CSSProperties}
                  />
                </div>
              </div>
            );
          })}
          {/* Celular: la foto se funde arriba y abajo en el azul */}
          <div className="absolute inset-[-1px] z-[3] bg-[linear-gradient(180deg,#0f1320_0%,rgb(15_19_32/0.35)_18%,rgb(15_19_32/0.5)_55%,#0f1320_100%)] md:hidden" />
        </div>
        <div className="absolute inset-x-0 top-0 z-[3] h-16 bg-night md:hidden" />
        {/* Escritorio: azul noche al 80 % detrás del texto que baja al 33 % a la derecha, más un degradé suave abajo */}
        <div className="absolute inset-0 z-[3] hidden bg-[linear-gradient(90deg,rgb(15_19_32/0.8)_0%,rgb(15_19_32/0.8)_38%,rgb(15_19_32/0.33)_100%)] md:block" />
        <div className="absolute inset-0 z-[3] hidden bg-[linear-gradient(180deg,rgb(15_19_32/0.35)_0%,transparent_22%,transparent_55%,rgb(15_19_32/0.92)_100%)] md:block" />
      </div>
      {children}
    </div>
  );
}
