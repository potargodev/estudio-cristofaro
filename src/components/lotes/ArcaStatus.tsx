import { Activity } from "lucide-react";
import { Panel, ToneBadge } from "@/components/ds";
import { formatDate } from "@/lib/format";
import { healthHistory } from "@/modules/arca/queue";

// Estado de ARCA (§2.p, B5): el último FEDummy, la disponibilidad de las
// últimas 24 horas y, con `full`, el historial. Lo usan el panel de
// facturación, el Faro Manager y la página /estado.

export async function ArcaStatus({ env, full = false, queued = 0 }: { env: "homologacion" | "produccion" | "simulador"; full?: boolean; queued?: number }) {
  const h = await healthHistory(env, 24);
  const last = h.last;
  const label = !last ? "Sin datos todavía" : last.ok ? "Funcionando" : "Con problemas";
  return (
    <Panel title={`Estado de ARCA (${env === "produccion" ? "producción" : "homologación"})`} icon={Activity}>
      <div className="flex flex-wrap items-center gap-3 text-ui">
        <ToneBadge tone={!last ? "neutral" : last.ok ? "ok" : "danger"}>{label}</ToneBadge>
        {last && <span className="text-meta text-muted">Último chequeo: {formatDate(last.checked_at, "numericTime")}{last.latency_ms != null ? ` · ${last.latency_ms} ms` : ""}</span>}
        {h.uptime != null && <span className="text-meta text-muted">Últimas 24 h: <span className="num">{Math.round(h.uptime * 1000) / 10} %</span> de chequeos OK</span>}
        {queued > 0 && <ToneBadge tone="progress">{queued} en cola</ToneBadge>}
      </div>
      {last && !last.ok && last.error && <p className="mt-2 text-meta text-danger">{last.error}</p>}
      {full && h.rows.length > 0 && (
        <ol className="mt-3 grid max-h-72 gap-1 overflow-y-auto text-meta">
          {h.rows.slice(0, 100).map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 border-b border-line py-1 last:border-0">
              <span className={r.ok ? "text-ok" : "text-danger"}>{r.ok ? "OK" : "Caído"}</span>
              <span className="num text-muted">{formatDate(r.checked_at, "numericTime")}</span>
              <span className="text-muted">
                App {r.app ?? "—"} · Base {r.db ?? "—"} · Autenticación {r.auth ?? "—"}
                {r.latency_ms != null ? ` · ${r.latency_ms} ms` : ""}
              </span>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
