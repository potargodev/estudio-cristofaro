import { BrainCircuit, CalendarClock, History, ListChecks, NotebookPen, Plus, ShieldCheck } from "lucide-react";
import { createAgentTaskAction, deleteMemoryAction, routineStateAction, saveMemoryAction, saveRoutineAction, setAutomationAction } from "@/app/admin/agente-actions";
import { Feedback } from "@/components/app/Feedback";
import { Card, EmptyState, Field, FormCheckbox, FormSelect, Input, List, ListRow, MetricCard, Panel, SectionTitle, SubmitButton, Tag, Textarea, ToneBadge, ViewSwitch } from "@/components/ds";
import { getDb } from "@/db";
import { organizations } from "@/db/schema";
import type { StaffUser } from "@/lib/auth";
import { getEntitlements } from "@/lib/faro/entitlements";
import { formatDate, formatUsd, todayAR } from "@/lib/format";
import { AUTOMATABLE, canSwitch, listAutomations } from "@/modules/agent/automations";
import { getTemplate, TASK_STATUS } from "@/modules/agent/catalog";
import { AGENT_NAME, AGENT_SHORT } from "@/modules/agent/name";
import { scheduleLabel, parseSchedule } from "@/modules/agent/routines";
import { agentAccess, listMemory, listRoutines, listTasks, monthUsage, templatesFor, type AgentActor } from "@/modules/agent/server";
import { and, asc, eq, inArray } from "drizzle-orm";
import { AgentProgress } from "./AgentProgress";

// Pestaña «Agente» del Vigía (§2.o regla 5, §2.q): el Vigía es la carga
// rápida; el Agente contable recibe tareas de varios pasos y trabaja solo.

type View = "nueva" | "en_curso" | "historial" | "rutinas" | "memoria";
const VIEWS: { key: View; label: string; hint: string }[] = [
  { key: "nueva", label: "Nueva tarea", hint: "Contale qué necesitás o elegí una tarea frecuente. Trabaja en segundo plano y te avisa cuando termina." },
  { key: "en_curso", label: "En curso", hint: "Lo que está haciendo ahora. Podés pausar o cancelar entre pasos." },
  { key: "historial", label: "Historial", hint: "Cada tarea con su informe, sus borradores y las tareas que dejó al equipo." },
  { key: "rutinas", label: "Rutinas", hint: "Tareas que se crean solas según un calendario, con el resumen por la app, mail o WhatsApp." },
  { key: "memoria", label: "Memoria", hint: "Criterios del contador que el Agente tiene en cuenta en cada organización. Los ves y los editás." },
];

export async function AgentTab({ user, sp, base }: { user: StaffUser; sp: Record<string, string | undefined>; base: string }) {
  const actor: AgentActor = { id: user.id, email: user.email, name: user.name, role: user.role, studioId: user.studioId, tenantKind: user.tenantKind };
  const access = await agentAccess(actor);
  if (!access.ok)
    return (
      <Card>
        <EmptyState icon={BrainCircuit} title={access.reason === "plan" ? `El ${AGENT_NAME} no está en tu plan` : `Tu rol no usa el ${AGENT_NAME}`} text={access.reason === "plan" ? "Está en los planes Profesional y Avanzado (y en Autónomos Pro). Podés pedir el cambio en Plan y facturación." : undefined} action={access.reason === "plan" ? { href: user.tenantKind === "studio" ? "/admin/configuracion/plan" : "/personal/plan", label: "Ver los planes" } : undefined} />
      </Card>
    );
  const view = (VIEWS.find((v) => v.key === sp.vista)?.key ?? "nueva") as View;
  const href = (v: View) => `${base}${base.includes("?") ? "&" : "?"}vista=${v}`;
  const [running, e, usage] = await Promise.all([listTasks(actor, "en_curso", 50), getEntitlements(user.studioId), monthUsage(user.studioId)]);
  const max = e?.limits.agentTasksPerMonth ?? null;
  const studio = user.tenantKind === "studio";
  const orgs = studio ? await getDb().select({ id: organizations.id, name: organizations.name }).from(organizations).where(and(eq(organizations.studio_id, user.studioId), inArray(organizations.status, ["onboarding", "activa", "pausada"]))).orderBy(asc(organizations.name)) : [];

  return (
    <div className="grid gap-5">
      <Feedback sp={sp} />
      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard icon={ListChecks} label="Tareas este mes" value={usage.tasks} suffix={max != null ? ` de ${max}` : undefined} />
        <MetricCard icon={BrainCircuit} label="En curso" value={running.length} />
        <MetricCard icon={History} label="Costo de IA del mes" value={usage.usd} display={formatUsd(usage.usd)} />
      </div>
      <ViewSwitch label={`Vistas del ${AGENT_SHORT}`} views={VIEWS.map((v) => ({ href: href(v.key), label: v.label, active: v.key === view, count: v.key === "en_curso" ? running.length : undefined, hint: v.hint }))} />
      {view === "nueva" && <NewTask actor={actor} orgs={orgs} sp={sp} base={base} />}
      {view === "en_curso" && <TaskList rows={running} empty="No hay tareas en curso." />}
      {view === "historial" && <TaskList rows={await listTasks(actor, "historial", 60)} empty="Todavía no terminó ninguna tarea." />}
      {view === "rutinas" && <Routines actor={actor} orgs={orgs} />}
      {view === "memoria" && <Memory actor={actor} orgs={orgs} />}
    </div>
  );
}

