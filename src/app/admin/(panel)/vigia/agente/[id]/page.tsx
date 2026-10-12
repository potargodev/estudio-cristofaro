import { AlertTriangle, ArrowLeft, CheckCircle2, CircleDashed, FileText, ListChecks, Loader, MinusCircle, ScrollText, XCircle } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { agentTaskStateAction } from "@/app/admin/agente-actions";
import { AgentProgress } from "@/components/agente/AgentProgress";
import { LiveRefresh } from "@/components/agente/LiveRefresh";
import { Feedback } from "@/components/app/Feedback";
import { Card, EmptyState, List, ListRow, PageHeader, Panel, SubmitButton, ToneBadge } from "@/components/ds";
import type { AgentFinding, AgentPlanStep } from "@/db/schema";
import { requireTenant } from "@/lib/auth";
import { formatDate, formatUsd } from "@/lib/format";
import { SEVERITY_LABEL, TASK_STATUS } from "@/modules/agent/catalog";
import { AGENT_NAME } from "@/modules/agent/name";
import { getTask } from "@/modules/agent/server";

export const metadata = { title: "Tarea del Agente" };

const STEP_ICON = { pendiente: CircleDashed, en_curso: Loader, hecho: CheckCircle2, error: XCircle, saltado: MinusCircle } as const;
const STEP_LABEL = { pendiente: "Pendiente", en_curso: "Trabajando", hecho: "Hecho", error: "No se pudo", saltado: "Salteado" } as const;
const COUNT_LABEL = { pendiente: "pendientes", en_curso: "en curso", hecho: "listos", error: "con error", saltado: "salteados" } as const;
const SEVERITY_TONE = { alta: "danger", media: "progress", baja: "neutral" } as const;

