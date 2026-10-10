"use client";

import { useEffect, useRef } from "react";
import { loadGsap, onceVisible, reducedMotion } from "@/lib/motion/gsap";
import { cn } from "@/lib/utils";

/**
 * Hijos con [data-reveal] que entran en secuencia (opacidad + 16 px) cuando el
 * bloque aparece en pantalla. Con reduced-motion se ven fijos desde el inicio.
 */
export function Reveal({ children, className, as: Tag = "div", stagger = 0.08 }: { children: React.ReactNode; className?: string; as?: "div" | "ul" | "ol" | "section"; stagger?: number }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || reducedMotion()) return;
    const items = el.querySelectorAll("[data-reveal]");
    if (!items.length) return;
    let ctx: { revert: () => void } | undefined;
    let cancelled = false;
    const stop = onceVisible(el, () =>
      loadGsap().then(({ gsap }) => {
        if (cancelled) return;
        ctx = gsap.context(() => {
          gsap.from(items, { opacity: 0, y: 16, duration: 0.9, stagger, clearProps: "transform,opacity" });
        }, el);
      }),
    );
    return () => {
      cancelled = true;
      stop();
      ctx?.revert();
    };
  }, [stagger]);
  return (
    <Tag ref={ref as never} className={cn(className)}>
      {children}
    </Tag>
  );
}
