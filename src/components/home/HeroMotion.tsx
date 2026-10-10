"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { HERO_SLIDE_EVENT, type HeroSlide } from "@/lib/hero";
import { reducedMotion } from "@/lib/motion/gsap";
import { cn } from "@/lib/utils";

/**
 * Fondo del hero: foto a sangre completa atenuada con un velo azul noche y
 * parallax leve. Cada frase del titular trae su foto, que aparece con un fundido sobre la anterior.
 */
export function HeroMotion({ slides, children }: { slides: HeroSlide[]; children: React.ReactNode }) {
  const [index, setIndex] = useState(0);
  const [prev, setPrev] = useState<number | null>(null);
  const [rest, setRest] = useState(false);
  const [reduce, setReduce] = useState(false);
  const media = useRef<HTMLDivElement>(null);

  // La intro (titular con máscara, hairline, menú y CTA) es CSS: ver .intro en globals.css
  useEffect(() => setReduce(reducedMotion()), []);

  useEffect(() => {
    const t = window.setTimeout(() => setRest(true), 1600);
    return () => window.clearTimeout(t);
  }, []);
  // El titular (HeroStatements) marca el ritmo: cada frase trae su foto
  useEffect(() => {
    const onSlide = (e: Event) => {
      const next = (e as CustomEvent<number>).detail % slides.length;
      setRest(true);
      setIndex((cur) => {
        if (cur !== next) setPrev(cur);
        return next;
      });
    };
    window.addEventListener(HERO_SLIDE_EVENT, onSlide);
    return () => window.removeEventListener(HERO_SLIDE_EVENT, onSlide);
  }, [slides.length]);

  // Parallax leve: la foto baja a menor velocidad que el scroll
  useEffect(() => {
    if (reduce) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const y = Math.min(window.scrollY, window.innerHeight);
        if (media.current) media.current.style.transform = `translate3d(0, ${(y * 0.18).toFixed(1)}px, 0) scale(1.06)`;
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [reduce]);

  return (
    <div>
      <div aria-hidden className="absolute inset-0 -z-10 overflow-hidden">
        {/* Celular: la foto completa (16:9) arriba, fundida en el azul; escritorio: a sangre completa */}
        <div ref={media} className="absolute inset-x-0 top-16 aspect-[16/9] will-change-transform md:inset-0 md:top-0 md:aspect-auto" style={{ transform: "scale(1.06)" }}>
          {slides.map((s, i) => {
            if (i !== 0 && !rest) return null;
            const isActive = i === index;
            const isPrev = i === prev;
            return (
              <div
                key={s.src}
                className={cn("absolute inset-0", isActive ? "z-[2]" : isPrev ? "z-[1]" : "z-0 opacity-0")}
                style={isActive && prev !== null && !reduce ? { animation: "hero-fade 1.6s ease-in-out both" } : undefined}
              >
                <Image
                  src={s.src}
                  alt={s.alt}
                  fill
                  priority={i === 0}
                  fetchPriority={i === 0 ? "high" : "low"}
                  sizes="100vw"
                  quality={70}
                  className="object-cover opacity-70 md:object-[var(--pos)] md:opacity-60"
                  style={{ "--pos": s.position, "--pos-m": s.mobilePosition } as React.CSSProperties}
                />
              </div>
            );
          })}
          <div className="absolute inset-[-1px] z-[3] bg-[linear-gradient(180deg,#0f1320_0%,rgb(15_19_32/0.3)_18%,rgb(15_19_32/0.45)_55%,#0f1320_100%)] md:hidden" />
        </div>
        {/* Velos: la foto se pierde en el azul y el texto siempre se lee */}
        <div className="absolute inset-x-0 top-0 z-[3] h-16 bg-night md:hidden" />
        <div className="absolute inset-0 z-[3] hidden bg-[linear-gradient(90deg,rgb(15_19_32/0.96)_0%,rgb(15_19_32/0.82)_45%,rgb(15_19_32/0.55)_100%),linear-gradient(180deg,rgb(15_19_32/0.3)_0%,transparent_30%,rgb(15_19_32/0.95)_100%)] md:block" />
      </div>
      {children}
    </div>
  );
}
