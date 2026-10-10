"use client";

import { useEffect, useRef } from "react";
import { loadGsap, onceVisible, padMasks, reducedMotion } from "@/lib/motion/gsap";
import { cn } from "@/lib/utils";
import { cancelMotionTimeout } from "./MotionBoot";

type Tag = "h1" | "h2" | "h3" | "p" | "div";

/**
 * Titular que entra línea por línea con máscara (y: 110% → 0, expo.out).
 * `hero`: está arriba de todo y anima al montar (arranca oculto por CSS);
 * si no, anima al entrar en pantalla. Con reduced-motion se ve fijo.
 */
export function SplitHeading({
  as: Tag = "h2",
  children,
  className,
  hero = false,
  delay = 0,
  id,
}: {
  as?: Tag;
  children: React.ReactNode;
  className?: string;
  hero?: boolean;
  delay?: number;
  id?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reducedMotion()) {
      el.dataset.splitDone = "1";
      return;
    }
    let split: { revert: () => void } | null = null;
    let tween: { kill: () => void } | null = null;
    let cancelled = false;
    const run = () =>
      loadGsap().then(({ gsap, SplitText }) => {
        if (cancelled) return;
        const s = SplitText.create(el, { type: "lines", mask: "lines", linesClass: "split-line" });
        padMasks(s.masks);
        split = s;
        el.dataset.splitDone = "1";
        if (hero) cancelMotionTimeout();
        tween = gsap.from(s.lines, {
          yPercent: 110,
          duration: 1.2,
          stagger: 0.08,
          ease: "expo.out",
          delay,
          onComplete: () => {
            s.revert();
            split = null;
          },
        });
      });
    // Arriba de todo anima al montar; el resto, justo antes de entrar en pantalla
    const stop = hero ? undefined : onceVisible(el, run, "0px 0px 8% 0px");
    if (hero) run();
    return () => {
      cancelled = true;
      stop?.();
      tween?.kill();
      split?.revert();
    };
  }, [hero, delay]);
  return (
    <Tag ref={ref as never} id={id} data-split={hero ? "hero" : "scroll"} className={cn(className)}>
      {children}
    </Tag>
  );
}
