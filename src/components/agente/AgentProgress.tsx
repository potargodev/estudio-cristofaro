/** Barra de avance de una tarea del Agente (pasos hechos de los totales) */
export function AgentProgress({ done, total }: { done: number; total: number }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <span className="flex items-center gap-2">
      <span role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label="Avance" className="h-1.5 w-full max-w-60 overflow-hidden rounded-full bg-line">
        <span className="block h-full rounded-full bg-gold motion-safe:transition-[width]" style={{ width: `${pct}%` }} />
      </span>
      <span className="num shrink-0 text-caption">
        {done} de {total}
      </span>
    </span>
  );
}
