import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteFlowAction, flowStatusAction, testFlowAction } from "@/app/admin/flujos-actions";
import { PageHeader } from "@/components/admin/kit/PageHeader";
import { SubmitButton } from "@/components/admin/ui";
import { Feedback } from "@/components/app/Feedback";
import { FlowEditor } from "@/components/flujos/FlowEditor";
import { requireOperator } from "@/lib/auth";
import { getSiteUrl } from "@/lib/runtime-config";
import { validateGraph, type Graph } from "@/modules/flows/core";
import { availableTools, EVENT_LIST, getFlow, listRuns } from "@/modules/flows/engine";

export const metadata = { title: "Flujo" };

const RUN: Record<string, string> = { pendiente: "En cola", en_curso: "En curso", esperando: "Esperando", completada: "Completada", error: "Con error", cancelada: "Cancelada", rechazada: "Rechazada en Aprobaciones" };
const STATUS: Record<string, string> = { borrador: "Borrador", activo: "Activo", pausado: "Pausado" };

/** Un flujo: canvas, estado (activar, pausar, reanudar), prueba, webhook y corridas */
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const me = await requireOperator();
  const f = await getFlow(me.studioId, id);
  if (!f) notFound();
  const [tools, runs] = await Promise.all([availableTools(me.studioId), listRuns(me.studioId, f.id)]);
  const graph = f.graph as unknown as Graph;
  const issues = validateGraph(graph, new Set(tools.map((t) => t.name)));
  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/admin/vigia?tab=automatizaciones" className="inline-flex items-center gap-1 hover:text-ink">
            <ArrowLeft className="size-3.5" aria-hidden /> Vigía · Automatizaciones
          </Link>
        }
        title={f.name}
        description={`${STATUS[f.status]} · versión ${f.version}${f.description ? ` · ${f.description}` : ""}`}
      />
      <div className="grid gap-5">
        <Feedback sp={sp} />
        <div className="flex flex-wrap items-center gap-2">
          {f.status !== "activo" ? (
            <form action={flowStatusAction}>
              <input type="hidden" name="id" value={f.id} />
              <input type="hidden" name="status" value="activo" />
              <SubmitButton pendingText="…">{f.status === "pausado" ? "Reanudar" : "Activar"}</SubmitButton>
            </form>
          ) : (
            <form action={flowStatusAction}>
              <input type="hidden" name="id" value={f.id} />
              <input type="hidden" name="status" value="pausado" />
              <SubmitButton variant="secondary" pendingText="…">Pausar</SubmitButton>
            </form>
          )}
          <form action={testFlowAction} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="id" value={f.id} />
            <input name="datos" aria-label="Datos de prueba (JSON)" placeholder='{"organizacion_id": "…", "total": 1500}' className="h-9 w-64 rounded-md border border-line bg-surface px-2 font-mono text-[12px]" />
            <SubmitButton variant="secondary" pendingText="…">Probar</SubmitButton>
          </form>
          <form action={deleteFlowAction} className="ml-auto">
            <input type="hidden" name="id" value={f.id} />
            <SubmitButton variant="danger" pendingText="…" confirm="¿Borrar el flujo y sus corridas?" confirmLabel="Borrar">
              Borrar
            </SubmitButton>
          </form>
        </div>
        {issues.length > 0 && (
          <ul role="alert" className="grid gap-1 rounded-md border border-[#ecd6a8] bg-[#fbf3e2] px-4 py-3 text-[13px] text-[#7a5410]">
            {issues.map((i, k) => (
              <li key={k}>{i.message}</li>
            ))}
          </ul>
        )}
        {f.trigger_type === "webhook" && (
          <p className="break-all rounded-md border border-line bg-surface p-3 text-[13px]">
            {f.webhook_token ? (
              <>
                URL del webhook (POST con JSON): <code>{`${getSiteUrl()}/api/flujos/webhook/${f.webhook_token}`}</code>
              </>
            ) : (
              "Activá el flujo para obtener la URL del webhook."
            )}
          </p>
        )}
        <FlowEditor id={f.id} name={f.name} graph={graph as never} events={EVENT_LIST} tools={tools} />
        <section aria-label="Corridas" className="grid gap-2">
          <h2 className="text-[16px] font-semibold">Corridas</h2>
          {runs.length === 0 ? (
            <p className="text-[14px] text-muted">Todavía no corrió.</p>
          ) : (
            <ul className="divide-y divide-line rounded-md border border-line bg-surface">
              {runs.map((r) => (
                <li key={r.id}>
                  <Link href={`/admin/vigia/flujos/${f.id}/corridas/${r.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-[14px] hover:bg-canvas">
                    <span>
                      {r.created_at.toLocaleString("es-AR", { dateStyle: "short", timeStyle: "medium" })} · {r.source}
                    </span>
                    <span className={r.status === "error" || r.status === "rechazada" ? "text-[#8f2a1c]" : r.status === "completada" ? "text-[#1f6b3d]" : "text-muted"}>{RUN[r.status] ?? r.status}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