function NewTask({ actor, orgs, sp, base }: { actor: AgentActor; orgs: { id: string; name: string }[]; sp: Record<string, string | undefined>; base: string }) {
  const templates = templatesFor(actor.tenantKind);
  const chosen = getTemplate(sp.plantilla ?? "");
  const studio = actor.tenantKind === "studio";
  const month = todayAR().slice(0, 7);
  return (
    <div className="grid gap-5">
      <Panel title="Nueva tarea" icon={Plus}>
        <form action={createAgentTaskAction} className="grid gap-4">
          <Field label="¿Qué necesitás?" htmlFor="pedido" hint={chosen ? `Elegiste «${chosen.title}». Podés sumar detalles o dejarlo así.` : "Por ejemplo: «Cerrá octubre de Agencia Norte» o «¿Qué clientes están cerca del tope del monotributo?»."}>
            <Textarea id="pedido" name="pedido" rows={3} maxLength={1000} placeholder={chosen?.example ?? templates[0]?.example} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tarea" htmlFor="plantilla" hint="Si la dejás en automático, la elige según el pedido.">
              <FormSelect id="plantilla" name="plantilla" defaultValue={chosen?.key ?? ""} options={[{ value: "", label: "Automático (según el pedido)" }, ...templates.map((t) => ({ value: t.key, label: t.title }))]} />
            </Field>
            {studio && (
              <Field label="Sobre" htmlFor="alcance">
                <FormSelect id="alcance" name="alcance" defaultValue="" options={[{ value: "", label: "Según el pedido" }, { value: "organizacion", label: "Una organización" }, { value: "cartera", label: "Toda la cartera" }]} />
              </Field>
            )}
            {studio && (
              <Field label="Organización" htmlFor="organizacion" hint="Para las tareas sobre una sola.">
                <FormSelect id="organizacion" name="organizacion" defaultValue="" options={[{ value: "", label: "—" }, ...orgs.map((o) => ({ value: o.id, label: o.name }))]} />
              </Field>
            )}
            <Field label="Período" htmlFor="periodo" hint="Si no lo elegís, lo toma del pedido (o el mes que corresponda).">
              <Input id="periodo" name="periodo" type="month" max={month} />
            </Field>
          </div>
          <p className="text-meta text-muted">Lo sensible (mensajes a clientes, datos fiscales, pagos) queda en Propuestas para aprobar, salvo lo que hayas automatizado en Rutinas. Son datos y borradores: no reemplazan el criterio de un contador.</p>
          <div>
            <SubmitButton pendingText="Armando el plan…">Encargar la tarea</SubmitButton>
          </div>
        </form>
      </Panel>
      <section aria-labelledby="frecuentes" className="grid gap-3">
        <SectionTitle id="frecuentes">Tareas frecuentes</SectionTitle>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => (
            <Card as="li" key={t.key} className="flex flex-col gap-2">
              <p className="text-ui font-medium text-ink">{t.title}</p>
              <p className="flex-1 text-meta text-muted">{t.description}</p>
              <p className="text-caption text-muted">«{t.example}»</p>
              <a href={`${base}${base.includes("?") ? "&" : "?"}vista=nueva&plantilla=${t.key}#pedido`} className="text-ui font-medium text-ink underline underline-offset-4">
                Usar esta tarea
              </a>
            </Card>
          ))}
        </ul>
      </section>
    </div>
  );
}

