"use client";

import Lenis from "lenis";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import "lenis/dist/lenis.css";

type W = { __lenis?: Lenis; __scrollTrigger?: { update: () => void } };

// Scroll suave con Lenis (solo en la web pública y nunca con reduced-motion).
// Si GSAP ya está cargado, ScrollTrigger se actualiza con cada scroll de Lenis.
export function SmoothScroll() {
  const pathname = usePathname();
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const lenis = new Lenis({ autoRaf: true, duration: 1.1, anchors: { offset: -72 } });
    const w = window as unknown as W;
    w.__lenis = lenis;
    if (w.__scrollTrigger) lenis.on("scroll", w.__scrollTrigger.update);
    return () => {
      lenis.destroy();
      delete w.__lenis;
    };
  }, []);
  // Al cambiar de página, arriba de todo sin animación
  useEffect(() => {
    (window as unknown as W).__lenis?.scrollTo(0, { immediate: true, force: true });
  }, [pathname]);
  return null;
}
