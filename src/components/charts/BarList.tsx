import { cn } from "@/lib/utils";

// Barras horizontales de una sola serie (magnitud): una fila por categoría, con
// la etiqueta y el valor en tokens de texto, la barra en un solo tono (rosé),
// extremo redondeado de 4 px y el detalle al pasar el mouse. Debajo, la misma
// información en una tabla (accesible y para imprimir). Ver docs/decisiones.md.

interface Bar {
  label: string;
  value: number;
  /** Texto del valor (ya formateado) */
  display: string;
  /** Detalle del tooltip (cantidad de comprobantes, porcentaje…) */
  hint?: string;
}

export function BarList({ title, bars, className, empty = "Sin datos en el período." }: { title: string; bars: Bar[]; className?: string; empty?: string }) {
  const max = Math.max(0, ...bars.map((b) => Math.abs(b.value)));
  return (
    <figure className={cn("grid gap-3", className)}>
      <figcaption className="text-ui font-medium text-ink">{title}</figcaption>
      {bars.length === 0 ? (
        <p className="text-meta text-muted">{empty}</p>
      ) : (
        <ul className="grid gap-2" aria-hidden>
          {bars.map((b) => (
            <li key={b.label} className="group grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_auto] items-center gap-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto]" title={`${b.label}: ${b.display}${b.hint ? ` · ${b.hint}` : ""}`}>
              <span className="truncate text-meta text-ink">{b.label}</span>
              <span className="h-2.5 rounded-r bg-line/40">
                <span className="block h-full rounded-r bg-gold transition-opacity group-hover:opacity-80 motion-reduce:transition-none" style={{ width: `${max && b.value ? Math.max(1.5, (Math.abs(b.value) / max) * 100) : 0}%` }} />
              </span>
              <span className="num text-meta text-ink">{b.display}</span>
            </li>
          ))}
        </ul>
      )}
      {bars.length > 0 && (
        <details className="text-meta">
          <summary className="cursor-pointer text-muted hover:text-ink">Ver como tabla</summary>
          <table className="mt-2 w-full text-left">
            <caption className="sr-only">{title}</caption>
            <tbody>
              {bars.map((b) => (
                <tr key={b.label} className="border-t border-line">
                  <th scope="row" className="py-1 pr-3 font-normal">
                    {b.label}
                  </th>
                  <td className="num py-1 text-right">{b.display}</td>
                  {b.hint && <td className="py-1 pl-3 text-muted">{b.hint}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </figure>
  );
}
