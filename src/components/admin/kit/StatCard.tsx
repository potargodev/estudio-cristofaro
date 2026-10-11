import { ArrowDownRight, ArrowRight, ArrowUpRight, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { Counter } from "@/components/web/Counter";
import { cn } from "@/lib/utils";
import { Sparkline } from "./Sparkline";

/**
 * Tarjeta de indicador: ícono y etiqueta, número en Archivo tabular (32 px), variación contra el período anterior (flecha y %
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
  // La curva solo aparece si hay historia de verdad (no una línea en cero)
  const showSpark = spark && spark.filter((v) => v !== 0).length > 1;
  return (
    <div className={cn("flex min-w-0 flex-col rounded-md border bg-surface p-4 sm:p-5", tone === "alert" ? "border-danger/40" : "border-line")}>
      <div className="flex items-start justify-between gap-3">
        <p className="flex min-w-0 items-center gap-2 text-ui font-medium text-muted">
          <Icon className={cn("size-4 shrink-0", tone === "alert" ? "text-danger" : "text-rose-deep")} strokeWidth={1.6} aria-hidden />
          <span className="truncate">{label}</span>
        </p>
        {showSpark && <Sparkline data={spark} className="h-6 w-20 shrink-0" />}
      </div>
      <p className="num mt-3 text-metric text-ink">
        {display ?? (value === null ? "—" : <Counter value={value} prefix={prefix} suffix={suffix} duration={800} />)}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-meta">
        {delta && (
          <span className={cn("num inline-flex items-center gap-0.5 font-medium", good === null ? "text-muted" : good ? "text-[#1f7a43]" : "text-[#b42318]")}>
            <Arrow className="size-3.5" strokeWidth={2} aria-hidden />
            {delta.value > 0 ? "+" : ""}
            {delta.value}% <span className="font-normal text-muted">{delta.label ?? "vs. período anterior"}</span>
          </span>
        )}
        {hint && <span className="text-muted">{hint}</span>}
      </div>
      {href && (
        <Link href={href} className="mt-auto inline-flex items-center gap-1 pt-4 text-meta font-medium text-ink underline-offset-4 hover:underline">
          Ver detalle <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      )}
    </div>
  );
}