type TaskRow = Awaited<ReturnType<typeof listTasks>>[number];

function TaskList({ rows, empty }: { rows: TaskRow[]; empty: string }) {
  if (!rows.length)
    return (
      <Card>
        <EmptyState icon={ListChecks} title={empty} text="Encargá una tarea desde «Nueva tarea»." />
      </Card>
    );
  return (
    <List label="Tareas">
      {rows.map((t) => {
        const done = t.plan.filter((s) => s.status !== "pendiente" && s.status !== "en_curso").length;
        const st = TASK_STATUS[t.status] ?? TASK_STATUS.pendiente;
        const high = t.report?.findings.filter((f) => f.severity === "alta").length ?? 0;
        return (
          <ListRow
            key={t.id}
            href={`/admin/vigia/agente/${t.id}`}
            icon={t.routine_id ? CalendarClock : History}
            title={t.title}
            detail={
              <span className="grid gap-1.5">
                <span>
                  {formatDate(t.created_at, "dateTime")}
                  {t.report ? ` · ${t.report.findings.length} hallazgos${high ? ` (${high} de importancia alta)` : ""} · ${t.report.drafts.length} borradores` : ""}
                </span>
                {["pendiente", "en_curso", "pausada"].includes(t.status) && <AgentProgress done={done} total={t.plan.length} />}
              </span>
            }
            aside={<ToneBadge tone={st.tone}>{st.label}</ToneBadge>}
          />
        );
      })}
    </List>
  );
}

const WEEK = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

