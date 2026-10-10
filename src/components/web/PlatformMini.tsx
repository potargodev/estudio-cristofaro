import type { PlatformTabKey } from "@/lib/platform";

/** Mini preview de cada pantalla de la plataforma (mega menú) */
export function PlatformMini({ tab }: { tab: PlatformTabKey }) {
  const row = "flex items-center justify-between border-b border-hair py-1.5 text-[10px] text-paper/70";
  return (
    <div aria-hidden className="h-28 border border-hair bg-night p-3">
      {tab === "este-mes" && (
        <div className="flex h-full items-center gap-3">
          <svg viewBox="0 0 40 40" className="size-14 -rotate-90">
            <circle cx="20" cy="20" r="16" fill="none" stroke="rgb(247 245 243 / .1)" strokeWidth="3" />
            <circle cx="20" cy="20" r="16" fill="none" stroke="var(--color-rose-light)" strokeWidth="3" strokeDasharray="80 101" />
          </svg>
          <div className="space-y-1.5">
            <p className="font-display text-xl leading-none text-paper">8/10</p>
            <p className="text-[10px] text-paper/60">resuelto</p>
            <div className="h-px w-16 bg-hair-strong" />
          </div>
        </div>
      )}
      {tab === "vencimientos" && (
        <div>
          {["IVA septiembre", "Ganancias anticipo 5", "IIBB CABA"].map((t, i) => (
            <p key={t} className={row}>
              <span>{t}</span>
              <span className={i === 0 ? "text-rose-light" : ""}>{["20/10", "13/10", "16/10"][i]}</span>
            </p>
          ))}
        </div>
      )}
      {tab === "documentos" && (
        <div className="flex h-full flex-col gap-2">
          <div className="grid flex-1 place-items-center border border-dashed border-hair-strong text-[10px] text-paper/55">Soltá tus comprobantes</div>
          <p className="text-[10px] text-rose-light">factura-proveedor.pdf · para confirmar</p>
        </div>
      )}
      {tab === "solicitudes" && (
        <div className="flex h-full flex-col justify-center gap-2 text-[10px]">
          <p className="ml-auto max-w-[80%] bg-paper/10 px-2 py-1 text-paper/80">Incorporamos una diseñadora el lunes 14.</p>
          <p className="max-w-[85%] border-l border-rose-light px-2 py-1 text-paper/70">Solicitud creada: alta de empleada.</p>
        </div>
      )}
    </div>
  );
}
