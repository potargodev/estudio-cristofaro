"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { cancelMotionTimeout } from "@/components/web/MotionBoot";
import type { HeroSlide } from "@/lib/hero";
import { loadGsap, reducedMotion, padMasks } from "@/lib/motion/gsap";
import { cn } from "@/lib/utils";

/**
 * Fondo del hero: foto a sangre completa atenuada con un velo azul noche y
 * parallax leve (si hubiera varias, cambian con un wipe de clip-path cada
 * `interval` s). También corre la intro (una vez por sesión).
 */
export function HeroMotion({ slides, interval, children }: { slides: HeroSlide[]; interval: number; children: React.ReactNode }) {
  const [index, setIndex] = useState(0);
  const [prev, setPrev] = useState<number | null>(null);
  const [rest, setRest] = useState(false);
  const [reduce, setReduce] = useState(false);
  const media = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);

  // Intro: titular línea por línea con máscara, hairline y después el resto
  useEffect(() => {
    const html = document.documentElement;
    const r = reducedMotion();
    setReduce(r);
    if (!html.classList.contains("intro") || r) return;
    let ctx: { revert: () => void } | undefined;
    loadGsap().then(({ gsap, SplitText }) => {
      const h1 = root.current?.querySelector("[data-intro-heading]") as HTMLElement | null;
      if (!h1) return;
      cancelMotionTimeout();
      ctx = gsap.context(() => {
        const split = SplitText.create(h1, { type: "lines", mask: "lines" });
        padMasks(split.masks);
        gsap.set(h1, { visibility: "visible" });
        const tl = gsap.timeline({
          onComplete: () => {
            split.revert();
            html.classList.remove("intro");
            try {
              sessionStorage.setItem("intro-visto", "1");
            } catch {}
          },
        });
        tl.from(split.lines, { yPercent: 110, duration: 1.2, stagger: 0.08, ease: "expo.out" })
          .fromTo("[data-intro='line']", { scaleX: 0 }, { scaleX: 1, duration: 1, ease: "expo.inOut" }, 0.5)
          .fromTo("[data-intro='fade']", { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.9, stagger: 0.06, ease: "expo.out" }, 1.1);
      });
    });
    return () => ctx?.revert();
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => setRest(true), 1600);
    return () => window.clearTimeout(t);
  }, []);
  useEffect(() => {
    if (reduce || slides.length < 2) return;
    const t = window.setTimeout(() => {
      setPrev(index);
      setIndex((i) => (i + 1) % slides.length);
    }, interval * 1000);
    return () => window.clearTimeout(t);
  }, [index, interval, reduce, slides.length]);

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
    <div ref={root}>
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
        {/* Guías verticales de la retícula */}
        <div className="grid-guides absolute inset-y-0 left-1/2 z-[4] w-full max-w-[1360px] -translate-x-1/2 px-5 opacity-60 sm:px-8 lg:px-12" />
      </div>
      {children}
      {/* Progreso: línea fina que se completa con cada foto */}
      {!reduce && slides.length > 1 && (
        <div aria-hidden className="absolute inset-x-0 bottom-0 z-10 h-px bg-hair">
          <div key={index} className="h-full origin-left bg-rose-light" style={{ animation: `hero-progress ${interval}s linear both` }} />
        </div>
      )}
    </div>
  );
}
