import { ArrowDownRight, ArrowRight, ArrowUpRight, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { Counter } from "@/components/web/Counter";
import { cn } from "@/lib/utils";
import { Sparkline } from "./Sparkline";

/**
 * Tarjeta de indicador: ícono en un recuadro con hairline, etiqueta, número
 * grande en la serif de marca, variación contra el período anterior (flecha y %
 * con texto, no solo color), sparkline opcional y link "Ver detalle".
 */
export function StatCard({
  icon: Icon,
  label,
  value,
  prefix,
  suffix,
  display,
  delta,
  hint,
  spark,
  href,
  tone = "default",
}: {
  icon: LucideIcon;
  label: string;
  value: number | null;
  prefix?: string;
  suffix?: string;
  /** Texto a mostrar en lugar del número (ej. "—") */
  display?: string;
  /** Variación en % contra el período anterior; `goodWhen` define el color */
  delta?: { value: number; goodWhen: "up" | "down"; label?: string };
  hint?: React.ReactNode;
  spark?: number[];
  href?: string;
  tone?: "default" | "alert";
}) {
  const good = delta ? (delta.value === 0 ? null : delta.value > 0 === (delta.goodWhen === "up")) : null;
  const Arrow = !delta || delta.value === 0 ? ArrowRight : delta.value > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <div className={cn("flex flex-col border bg-surface p-5", tone === "alert" ? "border-[#e7b4aa]" : "border-line")}>
      <div className="flex items-start justify-between gap-3">
        <span className={cn("grid size-9 place-items-center border", tone === "alert" ? "border-[#e7b4aa] text-[#8f2a1c]" : "border-line text-rose-deep")}>
          <Icon className="size-[18px]" strokeWidth={1.5} aria-hidden />
        </span>
        {spark && <Sparkline data={spark} className="h-7 w-24" />}
      </div>
      <p className="mt-4 text-[14px] text-muted">{label}</p>
      <p className="tabular mt-1 font-display text-[40px] leading-none text-ink">
        {display ?? (value === null ? "—" : <Counter value={value} prefix={prefix} suffix={suffix} duration={800} />)}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
        {delta && (
          <span className={cn("tabular inline-flex items-center gap-0.5 font-medium", good === null ? "text-muted" : good ? "text-[#1f7a43]" : "text-[#b42318]")}>
            <Arrow className="size-3.5" strokeWidth={2} aria-hidden />
            {delta.value > 0 ? "+" : ""}
            {delta.value}% <span className="font-normal text-muted">{delta.label ?? "vs. período anterior"}</span>
          </span>
        )}
        {hint && <span className="text-muted">{hint}</span>}
      </div>
      {href && (
        <Link href={href} className="mt-auto inline-flex items-center gap-1 pt-4 text-[13px] font-medium text-ink underline-offset-4 hover:underline">
          Ver detalle <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      )}
    </div>
  );
}
