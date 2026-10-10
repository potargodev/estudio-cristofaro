/** Gráfico simple de barras por semana (SVG, sin librerías). Accesible como tabla. */
export function WeeklyBars({
  title,
  data,
  tone = "navy",
  highlight,
}: {
  title: string;
  data: { label: string; value: number }[];
  tone?: "navy" | "rose";
  /** índice de la barra a destacar (la semana actual) */
  highlight?: number;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const color = tone === "navy" ? "var(--color-navy)" : "var(--color-rose)";
  return (
    <figure className="border border-line bg-surface p-5">
      <figcaption className="text-sm text-muted">{title}</figcaption>
      <div className="mt-4 flex h-36 items-end gap-2" aria-hidden>
        {data.map((d, i) => (
          <div key={d.label} className="flex flex-1 flex-col items-center gap-1.5">
            <span className="text-xs tabular-nums text-muted">{d.value || ""}</span>
            <div
              className="w-full max-w-9 rounded-t-[3px]"
              style={{ height: `${Math.max(3, (d.value / max) * 100)}px`, background: color, opacity: highlight === i ? 1 : 0.55 }}
            />
            <span className="text-[11px] text-muted">{d.label}</span>
          </div>
        ))}
      </div>
      <table className="sr-only">
        <caption>{title}</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.label}>
              <th scope="row">Semana del {d.label}</th>
              <td>{d.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
