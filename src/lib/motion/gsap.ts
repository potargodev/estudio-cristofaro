"use client";

// GSAP se carga solo en el cliente y solo cuando una sección lo necesita
// (import dinámico): la página no paga el peso si no hay animación.
// ScrollTrigger se sincroniza con Lenis (ver SmoothScroll).

import type { gsap as GsapType } from "gsap";
import type { ScrollTrigger as ScrollTriggerType } from "gsap/ScrollTrigger";
import type { SplitText as SplitTextType } from "gsap/SplitText";

export interface Gsap {
  gsap: typeof GsapType;
  ScrollTrigger: typeof ScrollTriggerType;
  SplitText: typeof SplitTextType;
}

let loading: Promise<Gsap> | null = null;

export function loadGsap(): Promise<Gsap> {
  loading ??= (async () => {
    const [{ gsap }, { ScrollTrigger }, { SplitText }] = await Promise.all([import("gsap"), import("gsap/ScrollTrigger"), import("gsap/SplitText")]);
    gsap.registerPlugin(ScrollTrigger, SplitText);
    gsap.defaults({ ease: "expo.out" });
    const w = window as unknown as { __lenis?: { on: (e: string, f: () => void) => void }; __scrollTrigger?: unknown };
    w.__scrollTrigger = ScrollTrigger;
    w.__lenis?.on("scroll", ScrollTrigger.update);
    return { gsap, ScrollTrigger, SplitText };
  })();
  return loading;
}

export const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
/** Escritorio (pins, scroll horizontal, cursor): ancho y puntero fino */
export const isDesktop = () => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;

/** Las máscaras de línea de SplitText cortan los descendentes (p, y, g): les damos aire sin mover el texto */
export function padMasks(masks: Element[] | undefined) {
  masks?.forEach((m) => {
    (m as HTMLElement).style.paddingBottom = "0.14em";
    (m as HTMLElement).style.marginBottom = "-0.14em";
  });
}
