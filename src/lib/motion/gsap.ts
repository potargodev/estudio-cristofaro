"use client";

// GSAP se carga solo en el cliente y solo cuando una sección lo necesita
// (import dinámico): la página no paga el peso si no hay animación.
// ScrollTrigger va aparte y solo lo piden las secciones fijas de escritorio:
// en el celular (y para revelar algo una sola vez) alcanza con
// IntersectionObserver, que no fuerza recálculos de toda la página.

import type { gsap as GsapType } from "gsap";
import type { ScrollTrigger as ScrollTriggerType } from "gsap/ScrollTrigger";
import type { SplitText as SplitTextType } from "gsap/SplitText";

export interface Gsap {
  gsap: typeof GsapType;
  SplitText: typeof SplitTextType;
}

let loading: Promise<Gsap> | null = null;
let loadingST: Promise<Gsap & { ScrollTrigger: typeof ScrollTriggerType }> | null = null;

export function loadGsap(): Promise<Gsap> {
  loading ??= (async () => {
    const [{ gsap }, { SplitText }] = await Promise.all([import("gsap"), import("gsap/SplitText")]);
    gsap.registerPlugin(SplitText);
    gsap.defaults({ ease: "expo.out" });
    return { gsap, SplitText };
  })();
  return loading;
}

/** GSAP + ScrollTrigger sincronizado con Lenis (solo secciones fijas de escritorio) */
export function loadScrollTrigger() {
  loadingST ??= (async () => {
    const [base, { ScrollTrigger }] = await Promise.all([loadGsap(), import("gsap/ScrollTrigger")]);
    base.gsap.registerPlugin(ScrollTrigger);
    const w = window as unknown as { __lenis?: { on: (e: string, f: () => void) => void }; __scrollTrigger?: unknown };
    w.__scrollTrigger = ScrollTrigger;
    w.__lenis?.on("scroll", ScrollTrigger.update);
    return { ...base, ScrollTrigger };
  })();
  return loadingST;
}

/** Corre `cb` una vez, cuando el elemento entra en pantalla. Devuelve cómo cancelarlo. */
export function onceVisible(el: Element, cb: () => void, rootMargin = "0px 0px -12% 0px"): () => void {
  const io = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        cb();
      }
    },
    { rootMargin },
  );
  io.observe(el);
  return () => io.disconnect();
}

/** Las máscaras de línea de SplitText cortan los descendentes (p, y, g): les damos aire sin mover el texto */
export function padMasks(masks: Element[] | undefined) {
  masks?.forEach((m) => {
    (m as HTMLElement).style.paddingBottom = "0.14em";
    (m as HTMLElement).style.marginBottom = "-0.14em";
  });
}

export const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
/** Escritorio (pins, scroll horizontal, cursor): ancho y puntero fino */
export const isDesktop = () => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px) and (pointer: fine)").matches;
