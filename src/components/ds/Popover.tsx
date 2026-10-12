"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

// Popover del sistema (DESIGN.md → Navigation): todo menú, desplegable o panel
// flotante se monta con esta pieza. Flota sobre la página (no empuja el
// contenido), se ubica pegado a su disparador y siempre entra en la pantalla:
// se corre para no salirse por los costados, se da vuelta hacia arriba si
// abajo no entra y limita su alto al espacio disponible. Con align="match"
// toma el ancho del disparador (selector de espacios). Cierra con Escape o un
// clic afuera y devuelve el foco al disparador.

const MARGIN = 8;

// Se monta dentro del contenedor .app-ui más externo (no en <body>): así hereda
// los tokens del tema y de .keep-dark, y queda fuera de la barra lateral, que se
// anima con transform y recortaría un panel fijo.
function hostFor(el: HTMLElement | null) {
  let host: Element | null = null;
  for (let n = el?.closest(".app-ui") ?? null; n; n = n.parentElement?.closest(".app-ui") ?? null) host = n;
  return host ?? document.body;
}

interface PopoverProps {
  open: boolean;
  onClose: () => void;
  /** El disparador: el panel se alinea con él */
  anchor: RefObject<HTMLElement | null>;
  /** end: borde derecho con el del disparador · start: izquierdo · match: mismo ancho */
  align?: "start" | "end" | "match";
  /** Ancho mínimo con align="match" (px) */
  minWidth?: number;
  /** Distancia al disparador (px) */
  offset?: number;
  role?: "menu" | "dialog" | "listbox";
  label?: string;
  className?: string;
  children: React.ReactNode;
}

export function Popover({ open, onClose, anchor, align = "end", minWidth = 0, offset = 6, role = "menu", label, className, children }: PopoverProps) {
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width?: number; maxHeight: number } | null>(null);

  const place = useCallback(() => {
    const a = anchor.current;
    const p = panel.current;
    if (!a || !p) return;
    const r = a.getBoundingClientRect();
    const W = window.innerWidth;
    const H = window.innerHeight;
    const width = align === "match" ? Math.min(Math.max(r.width, minWidth), W - 2 * MARGIN) : Math.min(p.offsetWidth, W - 2 * MARGIN);
    let left = align === "end" ? r.right - width : r.left;
    left = Math.max(MARGIN, Math.min(left, W - MARGIN - width));
    const below = H - r.bottom - offset - MARGIN;
    const above = r.top - offset - MARGIN;
    const natural = p.scrollHeight;
    const up = natural > below && above > below;
    const maxHeight = Math.max(120, up ? above : below);
    const height = Math.min(natural, maxHeight);
    const top = up ? r.top - offset - height : r.bottom + offset;
    setPos({ top, left, width: align === "match" ? width : undefined, maxHeight });
  }, [anchor, align, minWidth, offset]);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panel.current?.contains(t) || anchor.current?.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      onClose();
      anchor.current?.focus();
    };
    const onMove = () => place();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [open, onClose, anchor, place]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={panel}
      role={role}
      aria-label={label}
      data-popover
      style={{ position: "fixed", top: pos?.top ?? 0, left: pos?.left ?? 0, width: pos?.width, maxHeight: pos?.maxHeight, visibility: pos ? "visible" : "hidden" }}
      className={cn("z-[60] overflow-y-auto overflow-x-hidden rounded-md shadow-overlay", className)}
    >
      {children}
    </div>,
    hostFor(anchor.current),
  );
}
