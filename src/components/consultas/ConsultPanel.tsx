import { Sparkles } from "lucide-react";
import { SubmitButton } from "@/components/admin/ui";
import { approveConsultAction, discardConsultAction, redraftConsultAction } from "@/app/admin/consultas-actions";
import { CONSULT_STATUS, CONSULT_TOPICS, isTopic, type ConsultStatus } from "@/modules/ai-consults/core";
import type { AiConsult } from "@/modules/ai-consults/server";

const when = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires" });

/** Borrador de la IA para una consulta: el estudio lo edita y lo aprueba (o lo descarta) */
export function ConsultPanel({ c, volver, reviewer }: { c: AiConsult; volver: string; reviewer?: string | null }) {
  const topic = isTopic(c.topic) ? CONSULT_TOPICS[c.topic] : c.topic;
  const open = c.status === "borrador" || c.status === "error";
  return (
    <section aria-label="Respuesta preparada por la IA" className="mb-4 rounded-md border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-body font-semibold text-ink">
          <Sparkles className="size-4 text-rose-deep" aria-hidden /> Consulta {topic.toLowerCase()} · respuesta preparada por la IA
        </h2>
        <span className="text-caption text-muted">{CONSULT_STATUS[c.status as ConsultStatus] ?? c.status}</span>
      </div>
      {c.status === "generando" && <p className="mt-2 text-ui text-muted">La IA está preparando el borrador. Recargá en unos segundos.</p>}
      {c.status === "error" && <p className="mt-2 text-ui text-[#8f2a1c]">{c.error}</p>}
      {open && (
        <form action={approveConsultAction} className="mt-3 grid gap-3">
          <input type="hidden" name="id" value={c.id} />
          <input type="hidden" name="volver" value={volver} />
          <label className="text-meta text-muted">
            Revisá y editá antes de enviar. El cliente recibe solo lo que apruebes.
            <textarea name="body" rows={8} defaultValue={c.draft ?? ""} required minLength={5} maxLength={5000} className="mt-1 block w-full rounded-md border border-line bg-canvas px-3 py-2 text-ui leading-relaxed text-ink" />
          </label>
          <label className="flex items-center gap-2 text-meta text-ink">
            <input type="checkbox" name="resolve" /> Marcar la solicitud como resuelta
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <SubmitButton pendingText="Enviando…">Aprobar y enviar</SubmitButton>
            {c.model && <span className="text-caption text-muted">Modelo: {c.model}</span>}
          </div>
        </form>
      )}
      {open && (
        <div className="mt-2 flex flex-wrap gap-2">
          {[
            { action: redraftConsultAction, label: "Volver a generar", variant: "secondary" as const, pending: "Preparando…" },
            { action: discardConsultAction, label: "Descartar borrador", variant: "danger" as const, pending: "…" },
          ].map((b) => (
            <form key={b.label} action={b.action}>
              <input type="hidden" name="id" value={c.id} />
              <input type="hidden" name="volver" value={volver} />
              <SubmitButton variant={b.variant} pendingText={b.pending}>
                {b.label}
              </SubmitButton>
            </form>
          ))}
        </div>
      )}
      {c.status === "aprobada" && (
        <p className="mt-2 text-meta text-muted">
          Enviada{reviewer ? ` por ${reviewer}` : ""}
          {c.reviewed_at ? ` el ${when.format(c.reviewed_at)}` : ""}
          {c.edited ? " · con cambios sobre el borrador" : " · sin cambios"}.
        </p>
      )}
      {c.status === "descartada" && <p className="mt-2 text-meta text-muted">El borrador se descartó; la respuesta se escribe a mano en la conversación.</p>}
    </section>
  );
}
