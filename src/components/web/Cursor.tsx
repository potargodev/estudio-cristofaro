"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Cursor propio en escritorio: punto rosé que sigue al puntero con inercia,
 * crece sobre links y botones y muestra "Ver" sobre links e imágenes. No se
 * monta con puntero grueso (celular) ni con reduced-motion.
 */
export function Cursor() {
  const dot = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);
  const [mode, setMode] = useState<"idle" | "hover" | "view">("idle");
  useEffect(() => {
    if (!window.matchMedia("(pointer: fine)").matches || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setOn(true);
    document.documentElement.classList.add("has-cursor");
    let x = -100, y = -100, tx = -100, ty = -100, raf = 0;
    const loop = () => {
      x += (tx - x) * 0.22;
      y += (ty - y) * 0.22;
      if (dot.current) dot.current.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const move = (e: PointerEvent) => {
      tx = e.clientX;
      ty = e.clientY;
      const t = e.target as HTMLElement | null;
      const view = t?.closest("[data-cursor='ver'], a[href]:not([data-cursor='none']) img, .duotone");
      const hover = t?.closest("a[href], button, [role='tab'], [data-cursor='hover']");
      setMode(view ? "view" : hover ? (t?.closest("a[href]") && !t.closest("nav, header, footer, [data-cursor='hover']") ? "view" : "hover") : "idle");
    };
    const out = () => {
      tx = -100;
      ty = -100;
    };
    window.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerleave", out);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", move);
      document.removeEventListener("pointerleave", out);
      document.documentElement.classList.remove("has-cursor");
    };
  }, []);
  if (!on) return null;
  const size = mode === "view" ? 64 : mode === "hover" ? 36 : 10;
  return (
    <div
      ref={dot}
      aria-hidden
      className="pointer-events-none fixed left-0 top-0 z-[100] grid place-items-center rounded-full text-[11px] font-medium text-night mix-blend-normal"
      style={{
        width: size,
        height: size,
        background: mode === "hover" ? "transparent" : "var(--color-rose-light)",
        border: mode === "hover" ? "1px solid var(--color-rose-light)" : "none",
        transition: "width 300ms var(--ease-expo), height 300ms var(--ease-expo), background-color 200ms",
      }}
    >
      {mode === "view" && "Ver"}
    </div>
  );
}
