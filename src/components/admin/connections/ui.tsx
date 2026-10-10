import { Notice } from "@/components/admin/AdminField";
import { StatusBadge } from "@/components/admin/kit/StatusBadge";
import type { connection_logs } from "@/db/schema";
import type { ConnectorDefinition } from "@/modules/connectors/catalog";
import { cn } from "@/lib/utils";

export const fmtDate = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "America/Argentina/Buenos_Aires" });
export const when = (d: Date | null | undefined) => (d ? fmtDate.format(d) : "Nunca");

/** Monograma del conector (sin logos de terceros embebidos) */
export function ConnectorLogo({ def, size = "md" }: { def: Pick<ConnectorDefinition, "logo" | "name">; size?: "md" | "lg" }) {
  return (
    <span
      aria-hidden
      className={cn("grid shrink-0 place-items-center font-semibold tracking-tight", size === "lg" ? "size-12 text-[18px]" : "size-10 text-[15px]")}
      style={{ background: def.logo.bg, color: def.logo.fg }}
    >
      {def.logo.text}
    </span>
  );
}

const STATE: Record<string, { key: string; label: string }> = {
  activa: { key: "activa", label: "Conectada" },
  conectada: { key: "activa", label: "Conectada" },
  error: { key: "vencido", label: "Con error" },
  pausada: { key: "pausada", label: "Pausada" },
  pendiente: { key: "pendiente", label: "Sin probar" },
  sin_configurar: { key: "pendiente", label: "Sin configurar" },
};

export function ConnectionState({ state }: { state: string }) {
  const s = STATE[state] ?? { key: state, label: state };
  return <StatusBadge status={s.key} label={s.label} />;
}

/** Mensajes ?ok= / ?error= que dejan las actions */
export function Flash({ sp }: { sp: Record<string, string | undefined> }) {
  return (
    <>
      {sp.ok && <Notice>{sp.ok}</Notice>}
      {sp.error && <Notice tone="error">{sp.error}</Notice>}
    </>
  );
}

export function LogTable({ logs }: { logs: (typeof connection_logs.$inferSelect)[] }) {
  if (!logs.length) return <p className="text-[14px] text-muted">Todavía no hay pruebas ni sincronizaciones.</p>;
  const KIND: Record<string, string> = { sync: "Sincronización", test: "Prueba", import: "Importación" };
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-left text-[13px]">
        <thead className="text-[12px] uppercase tracking-wide text-muted">
          <tr className="border-b border-line">
            <th className="py-2 font-medium">Fecha</th>
            <th className="py-2 font-medium">Tipo</th>
            <th className="py-2 font-medium">Estado</th>
            <th className="py-2 text-right font-medium">Registros</th>
            <th className="py-2 pl-4 font-medium">Detalle</th>
          </tr>
        </thead>
        <tbody className="tabular">
          {logs.map((l) => (
            <tr key={l.id} className="border-b border-line align-top last:border-0">
              <td className="py-2 whitespace-nowrap">{fmtDate.format(l.started_at)}</td>
              <td className="py-2">{KIND[l.kind] ?? l.kind}</td>
              <td className="py-2">
                <StatusBadge status={l.status === "ok" ? "resuelta" : l.status === "error" ? "vencido" : "en_curso"} label={l.status === "ok" ? "OK" : l.status === "error" ? "Error" : "En curso"} />
              </td>
              <td className="py-2 text-right">{l.records}</td>
              <td className="py-2 pl-4 text-ink/80">{l.message}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
