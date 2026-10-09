"use client";

import { useEffect, useRef, useState } from "react";

const fmt = new Intl.NumberFormat("es-AR");

/** Número que cuenta al aparecer (rAF, sin GSAP). Con reduced-motion, el valor final. */
export function Counter({ value, prefix = "", suffix = "", duration = 1400, className }: { value: number; prefix?: string; suffix?: string; duration?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(value);
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setShown(0);
    let raf = 0;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        const t0 = performance.now();
        const tick = (t: number) => {
          const p = Math.min(1, (t - t0) / duration);
          setShown(Math.round(value * (1 - Math.pow(1 - p, 4))));
          if (p < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value, duration]);
  return (
    <span ref={ref} className={className}>
      <span aria-hidden>
        {prefix}
        {fmt.format(shown)}
        {suffix}
      </span>
      <span className="sr-only">
        {prefix}
        {fmt.format(value)}
        {suffix}
      </span>
    </span>
  );
}
