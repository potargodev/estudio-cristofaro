import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// La escala tipográfica de DESIGN.md (text-ui, text-title…) son tamaños, no
// colores: sin esto, cn("text-ui", "text-ink") se quedaría solo con el color.
const twMerge = extendTailwindMerge({
  extend: { theme: { text: ["micro", "caption", "meta", "ui", "body", "lead", "title", "section", "headline", "metric"] } },
});

/** Combina clases de Tailwind resolviendo conflictos (utilidad estándar de shadcn/ui). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