async function Routines({ actor, orgs }: { actor: AgentActor; orgs: { id: string; name: string }[] }) {
  const [rows, switches] = await Promise.all([listRoutines(actor), listAutomations(actor.studioId)]);
  const manage = canSwitch(actor.role);
  const studio = actor.tenantKind === "studio";
  const templates = templatesFor(actor.tenantKind).filter((t) => t.routine);
  return (
    <div className="grid gap-5">
      {rows.length ? (
        <List label="Rutinas">
          {rows.map(({ r, org }) => {
            const s = parseSchedule(r.schedule);
            return (
              <ListRow
                key={r.id}
                icon={CalendarClock}
                title={r.name}
                detail={`${s ? scheduleLabel(s) : "Calendario inválido"} · ${r.scope === "organizacion" ? org : r.scope === "cartera" ? "toda la cartera" : "tu cuenta"} · aviso por ${r.channels.join(", ")}${r.next_run_at && r.status === "activa" ? ` · próxima: ${formatDate(r.next_run_at, "dateTime")}` : ""}`}
                aside={
                  manage ? (
                    <span className="flex flex-wrap gap-2">
                      <form action={routineStateAction}>
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="accion" value={r.status === "activa" ? "pausar" : "activar"} />
                        <SubmitButton variant="secondary" pendingText="…">{r.status === "activa" ? "Pausar" : "Activar"}</SubmitButton>
                      </form>
                      <form action={routineStateAction}>
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="accion" value="borrar" />
                        <SubmitButton variant="danger" pendingText="…" confirm={`¿Borrar la rutina «${r.name}»?`}>Borrar</SubmitButton>
                      </form>
                    </span>
                  ) : (
                    <Tag>{r.status === "activa" ? "Activa" : "Pausada"}</Tag>
                  )
                }
              />
            );
          })}
        </List>
      ) : (
        <Card>
          <EmptyState icon={CalendarClock} title="Todavía no hay rutinas" text="Por ejemplo: el cierre de cada cliente el día 5 o la revisión de IVA 3 días antes del vencimiento." />
        </Card>
      )}
      {manage && (
        <Panel title="Nueva rutina" icon={Plus}>
          <form action={saveRoutineAction} className="grid gap-4 sm:grid-cols-2">
            <Field label="Nombre" htmlFor="nombre">
              <Input id="nombre" name="nombre" maxLength={120} placeholder="Cierre mensual de la cartera" />
            </Field>
            <Field label="Tarea" htmlFor="r-plantilla">
              <FormSelect id="r-plantilla" name="plantilla" defaultValue={templates[0]?.key} options={templates.map((t) => ({ value: t.key, label: t.title }))} />
            </Field>
            {studio && (
              <Field label="Sobre" htmlFor="r-alcance">
                <FormSelect id="r-alcance" name="alcance" defaultValue="cartera" options={[{ value: "cartera", label: "Toda la cartera" }, { value: "organizacion", label: "Una organización" }]} />
              </Field>
            )}
            {studio && (
              <Field label="Organización" htmlFor="r-organizacion">
                <FormSelect id="r-organizacion" name="organizacion" defaultValue="" options={[{ value: "", label: "—" }, ...orgs.map((o) => ({ value: o.id, label: o.name }))]} />
              </Field>
            )}
            <Field label="Cuándo" htmlFor="tipo">
              <FormSelect id="tipo" name="tipo" defaultValue="mensual" options={[{ value: "mensual", label: "Todos los meses" }, { value: "semanal", label: "Todas las semanas" }, ...(studio ? [{ value: "antes_vencimiento", label: "Antes de un vencimiento" }] : [])]} />
            </Field>
            <Field label="Día del mes" htmlFor="dia" hint="Para las mensuales (1 a 28).">
              <Input id="dia" name="dia" type="number" min={1} max={28} defaultValue={5} />
            </Field>
            <Field label="Día de la semana" htmlFor="dia_semana" hint="Para las semanales.">
              <FormSelect id="dia_semana" name="dia_semana" defaultValue="1" options={WEEK.map((w, i) => ({ value: String(i), label: w }))} />
            </Field>
            {studio && (
              <Field label="Días antes del vencimiento" htmlFor="dias" hint="Para «antes de un vencimiento».">
                <Input id="dias" name="dias" type="number" min={0} max={30} defaultValue={3} />
              </Field>
            )}
            {studio && (
              <Field label="Impuesto" htmlFor="impuesto" hint="Como figura en Vencimientos (IVA, IIBB, F.931…).">
                <Input id="impuesto" name="impuesto" maxLength={40} defaultValue="IVA" />
              </Field>
            )}
            <Field label="Hora" htmlFor="hora">
              <Input id="hora" name="hora" type="number" min={0} max={23} defaultValue={8} />
            </Field>
            <fieldset className="grid gap-2 sm:col-span-2">
              <legend className="text-ui font-medium text-ink/80">Resumen por</legend>
              <div className="flex flex-wrap gap-4">
                <FormCheckbox id="c-app" name="canales" label="La app" defaultChecked />
                <FormCheckbox id="c-mail" name="canales" label="Mail" />
                <FormCheckbox id="c-wa" name="canales" label="WhatsApp" />
              </div>
            </fieldset>
            <div className="sm:col-span-2">
              <SubmitButton pendingText="Guardando…">Guardar la rutina</SubmitButton>
            </div>
          </form>
        </Panel>
      )}
      <Panel title="Qué puede hacer solo" icon={ShieldCheck}>
        <p className="mb-4 text-ui text-muted">Por defecto, todo lo sensible queda en Propuestas para aprobar. {manage ? "Podés dejar que el Agente lo haga solo, por acción y organización. Cada cambio queda en la auditoría y se puede pausar." : "Solo el dueño, un contador o el titular lo cambian."} Emitir comprobantes y presentar declaraciones siempre pide aprobación.</p>
        <ul className="grid gap-3">
          {Object.entries(AUTOMATABLE).map(([key, a]) => {
            const mine = switches.filter((x) => x.action === key);
            const general = mine.find((x) => !x.organizationId);
            const state = (x?: (typeof mine)[number]) => (!x || !x.enabled ? "apagada" : x.paused ? "pausada" : "activa");
            return (
              <li key={key} className="grid gap-2 rounded-md border border-line p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-ui font-medium text-ink">{a.label}</p>
                  <ToneBadge tone={state(general) === "activa" ? "gold" : "neutral"}>{state(general) === "activa" ? "Solo, en todas" : state(general) === "pausada" ? "En pausa" : "Pide aprobación"}</ToneBadge>
                </div>
                {mine.filter((x) => x.organizationId).map((x) => (
                  <p key={x.id} className="text-meta text-muted">
                    {x.organization}: {state(x) === "activa" ? "lo hace solo" : state(x) === "pausada" ? "en pausa" : "pide aprobación"}
                  </p>
                ))}
                {manage && (
                  <form action={setAutomationAction} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="accion" value={key} />
                    {studio && (
                      <div className="min-w-48 flex-1">
                        <FormSelect id={`o-${key}`} name="organizacion" aria-label="Organización" defaultValue="" options={[{ value: "", label: "Todas las organizaciones" }, ...orgs.map((o) => ({ value: o.id, label: o.name }))]} />
                      </div>
                    )}
                    <div className="min-w-40">
                      <FormSelect id={`e-${key}`} name="estado" aria-label="Estado" defaultValue="activa" options={[{ value: "activa", label: "Que lo haga solo" }, { value: "pausada", label: "En pausa" }, { value: "apagada", label: "Pedir aprobación" }]} />
                    </div>
                    <SubmitButton variant="secondary" pendingText="…">Guardar</SubmitButton>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      </Panel>
    </div>
  );
}

async function Memory({ actor, orgs }: { actor: AgentActor; orgs: { id: string; name: string }[] }) {
  const rows = await listMemory(actor);
  const studio = actor.tenantKind === "studio";
  return (
    <div className="grid gap-5">
      {rows.length ? (
        <List label="Memoria">
          {rows.map(({ m, org }) => (
            <ListRow
              key={m.id}
              icon={NotebookPen}
              title={`${m.subject ? `${m.subject}: ` : ""}${m.content}`}
              detail={`${org ?? (studio ? "Todas las organizaciones" : "Tu cuenta")} · ${m.source === "aprendido" ? "aprendido de tus correcciones" : "cargado por el estudio"} · ${formatDate(m.updated_at, "date")}`}
              aside={
                <form action={deleteMemoryAction}>
                  <input type="hidden" name="id" value={m.id} />
                  <SubmitButton variant="secondary" pendingText="…" confirm="¿Borrar este criterio?">Borrar</SubmitButton>
                </form>
              }
            />
          ))}
        </List>
      ) : (
        <Card>
          <EmptyState icon={NotebookPen} title="Todavía no hay criterios" text="Por ejemplo: «Las facturas de Edenor van a Servicios» o «En esta organización no se toma crédito fiscal de combustible»." />
        </Card>
      )}
      <Panel title="Nuevo criterio" icon={Plus}>
        <form action={saveMemoryAction} className="grid gap-4 sm:grid-cols-2">
          {studio && (
            <Field label="Organización" htmlFor="m-organizacion">
              <FormSelect id="m-organizacion" name="organizacion" defaultValue="" options={[{ value: "", label: "Todas las organizaciones" }, ...orgs.map((o) => ({ value: o.id, label: o.name }))]} />
            </Field>
          )}
          <Field label="Tema (opcional)" htmlFor="tema" hint="Un proveedor, un CUIT o un concepto.">
            <Input id="tema" name="tema" maxLength={80} />
          </Field>
          <Field label="Criterio" htmlFor="criterio" className="sm:col-span-2">
            <Textarea id="criterio" name="criterio" rows={2} maxLength={1000} required />
          </Field>
          <div className="sm:col-span-2">
            <SubmitButton pendingText="Guardando…">Guardar el criterio</SubmitButton>
          </div>
        </form>
      </Panel>
    </div>
  );
}
