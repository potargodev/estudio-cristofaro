"use client";

import { useEffect, useRef } from "react";
import { reducedMotion } from "@/lib/motion/gsap";

const WORDS = ["agencias", "consultoras", "software", "arquitectura"];

/**
 * Marquesina gigante en la serif de títulos, con contorno. Avanza sola y acelera (o se da
 * vuelta) según la velocidad del scroll. Con reduced-motion queda quieta.
 */
export function SegmentsMarquee() {
  const track = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = track.current;
    if (!el || reducedMotion()) return;
    let x = 0;
    let boost = 0;
    let lastY = window.scrollY;
    let raf = 0;
    let visible = false;
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible) raf = requestAnimationFrame(tick);
    });
    function tick() {
      const y = window.scrollY;
      boost = boost * 0.9 + (y - lastY) * 0.08;
      lastY = y;
      x -= 0.6 + boost;
      const half = el!.scrollWidth / 2;
      if (x <= -half) x += half;
      if (x > 0) x -= half;
      el!.style.transform = `translate3d(${x}px,0,0)`;
      if (visible) raf = requestAnimationFrame(tick);
    }
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);
  const row = (
    <>
      {WORDS.map((w) => (
        <span key={w} className="flex items-center">
          <span className="outline-text px-[0.25em] font-display text-[clamp(4.5rem,13vw,12rem)] leading-[1.05]">{w}</span>
          <span className="text-[clamp(2rem,5vw,4rem)] text-rose-light">·</span>
        </span>
      ))}
    </>
  );
  return (
    <section aria-label="Rubros: agencias, consultoras, software, arquitectura" className="overflow-hidden border-t border-hair bg-night py-10 lg:py-16">
      <div ref={track} aria-hidden className="flex w-max whitespace-nowrap will-change-transform">
        {row}
        {row}
      </div>
    </section>
  );
}
