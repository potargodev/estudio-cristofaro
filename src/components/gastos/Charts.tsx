import { categoryName, formatMoney } from "@/modules/gastos/constants";

// Gráficos simples (server): por categoría (barras horizontales) y por mes
// (columnas). Los valores van en la moneda base; cada barra tiene su texto.

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const COLORS = ["#1c2235", "#a57c6d", "#c9a596", "#6b7a99", "#3f7f57", "#7d5848", "#9b6fa6"];

export function CategoryChart({ data, currency }: { data: Record<string, number>; currency: string }) {
  const rows = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const total = rows.reduce((s, [, v]) => s + v, 0);
  const max = Math.max(1, ...rows.map(([, v]) => v));
  if (!rows.length) return <p className="text-muted">Todavía no hay gastos para graficar.</p>;
  return (
    <figure>
      <figcaption className="sr-only">Gastos por categoría</figcaption>
      <ul className="grid gap-3">
        {rows.map(([k, v], i) => (
          <li key={k}>
            <div className="flex items-baseline justify-between gap-3 text-[14px]">
              <span>{categoryName(k)}</span>
              <span className="tabular-nums text-muted">
                {formatMoney(v, currency)} <span className="text-[12px]">· {Math.round((v / total) * 100)}%</span>
              </span>
            </div>
            <div className="mt-1.5 h-2.5 bg-navy-soft">
              <div className="gastos-bar h-full origin-left" style={{ width: `${(v / max) * 100}%`, background: COLORS[i % COLORS.length], animationDelay: `${i * 60}ms` }} />
            </div>
          </li>
        ))}
      </ul>
    </figure>
  );
}

export function MonthChart({ data, currency }: { data: Record<string, number>; currency: string }) {
  const rows = Object.entries(data).sort(([a], [b]) => (a < b ? -1 : 1)).slice(-12);
  const max = Math.max(1, ...rows.map(([, v]) => v));
  if (!rows.length) return <p className="text-muted">Todavía no hay gastos para graficar.</p>;
  return (
    <figure>
      <figcaption className="sr-only">Gastos por mes</figcaption>
      <div className="flex h-48 items-end gap-2 border-b border-line">
        {rows.map(([m, v], i) => (
          <div key={m} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" role="img" aria-label={`${m}: ${formatMoney(v, currency)}`}>
            <span className="hidden truncate text-[11px] tabular-nums text-muted sm:block">{formatMoney(v, currency, { compact: true })}</span>
            <div className="gastos-col w-full max-w-12 origin-bottom bg-navy" style={{ height: `${Math.max(2, (v / max) * 82)}%`, animationDelay: `${i * 50}ms` }} />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-2">
        {rows.map(([m]) => (
          <span key={m} className="min-w-0 flex-1 text-center text-[12px] text-muted">
            {MONTHS[Number(m.slice(5, 7)) - 1]}
          </span>
        ))}
      </div>
    </figure>
  );
}
