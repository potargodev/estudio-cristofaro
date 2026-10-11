import { change, monthLabel } from "@/modules/insights/core";
import { cn } from "@/lib/utils";

// Gráficos livianos en SVG (sin librerías): barras por mes, con una o dos
// series. Cada gráfico tiene su tabla equivalente para lectores de pantalla.

type Point = { m: string; v: number };
const ars = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const int = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 });
export const fmt = (v: number, unit: "ars" | "n" | "pct") => (unit === "ars" ? ars.format(v) : unit === "pct" ? `${int.format(v)} %` : int.format(v));

export function Kpi({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "danger" | "ok" }) {
  return (
    <div className="rounded-md border border-line bg-surface px-4 py-3">
      <p className="text-meta text-muted">{label}</p>
      <p className={cn("num mt-0.5 text-headline leading-tight text-ink", tone === "danger" && "text-danger")}>{value}</p>
      {hint && <p className="mt-0.5 text-caption text-muted">{hint}</p>}
    </div>
  );
}

export function BarChart({ title, series, unit, second, legend }: { title: string; series: Point[]; unit: "ars" | "n" | "pct"; second?: Point[]; legend?: [string, string] }) {
  const W = 600;
  const H = 180;
  const pad = 22;
  const all = [...series, ...(second ?? [])].map((p) => p.v);
  const max = Math.max(1, ...all.map(Math.abs));
  const hasNeg = all.some((v) => v < 0);
  const zero = hasNeg ? H / 2 : H - pad;
  const scale = (hasNeg ? H / 2 - 8 : H - pad - 8) / max;
  const slot = W / series.length;
  const bw = second ? slot * 0.34 : slot * 0.6;
  const delta = change(series);
  const last = series.at(-1);
  return (
    <figure className="rounded-md border border-line bg-surface p-4">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-ui font-medium text-ink">{title}</span>
        {last && (
          <span className="num text-meta text-muted">
            {monthLabel(last.m)}: {fmt(last.v, unit)}
            {delta != null && unit !== "pct" && <span className={delta < 0 ? "text-danger" : "text-[#1f5f36]"}> · {delta > 0 ? "+" : ""}{delta} %</span>}
          </span>
        )}
      </figcaption>
      {legend && second && (
        <p className="mt-1 flex gap-3 text-caption text-muted">
          <span className="inline-flex items-center gap-1"><span className="size-2.5 rounded-sm bg-navy" aria-hidden />{legend[0]}</span>
          <span className="inline-flex items-center gap-1"><span className="size-2.5 rounded-sm bg-rose-deep" aria-hidden />{legend[1]}</span>
        </p>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 h-auto w-full" aria-hidden>
        <line x1={0} x2={W} y1={zero} y2={zero} className="stroke-line" />
        {series.map((p, i) => {
          const x = i * slot + (slot - (second ? bw * 2 + 2 : bw)) / 2;
          const bar = (v: number, dx: number, cls: string) => {
            const h = Math.max(v === 0 ? 0 : 1, Math.abs(v) * scale);
            return <rect x={x + dx} y={v >= 0 ? zero - h : zero} width={bw} height={h} rx={2} className={cls} />;
          };
          return (
            <g key={p.m}>
              {bar(p.v, 0, p.v < 0 ? "fill-danger" : "fill-navy")}
              {second && bar(second[i]?.v ?? 0, bw + 2, "fill-rose-deep")}
              {(series.length <= 6 || i % 2 === series.length % 2) && (
                <text x={i * slot + slot / 2} y={H - 4} textAnchor="middle" className="fill-muted text-micro">
                  {monthLabel(p.m)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <table className="sr-only">
        <caption>{title}</caption>
        <tbody>
          {series.map((p, i) => (
            <tr key={p.m}>
              <th scope="row">{monthLabel(p.m)}</th>
              <td>{fmt(p.v, unit)}</td>
              {second && <td>{fmt(second[i]?.v ?? 0, unit)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
