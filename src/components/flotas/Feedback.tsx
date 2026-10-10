/** Mensajes ok/error que llegan por la URL después de cada acción */
export function Feedback({ ok, error }: { ok?: string; error?: string }) {
  if (error)
    return (
      <p role="alert" className="mb-5 rounded-md border border-danger/40 bg-danger/10 px-4 py-3 text-[15px] text-danger">
        {error}
      </p>
    );
  if (ok)
    return (
      <p role="status" className="mb-5 rounded-md border border-line bg-navy-soft px-4 py-3 text-[15px] text-ink">
        {ok}
      </p>
    );
  return null;
}

export function FleetLabel() {
  return <span className="inline-block rounded border border-line px-2 py-0.5 text-[12px] font-medium text-muted">Flota · grupo informal</span>;
}
