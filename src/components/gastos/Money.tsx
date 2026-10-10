import { formatMoney } from "@/modules/gastos/constants";
import { cn } from "@/lib/utils";

/** Saldo con texto claro: "te deben", "debés" o "al día" */
export function BalanceLine({ cents, currency, className, who = "te" }: { cents: number; currency: string; className?: string; who?: "te" | "nombre" }) {
  if (!cents) return <span className={cn("text-muted", className)}>Al día</span>;
  const pos = cents > 0;
  return (
    <span className={cn(pos ? "text-[#24583a]" : "text-rose-deep", className)}>
      {who === "te" ? (pos ? "Te deben " : "Debés ") : pos ? "Le deben " : "Debe "}
      <span className="tabular-nums font-medium">{formatMoney(Math.abs(cents), currency)}</span>
    </span>
  );
}

export function GroupDot({ color, name, size = "md" }: { color: string; name: string; size?: "sm" | "md" | "lg" }) {
  const s = size === "lg" ? "size-14 text-2xl" : size === "sm" ? "size-8 text-sm" : "size-11 text-lg";
  return (
    <span aria-hidden className={cn("grid shrink-0 place-items-center rounded-full font-display text-night", s)} style={{ background: color }}>
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}
