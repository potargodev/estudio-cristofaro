import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/kit/PageHeader";
import { Feedback } from "@/components/app/Feedback";
import { requireOperator } from "@/lib/auth";
import { getFlow, runView } from "@/modules/flows/engine";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Corrida" };
const ST: Record<string, string> = { ok: "Listo", error: "Error", esperando: "Esperando", rechazado: "Rechazado", saltado: "Salteado" };

/** Registro paso a paso de una corrida */
export default async function Page({ params, searchParams }: { params: Promise<{ id: string; runId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const [{ id, runId }, sp] = await Promise.all([params, searchParams]);
  const me = await requireOperator();
  const [f, v] = await Promise.all([getFlow(me.studioId, id), runView(me.studioId, runId)]);
  if (!f || !v || v.r.flow_id !== f.id) notFound();
  return (
    <>
      <PageHeader
        eyebrow={
          <Link href={`/admin/vigia/flujos/${f.id}`} className="inline-flex items-center gap-1 hover:text-ink">
            <ArrowLeft className="size-3.5" aria-hidden /> {f.name}
          </Link>
        }
        title="Corrida"
        description={`${v.r.status} · ${v.r.source} · ${formatDate(v.r.created_at, "timestamp")}${v.r.attempts ? ` · ${v.r.attempts} reintento${v.r.attempts === 1 ? "" : "s"}` : ""}`}
      />
      <div className="grid gap-4">
        <Feedback sp={sp} />
        {v.r.error && <p className="rounded-md border border-[#efc4bd] bg-[#fbecea] px-4 py-3 text-ui text-[#8f2a1c]">{v.r.error}</p>}
        {v.r.status === "esperando" && v.r.waiting_approval_id && (
          <p className="rounded-md border border-line bg-surface px-4 py-3 text-ui">
            Esperando una decisión en <Link href="/admin/vigia?tab=propuestas" className="underline">Propuestas para aprobar</Link>.
          </p>
        )}
        <ol className="grid gap-2">
          {v.steps.map((s) => (
            <li key={s.id} className="rounded-md border border-line bg-surface p-3 text-meta">
              <p className="flex flex-wrap justify-between gap-2">
                <span className="font-medium">
                  {s.kind} · {s.node_id}
                </span>
                <span className={s.status === "error" || s.status === "rechazado" ? "text-[#8f2a1c]" : "text-muted"}>
                  {ST[s.status] ?? s.status} · {formatDate(s.started_at, "time")}
                  {s.attempt > 1 ? ` · intento ${s.attempt}` : ""}
                </span>
              </p>
              {s.error && <p className="mt-1 text-[#8f2a1c]">{s.error}</p>}
              {s.output != null && <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all text-micro text-muted">{JSON.stringify(s.output, null, 1).slice(0, 1200)}</pre>}
            </li>
          ))}
        </ol>
        <details className="text-caption text-muted">
          <summary className="cursor-pointer">Datos de la corrida</summary>
          <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all">{JSON.stringify(v.r.context, null, 1).slice(0, 4000)}</pre>
        </details>
      </div>
    </>
  );
}
