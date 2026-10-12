import { Workflow } from "lucide-react";
import Link from "next/link";
import { createFlowAction } from "@/app/admin/flujos-actions";
import { SubmitButton } from "@/components/admin/ui";
import { Feedback } from "@/components/app/Feedback";
import type { StaffUser } from "@/lib/auth";
import { getEntitlements, hasModule, limitUsage } from "@/lib/faro/entitlements";
import { EVENTS, TEMPLATES } from "@/modules/flows/core";
import { listFlows } from "@/modules/flows/engine";
import { formatDate } from "@/lib/format";

// Pestaña «Automatizaciones» del Vigía (§2.o): los flujos del estudio, las
// plantillas listas y armar uno desde una frase.

const STATUS: Record<string, { label: string; tone: string }> = { borrador: { label: "Borrador", tone: "text-muted" }, activo: { label: "Activo", tone: "text-[#1f6b3d]" }, pausado: { label: "Pausado", tone: "text-[#7a5410]" } };
const TRIGGER: Record<string, string> = { horario: "Por horario", webhook: "Webhook entrante", vigia: "Pedido al Vigía" };

export async function FlowsTab({ user, sp }: { user: StaffUser; sp: Record<string, string | undefined> }) {
  if (!(await hasModule(user.studioId, "flows"))) return <p className="rounded-md border border-line bg-surface p-4 text-ui">Los flujos no están incluidos en el plan.</p>;
  const [list, e, active] = await Promise.all([listFlows(user.studioId), getEntitlements(user.studioId), limitUsage(user.studioId, "flows")]);
  const max = e?.limits.flows ?? null;
  return (
    <div className="grid gap-5">
      <Feedback sp={sp} />
      <form action={createFlowAction} className="grid gap-2 rounded-md border border-line bg-surface p-4">
        <label className="text-ui font-medium" htmlFor="frase">
          Contale al Vigía qué querés automatizar
        </label>
        <div className="flex flex-wrap gap-2">
          <input id="frase" name="frase" required minLength={8} placeholder="Ej.: cada vez que entre una factura de proveedor, avisale a administración" className="h-10 min-w-0 flex-1 rounded-md border border-line bg-surface px-3 text-ui" />
          <SubmitButton pendingText="Armando…">Armar el flujo</SubmitButton>
        </div>
        <p className="text-caption text-muted">Queda en borrador: lo revisás en el canvas y lo activás. Lo sensible siempre pasa por Aprobaciones.</p>
      </form>
      <section aria-label="Tus flujos" className="grid gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lead font-semibold">Tus flujos</h2>
          <span className="text-meta text-muted">
            <span className="num">{active}</span>
            {max != null && (
              <>
                {" "}de <span className="num">{max}</span>
              </>
            )}{" "}
            activos
          </span>
        </div>
        {list.length === 0 ? (
          <p className="text-ui text-muted">Todavía no tenés flujos. Empezá con una plantilla.</p>
        ) : (
          <ul className="divide-y divide-line rounded-md border border-line bg-surface">
            {list.map((f) => (
              <li key={f.id}>
                <Link href={`/admin/vigia/flujos/${f.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-canvas">
                  <Workflow className="size-4 shrink-0 text-muted" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-ui font-medium">{f.name}</span>
                    <span className="text-caption text-muted">
                      {f.trigger_type === "evento" ? (EVENTS[f.trigger_event ?? ""]?.label ?? f.trigger_event) : TRIGGER[f.trigger_type]}
                      {f.last_run_at && ` · última corrida ${formatDate(f.last_run_at, "numericTime")}`}
                    </span>
                  </span>
                  <span className={`text-meta ${STATUS[f.status]?.tone}`}>{STATUS[f.status]?.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-label="Plantillas" className="grid gap-2">
        <h2 className="text-lead font-semibold">Plantillas</h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {TEMPLATES.map((t) => (
            <li key={t.key} className="flex flex-col gap-2 rounded-md border border-line bg-surface p-4">
              <p className="text-ui font-medium">{t.name}</p>
              <p className="flex-1 text-meta text-muted">{t.description}</p>
              <form action={createFlowAction}>
                <input type="hidden" name="template" value={t.key} />
                <SubmitButton variant="secondary" pendingText="…">Usar «{t.name}»</SubmitButton>
              </form>
            </li>
          ))}
        </ul>
        <form action={createFlowAction}>
          <SubmitButton variant="secondary" pendingText="…">Flujo en blanco</SubmitButton>
        </form>
      </section>
    </div>
  );
}
