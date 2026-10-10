import { cn } from "@/lib/utils";
import { Sello } from "./Sello";

// Logo inicial de Faro (docs/faro-producto.md §4): el isotipo circular de
// Estudio Cristofaro + "FARO" en mayúsculas. Pendiente: isotipo propio de Faro.

export function FaroLogo({ className, size = "md", sub, tone = "dark" }: { className?: string; size?: "sm" | "md" | "lg"; sub?: string | null; tone?: "dark" | "light" }) {
  const seal = size === "sm" ? "size-8" : size === "lg" ? "size-14" : "size-11";
  const word = size === "sm" ? "text-[17px]" : size === "lg" ? "text-[28px]" : "text-[22px]";
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-3", className)}>
      <Sello className={cn("shrink-0", seal, tone === "dark" ? "text-gold" : "text-navy")} title="Faro" />
      <span className="min-w-0 leading-none">
        <span className={cn("block font-display tracking-[0.32em]", word, tone === "dark" ? "text-paper" : "text-ink")}>FARO</span>
        {sub && <span className={cn("mt-1 block truncate text-[11px]", tone === "dark" ? "text-paper/60" : "text-muted")}>{sub}</span>}
      </span>
    </span>
  );
}