/** Una tarea del Agente contable: plan con avance en vivo, informe, borradores y bitácora */
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const me = await requireTenant(["studio", "personal"]);
  const data = await getTask({ id: me.id, email: me.email, name: me.name, role: me.role, studioId: me.studioId, tenantKind: me.tenantKind }, id);
  if (!data) notFound();
  const { task: t, events, creator } = data;
  const st = TASK_STATUS[t.status] ?? TASK_STATUS.pendiente;
  const active = ["pendiente", "en_curso"].includes(t.status);
  const done = t.plan.filter((s) => s.status !== "pendiente" && s.status !== "en_curso").length;
  const report = t.report;
  const groups = (["alta", "media", "baja"] as const).map((sev) => ({ sev, items: report?.findings.filter((f) => f.severity === sev) ?? [] })).filter((g) => g.items.length);
  const action = (accion: string, label: string, variant: "primary" | "secondary" | "danger" = "secondary", confirm?: string) => (
    <form action={agentTaskStateAction}>
      <input type="hidden" name="id" value={t.id} />
      <input type="hidden" name="accion" value={accion} />
      <SubmitButton variant={variant} pendingText="…" confirm={confirm}>
        {label}
      </SubmitButton>
    </form>
  );
  return (
    <>
      <LiveRefresh active={active} />
      <PageHeader
        eyebrow={
          <Link href="/admin/vigia?tab=agente&vista=historial" className="inline-flex items-center gap-1 hover:text-ink">
            <ArrowLeft className="size-3.5" aria-hidden /> Vigía · {AGENT_NAME}
          </Link>
        }
        title={t.title}
        description={`Pedida ${creator ? `por ${creator} ` : ""}el ${formatDate(t.created_at, "dateTime")}${t.routine_id ? " por una rutina" : ""} · «${t.prompt}»`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ToneBadge tone={st.tone}>{st.label}</ToneBadge>
            {active && action("pausar", "Pausar")}
            {t.status === "pausada" && action("reanudar", "Reanudar", "primary")}
            {["pendiente", "en_curso", "pausada"].includes(t.status) && action("cancelar", "Cancelar", "danger", "¿Cancelar la tarea? Lo que ya hizo queda.")}
          </div>
        }
      />
      <div className="grid gap-5">
        <Feedback sp={sp} />
        {t.error && <p role="alert" className="rounded-md border border-danger/30 bg-danger/5 px-4 py-3 text-ui text-danger">{t.error}</p>}
        <Panel title="Plan" icon={ListChecks} action={<span className="text-meta text-muted">Costo de IA: <span className="num">{formatUsd(Number(t.cost_usd))}</span></span>}>
          <div className="mb-4">
            <AgentProgress done={done} total={t.plan.length} />
          </div>
          {/* Un plan largo (la cartera entera) se resume: en curso y con error a la vista, el resto plegado */}
          {t.plan.length > 12 && (
            <p className="mb-3 text-meta text-muted">
              {(["hecho", "en_curso", "pendiente", "error", "saltado"] as const)
                .map((k) => [k, t.plan.filter((s) => s.status === k).length] as const)
                .filter(([, n]) => n)
                .map(([k, n]) => `${n} ${COUNT_LABEL[k]}`)
                .join(" · ")}
            </p>
          )}
          {t.plan.length > 12 ? (
            <details className="group">
              <summary className="cursor-pointer text-ui font-medium text-ink underline-offset-4 hover:underline">Ver los {t.plan.length} pasos</summary>
              <div className="mt-3">
                <PlanSteps plan={t.plan} />
              </div>
            </details>
          ) : (
            <PlanSteps plan={t.plan} />
          )}
        </Panel>

        {report ? (
          <Panel title="Informe" icon={FileText}>
            <div className="grid gap-5">
              <p className="whitespace-pre-line text-body text-ink">{report.summary}</p>
              {groups.map((g) => (
                <section key={g.sev} aria-label={`Importancia ${SEVERITY_LABEL[g.sev].toLowerCase()}`} className="grid gap-2">
                  <h3 className="flex items-center gap-2 text-ui font-semibold">
                    <ToneBadge tone={SEVERITY_TONE[g.sev]}>
                      <AlertTriangle className="size-3.5" aria-hidden /> {SEVERITY_LABEL[g.sev]}
                    </ToneBadge>
                    <span className="num text-muted">{g.items.length}</span>
                  </h3>
                  <List>
                    {g.items.map((f: AgentFinding, i: number) => (
                      <ListRow key={i} title={f.organizationName ?? f.title} detail={f.organizationName ? `${f.title}${f.detail ? `. ${f.detail}` : ""}` : f.detail} href={f.href ?? undefined} prefetch={false} />
                    ))}
                  </List>
                </section>
              ))}
              {report.drafts.length > 0 && (
                <section aria-label="Borradores" className="grid gap-2">
                  <h3 className="text-ui font-semibold">Borradores en Propuestas para aprobar</h3>
                  <List>
                    {report.drafts.map((d, i) => (
                      <ListRow key={i} icon={FileText} title={d.title} href={d.href ?? undefined} prefetch={false} />
                    ))}
                  </List>
                </section>
              )}
              {report.tasks.length > 0 && (
                <section aria-label="Tareas del equipo" className="grid gap-2">
                  <h3 className="text-ui font-semibold">Tareas que dejó al equipo</h3>
                  <List>
                    {report.tasks.map((x, i) => (
                      <ListRow key={i} icon={ListChecks} title={x.title} href="/admin/tareas" prefetch={false} />
                    ))}
                  </List>
                </section>
              )}
            </div>
          </Panel>
        ) : (
          <Card>
            <EmptyState icon={FileText} title={active ? "Trabajando…" : "Sin informe"} text={active ? "El informe aparece acá cuando termine. Podés irte: te avisamos." : "La tarea terminó sin informe."} />
          </Card>
        )}

        <Panel title="Bitácora de la tarea" icon={ScrollText}>
          {events.length ? (
            <ol className="grid gap-2">
              {events.map((e) => (
                <li key={e.id} className="flex gap-3 text-meta">
                  <span className="num shrink-0 text-muted">{formatDate(e.created_at, "timestamp").slice(11)}</span>
                  <span className={e.kind === "error" ? "text-danger" : "text-ink"}>{e.text}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-ui text-muted">Todavía no hay movimientos.</p>
          )}
        </Panel>
      </div>
    </>
  );
}

function PlanSteps({ plan }: { plan: AgentPlanStep[] }) {
  return (
    <ol className="grid gap-2">
      {plan.map((s) => {
        const Icon = STEP_ICON[s.status];
        return (
          <li key={s.id} className="flex items-start gap-2.5 text-ui">
            <Icon className={`mt-0.5 size-4 shrink-0 ${s.status === "hecho" ? "text-[#1f5f36]" : s.status === "error" ? "text-danger" : "text-muted"} ${s.status === "en_curso" ? "motion-safe:animate-spin" : ""}`} aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="text-ink">{s.title}</span>
              <span className="sr-only"> · {STEP_LABEL[s.status]}</span>
              {s.detail && <span className="block text-meta text-muted">{s.detail}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
