"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { HERO_SLIDE_EVENT, type HeroSlide } from "@/lib/hero";
import { reducedMotion } from "@/lib/motion/gsap";
import { cn } from "@/lib/utils";

/**
 * Fondo del hero: foto a sangre completa atenuada con un velo azul noche y
 * parallax leve. Cada frase del titular trae su foto, que entra con un wipe.
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
        <div ref={media} className="absolute inset-0 will-change-transform" style={{ transform: "scale(1.06)" }}>
          {slides.map((s, i) => {
            if (i !== 0 && !rest) return null;
            const isActive = i === index;
            const isPrev = i === prev;
            return (
              <div
                key={s.src}
                className={cn("absolute inset-0", isActive ? "z-[2]" : isPrev ? "z-[1]" : "z-0 opacity-0")}
                style={isActive && prev !== null && !reduce ? { animation: "hero-wipe 1.3s var(--ease-expo) both" } : undefined}
              >
                <Image
                  src={s.src}
                  alt={s.alt}
                  fill
                  priority={i === 0}
                  fetchPriority={i === 0 ? "high" : "low"}
                  sizes="100vw"
                  quality={70}
                  className="object-cover object-[var(--pos-m)] md:object-[var(--pos)]"
                  style={{ "--pos": s.position, "--pos-m": s.mobilePosition } as React.CSSProperties}
                />
              </div>
            );
          })}
        </div>
        {/* Velo para el contraste del texto (abajo y a la izquierda) */}
        <div className="absolute inset-0 z-[3] bg-[linear-gradient(180deg,rgb(15_19_32/0.6)_0%,rgb(15_19_32/0.45)_35%,rgb(15_19_32/0.88)_62%,rgb(15_19_32/0.97)_100%)] md:bg-[linear-gradient(90deg,rgb(15_19_32/0.92)_0%,rgb(15_19_32/0.7)_50%,rgb(15_19_32/0.45)_100%),linear-gradient(180deg,transparent_50%,rgb(15_19_32/0.92)_100%)]" />
      </div>
      {children}
    </div>
  );
}
