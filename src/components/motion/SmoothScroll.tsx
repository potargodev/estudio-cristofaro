"use client";

import Lenis from "lenis";
import { useEffect } from "react";
import "lenis/dist/lenis.css";

// Scroll suave con Lenis. Solo en la web pública (no en /admin) y nunca con
// prefers-reduced-motion.
export function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const lenis = new Lenis({ autoRaf: true, duration: 1.05, anchors: { offset: -80 } });
    return () => lenis.destroy();
  }, []);
  return null;
}
