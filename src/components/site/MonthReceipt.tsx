// Pieza central del hero: el "comprobante" de un mes con el estudio.
// Ilustrativo — muestra cómo se ve el resumen mensual que recibe el cliente.

const rows = [
  { label: "IVA septiembre", state: "Presentado" },
  { label: "Ingresos Brutos", state: "Presentado" },
  { label: "Sueldos y F.931", state: "Liquidado" },
  { label: "Monotributo socios", state: "Pagado" },
];

export function MonthReceipt() {
  return (
    <figure className="relative mx-auto w-full max-w-[400px]" aria-label="Ejemplo del resumen mensual que recibe un cliente">
      <div className="perforated relative bg-surface px-7 pb-10 pt-11 shadow-[0_24px_60px_-28px_rgba(19,34,29,0.45)]">
        <div className="flex items-baseline justify-between border-b border-dashed border-line pb-4">
          <div>
            <p className="text-[13px] text-muted">Resumen mensual</p>
            <p className="text-lg font-semibold">Septiembre 2026</p>
          </div>
          <p className="text-[13px] text-muted">Cliente PyME</p>
        </div>

        <ul className="divide-y divide-dashed divide-line">
          {rows.map((r, i) => (
            <li
              key={r.label}
              className="row-in flex items-center justify-between py-3 text-[15px]"
              style={{ animationDelay: `${150 + i * 110}ms` }}
            >
              <span>{r.label}</span>
              <span className="inline-flex items-center gap-1.5 text-green">
                <svg aria-hidden viewBox="0 0 16 16" className="size-4">
                  <path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {r.state}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-2 rounded-[4px] bg-marker/60 px-3 py-3">
          <p className="text-[13px] text-ink/70">Próximo vencimiento</p>
          <p className="mt-0.5 font-semibold">IVA octubre · te avisamos 5 días antes</p>
        </div>

        <p className="mt-5 text-[13px] leading-relaxed text-muted">
          Cada mes recibís esta página: qué se presentó, qué se pagó y qué viene.
        </p>

        <div
          aria-hidden
          className="stamp-in absolute -right-3 top-24 rotate-[-8deg] rounded-[6px] border-[3px] border-green px-3 py-1.5 text-center text-green"
        >
          <span className="block text-[11px] font-semibold leading-tight">Todo</span>
          <span className="block text-lg font-bold leading-tight">al día</span>
        </div>
      </div>
    </figure>
  );
}
