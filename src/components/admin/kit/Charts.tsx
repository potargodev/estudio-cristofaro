"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

// Gráficos livianos en SVG (sin dependencias): barras, líneas y donut con
// colores de marca (todos ≥ 3:1 sobre blanco), ejes discretos, números
// tabulares y tooltip legible al pasar el mouse o con el foco del teclado.
// Cada gráfico lleva además una tabla oculta con los datos para lectores.

export const CHART_COLORS = ["#1c2235", "#a57c6d", "#6b7a99", "#3f7f57", "#7d5848"] as const;
const fmt = new Intl.NumberFormat("es-AR");

export interface Series {
  key: string;
  label: string;
  color?: string;
}
type Row = { label: string } & Record<string, number | string>;

function Legend({ series }: { series: Series[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted">
      {series.map((s, i) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <span className="size-2.5" style={{ background: s.color ?? CHART_COLORS[i] }} aria-hidden />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

function DataTable({ caption, rows, series }: { caption: string; rows: Row[]; series: Series[] }) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">Período</th>
          {series.map((s) => (
            <th key={s.key} scope="col">
              {s.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label}>
            <th scope="row">{r.label}</th>
            {series.map((s) => (
              <td key={s.key}>{Number(r[s.key]) || 0}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Tooltip({ row, series, x, y }: { row: Row; series: Series[]; x: number; y: number }) {
  return (
    <div
      className="pointer-events-none absolute z-10 min-w-36 -translate-x-1/2 -translate-y-full border border-line bg-surface px-3 py-2 text-[13px] shadow-[0_8px_20px_-10px_rgba(20,24,38,0.35)]"
      style={{ left: `${x}%`, top: y }}
    >
      <p className="font-medium text-ink">{row.label}</p>
      {series.map((s, i) => (
        <p key={s.key} className="tabular mt-0.5 flex items-center justify-between gap-4 text-muted">
          <span className="flex items-center gap-1.5">
            <span className="size-2" style={{ background: s.color ?? CHART_COLORS[i] }} aria-hidden />
            {s.label}
          </span>
          <span className="text-ink">{fmt.format(Number(row[s.key]) || 0)}</span>
        </p>
      ))}
    </div>
  );
}

/** Barras agrupadas o apiladas */
export function BarChart({
  data,
  series,
  caption,
  stacked = false,
  height = 220,
  highlight,
}: {
  data: Row[];
  series: Series[];
  caption: string;
  stacked?: boolean;
  height?: number;
  /** Índice de la categoría a destacar (ej. la semana actual) */
  highlight?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const totals = data.map((r) => series.reduce((a, s) => a + (Number(r[s.key]) || 0), 0));
  const max = Math.max(1, ...(stacked ? totals : data.flatMap((r) => series.map((s) => Number(r[s.key]) || 0))));
  const ticks = [0, Math.ceil(max / 2), max];
  const n = data.length;
  return (
    <figure className="relative">
      <figcaption className="sr-only">{caption}</figcaption>
      <div className="relative flex" style={{ height }}>
        <div className="tabular flex w-8 shrink-0 flex-col justify-between pb-6 text-right text-[12px] text-muted" aria-hidden>
          {[...ticks].reverse().map((t) => (
            <span key={t} className="-translate-y-1/2 leading-none">
              {t}
            </span>
          ))}
        </div>
        <div className="relative ml-2 flex-1">
          <div className="absolute inset-x-0 bottom-6 top-0 flex flex-col justify-between" aria-hidden>
            {ticks.map((t) => (
              <span key={t} className="border-t border-dashed border-line" />
            ))}
          </div>
          <div className="absolute inset-0 flex">
            {data.map((r, i) => {
              const plot = height - 24;
              let acc = 0;
              return (
                <div
                  key={r.label}
                  tabIndex={0}
                  role="img"
                  aria-label={`${r.label}: ${series.map((s) => `${s.label} ${Number(r[s.key]) || 0}`).join(", ")}`}
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  className={cn("relative min-w-0 flex-1 outline-none", hover === i && "bg-navy-soft/60")}
                >
                  <div className="absolute inset-x-[14%] bottom-6" style={{ height: plot }}>
                    {series.map((s, k) => {
                      const v = Number(r[s.key]) || 0;
                      const h = Math.max(v ? 2 : 0, (v / max) * plot);
                      const w = stacked ? 100 : 100 / series.length;
                      const style: React.CSSProperties = stacked
                        ? { left: 0, width: "100%", bottom: acc, height: h }
                        : { left: `${k * w}%`, width: `calc(${w}% - 2px)`, bottom: 0, height: h };
                      if (stacked) acc += h;
                      return (
                        <span
                          key={s.key}
                          className={cn("absolute", highlight !== undefined && highlight !== i && "opacity-60")}
                          style={{ ...style, background: s.color ?? CHART_COLORS[k] }}
                        />
                      );
                    })}
                  </div>
                  <span className="tabular absolute inset-x-0 bottom-0 truncate text-center text-[12px] text-muted">{r.label}</span>
                </div>
              );
            })}
          </div>
          {hover !== null && <Tooltip row={data[hover]} series={series} x={((hover + 0.5) / n) * 100} y={8} />}
        </div>
      </div>
      {series.length > 1 && (
        <div className="mt-3 pl-10">
          <Legend series={series} />
        </div>
      )}
      <DataTable caption={caption} rows={data} series={series} />
    </figure>
  );
}

/** Líneas (una o más series) */
export function LineChart({ data, series, caption, height = 200 }: { data: Row[]; series: Series[]; caption: string; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.flatMap((r) => series.map((s) => Number(r[s.key]) || 0)));
  const W = 100;
  const H = 100;
  const x = (i: number) => (data.length === 1 ? W / 2 : (i / (data.length - 1)) * W);
  const y = (v: number) => H - (v / max) * H;
  return (
    <figure className="relative">
      <figcaption className="sr-only">{caption}</figcaption>
      <div className="relative ml-10 pb-6" style={{ height }}>
        <div className="tabular absolute -left-10 bottom-6 top-0 flex w-8 flex-col justify-between text-right text-[12px] text-muted" aria-hidden>
          <span className="-translate-y-1/2">{max}</span>
          <span className="translate-y-1/2">0</span>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-x-0 bottom-6 top-0 h-[calc(100%-1.5rem)] w-full overflow-visible" aria-hidden>
          {[0, 0.5, 1].map((f) => (
            <line key={f} x1={0} x2={W} y1={H * f} y2={H * f} stroke="var(--color-line)" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
          ))}
          {series.map((s, k) => (
            <polyline
              key={s.key}
              fill="none"
              stroke={s.color ?? CHART_COLORS[k]}
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
              points={data.map((r, i) => `${x(i)},${y(Number(r[s.key]) || 0)}`).join(" ")}
            />
          ))}
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={0} y2={H} stroke="var(--color-muted)" strokeWidth={1} vectorEffect="non-scaling-stroke" />}
        </svg>
        <div className="absolute inset-0 flex">
          {data.map((r, i) => (
            <div
              key={r.label}
              tabIndex={0}
              role="img"
              aria-label={`${r.label}: ${series.map((s) => `${s.label} ${Number(r[s.key]) || 0}`).join(", ")}`}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              className="relative flex-1 outline-none"
            >
              <span className="tabular absolute inset-x-0 bottom-0 truncate text-center text-[12px] text-muted">{r.label}</span>
            </div>
          ))}
        </div>
        {hover !== null && <Tooltip row={data[hover]} series={series} x={((hover + 0.5) / data.length) * 100} y={8} />}
      </div>
      {series.length > 1 && <Legend series={series} />}
      <DataTable caption={caption} rows={data} series={series} />
    </figure>
  );
}

/** Donut con total al centro y leyenda con valores */
export function DonutChart({
  data,
  caption,
  centerLabel,
}: {
  data: { key: string; label: string; value: number; color?: string }[];
  caption: string;
  centerLabel: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const total = data.reduce((a, d) => a + d.value, 0);
  const r = 40;
  const c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <figure className="flex flex-wrap items-center gap-6">
      <figcaption className="sr-only">{caption}</figcaption>
      <div className="relative size-40 shrink-0">
        <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden>
          <circle cx="50" cy="50" r={r} fill="none" stroke="var(--color-navy-soft)" strokeWidth="12" />
          {total > 0 &&
            data.map((d, i) => {
              const len = (d.value / total) * c;
              const el = (
                <circle
                  key={d.key}
                  cx="50"
                  cy="50"
                  r={r}
                  fill="none"
                  stroke={d.color ?? CHART_COLORS[i]}
                  strokeWidth={hover === i ? 15 : 12}
                  strokeDasharray={`${len} ${c - len}`}
                  strokeDashoffset={-acc}
                  className="transition-[stroke-width] duration-150"
                />
              );
              acc += len;
              return el;
            })}
        </svg>
        <div className="absolute inset-0 grid place-content-center text-center">
          <span className="tabular font-display text-[28px] leading-none text-ink">{hover !== null ? data[hover].value : total}</span>
          <span className="mt-1 text-[12px] text-muted">{hover !== null ? data[hover].label : centerLabel}</span>
        </div>
      </div>
      <ul className="min-w-40 flex-1 text-[14px]">
        {data.map((d, i) => (
          <li
            key={d.key}
            tabIndex={0}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
            className="flex items-center justify-between gap-3 border-b border-line py-2 outline-none last:border-0 focus-visible:bg-navy-soft/60"
          >
            <span className="flex items-center gap-2 text-ink">
              <span className="size-2.5" style={{ background: d.color ?? CHART_COLORS[i] }} aria-hidden />
              {d.label}
            </span>
            <span className="tabular text-muted">
              {d.value}
              {total > 0 && <span className="ml-2 text-[12px]">{Math.round((d.value / total) * 100)}%</span>}
            </span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
