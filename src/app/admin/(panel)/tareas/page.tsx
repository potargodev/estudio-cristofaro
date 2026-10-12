import { asc, eq } from "drizzle-orm";
import { CalendarDays, KanbanSquare, Table2 } from "lucide-react";
import Link from "next/link";
import { createTaskAction, deleteTaskAction, syncTasksAction, updateTaskAction } from "@/app/admin/tareas-actions";
import { PageHeader } from "@/components/admin/kit/PageHeader";
import { SubmitButton } from "@/components/admin/ui";
import { Feedback } from "@/components/app/Feedback";
import { getDb } from "@/db";
import { organizations } from "@/db/schema";
import { requireStaff } from "@/lib/auth";
import { getStudioStaff } from "@/lib/organizations";
import { cn } from "@/lib/utils";
import { crmEnabled, listTasks, TASK_STATUS, type TaskStatus } from "@/modules/crm/server";
import { fieldInlineClass } from "@/components/ds/primitives";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Tareas" };

const field = fieldInlineClass;
const d = (s: string | null) => (s ? formatDate(s, "numeric") : "Sin fecha");
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** Tareas (grupo Operación, §2.o): el trabajo del equipo por cliente en tabla, kanban o calendario */
export default async function TareasPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const me = await requireStaff();
  if (!(await crmEnabled(me.studioId)))
    return (
      <>
        <PageHeader title="Tareas" description="El trabajo del equipo por cliente." />
        <p className="rounded-md border border-line bg-surface p-4 text-ui">Las tareas vienen con el plan Profesional.</p>
      </>
    );
  const vista = ["tabla", "kanban", "calendario"].includes(sp.vista ?? "") ? sp.vista! : "tabla";
  const today = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  const month = /^\d{4}-\d{2}$/.test(sp.mes ?? "") ? sp.mes! : today.slice(0, 7);
  const filters = { status: vista === "kanban" ? null : (sp.estado ?? (vista === "tabla" ? "abiertas" : null)), assignee: sp.responsable === "yo" ? me.id : (sp.responsable ?? null), org: sp.org ?? null, from: vista === "calendario" ? `${month}-01` : null, to: vista === "calendario" ? `${month}-31` : null };
  const [rows, staff, orgs] = await Promise.all([listTasks(me.studioId, { ...filters, status: filters.status === "abiertas" ? null : filters.status }), getStudioStaff(me.studioId), getDb().select({ id: organizations.id, name: organizations.name }).from(organizations).where(eq(organizations.studio_id, me.studioId)).orderBy(asc(organizations.name))]);
  const list = filters.status === "abiertas" ? rows.filter((r) => r.t.status !== "hecha") : rows;
  const qs = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(Object.entries({ vista, estado: sp.estado ?? null, responsable: sp.responsable ?? null, org: sp.org ?? null, mes: sp.mes ?? null, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `/admin/tareas?${p}`;
  };
  const volver = qs({});
  const StatusForm = ({ id, status }: { id: string; status: string }) => (
    <form action={updateTaskAction} className="inline-flex gap-1">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="volver" value={volver} />
      <select name="status" defaultValue={status} aria-label="Estado" className={field}>
        {Object.entries(TASK_STATUS).map(([k, l]) => (
          <option key={k} value={k}>
            {l}
          </option>
        ))}
      </select>
      <SubmitButton variant="secondary" pendingText="…">OK</SubmitButton>
    </form>
  );
  return (
    <>
      <PageHeader
        title="Tareas"
        description="El trabajo del equipo por cliente: responsables, estados y vencimientos. Las de cada vencimiento se crean solas."
        tabs={[
          { href: qs({ vista: "tabla" }), label: "Tabla", icon: Table2, match: [] },
          { href: qs({ vista: "kanban" }), label: "Kanban", icon: KanbanSquare, match: [] },
          { href: qs({ vista: "calendario" }), label: "Calendario", icon: CalendarDays, match: [] },
        ]}
      />
      <div className="grid gap-4">
        <Feedback sp={sp} />
        <div className="flex flex-wrap items-end gap-2">
          <form className="flex min-w-0 max-w-full flex-wrap items-end gap-2 [&>select]:min-w-0 [&>select]:flex-1 sm:[&>select]:flex-none" action="/admin/tareas">
            <input type="hidden" name="vista" value={vista} />
            {vista === "tabla" && (
              <select name="estado" defaultValue={sp.estado ?? "abiertas"} aria-label="Estado" className={field}>
                <option value="abiertas">Abiertas</option>
                {Object.entries(TASK_STATUS).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            )}
            <select name="responsable" defaultValue={sp.responsable ?? ""} aria-label="Responsable" className={field}>
              <option value="">Todo el equipo</option>
              <option value="yo">Mías</option>
              <option value="nadie">Sin responsable</option>
              {staff.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
            <select name="org" defaultValue={sp.org ?? ""} aria-label="Organización" className={field}>
              <option value="">Todas las organizaciones</option>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
            {vista === "calendario" && <input type="month" name="mes" defaultValue={month} aria-label="Mes" className={field} />}
            <button className="h-9 rounded-md border border-line px-3 text-meta">Filtrar</button>
          </form>
          <form action={syncTasksAction} className="ml-auto">
            <input type="hidden" name="volver" value={volver} />
            <SubmitButton variant="secondary" pendingText="…">Crear las de vencimientos</SubmitButton>
          </form>
        </div>

        {vista === "tabla" && (
          <div className="overflow-x-auto rounded-md border border-line bg-surface">
            <table className="w-full min-w-[44rem] text-meta">
              <thead className="text-left text-muted">
                <tr className="border-b border-line">
                  <th className="px-3 py-2">Tarea</th>
                  <th>Organización</th>
                  <th>Vence</th>
                  <th>Responsable</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.map(({ t, org, assignee }) => (
                  <tr key={t.id} className="border-b border-line last:border-0" aria-label={t.title}>
                    <td className="px-3 py-2">
                      <span className={cn("font-medium", t.status === "hecha" && "text-muted line-through")}>{t.title}</span>
                      {t.source !== "manual" && <span className="ml-1 text-micro text-muted">({t.source === "obligacion" ? "vencimiento" : "flujo"})</span>}
                    </td>
                    <td>{org ?? "—"}</td>
                    <td className={cn("num", t.status !== "hecha" && t.due_date && t.due_date < today && "text-[#8f2a1c]")}>{d(t.due_date)}</td>
                    <td>
                      <form action={updateTaskAction} className="inline-flex gap-1">
                        <input type="hidden" name="id" value={t.id} />
                        <input type="hidden" name="volver" value={volver} />
                        <select name="assignee" defaultValue={t.assignee_id ?? ""} aria-label="Responsable" className={field}>
                          <option value="">Sin responsable</option>
                          {staff.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.name}
                            </option>
                          ))}
                        </select>
                        <SubmitButton variant="secondary" pendingText="…">OK</SubmitButton>
                      </form>
                      <span className="sr-only">{assignee}</span>
                    </td>
                    <td>
                      <StatusForm id={t.id} status={t.status} />
                    </td>
                    <td>
                      <form action={deleteTaskAction}>
                        <input type="hidden" name="id" value={t.id} />
                        <input type="hidden" name="volver" value={volver} />
                        <button aria-label={`Borrar ${t.title}`} className="px-2 text-muted hover:text-[#8f2a1c]">
                          ×
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
                {list.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-muted">
                      No hay tareas con estos filtros.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {vista === "kanban" && (
          <div className="grid gap-3 md:grid-cols-3">
            {(Object.keys(TASK_STATUS) as TaskStatus[]).map((st) => {
              const col = list.filter((r) => r.t.status === st);
              return (
                <section key={st} aria-label={TASK_STATUS[st]} className="grid content-start gap-2 rounded-md border border-line bg-canvas p-2">
                  <h2 className="px-1 text-meta font-semibold">
                    {TASK_STATUS[st]} <span className="num text-muted">({col.length})</span>
                  </h2>
                  {col.map(({ t, org, assignee }) => (
                    <article key={t.id} className="grid gap-1 rounded-md border border-line bg-surface p-2.5 text-meta" aria-label={t.title}>
                      <p className="font-medium">{t.title}</p>
                      <p className="text-caption text-muted">
                        {[org, assignee, d(t.due_date)].filter(Boolean).join(" · ")}
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {(Object.keys(TASK_STATUS) as TaskStatus[])
                          .filter((x) => x !== st)
                          .map((x) => (
                            <form key={x} action={updateTaskAction}>
                              <input type="hidden" name="id" value={t.id} />
                              <input type="hidden" name="status" value={x} />
                              <input type="hidden" name="volver" value={volver} />
                              <button className="h-(--control-h-sm) rounded-md border border-line px-2 text-caption hover:border-muted">→ {TASK_STATUS[x]}</button>
                            </form>
                          ))}
                      </div>
                    </article>
                  ))}
                </section>
              );
            })}
          </div>
        )}

        {vista === "calendario" && (
          <section aria-label="Calendario" className="grid gap-2">
            <div className="flex items-center justify-between">
              <Link href={qs({ mes: new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)) - 2, 1)).toISOString().slice(0, 7) })} className="text-meta underline">
                ← Anterior
              </Link>
              <h2 className="text-body font-semibold capitalize">
                {MONTHS[Number(month.slice(5)) - 1]} {month.slice(0, 4)}
              </h2>
              <Link href={qs({ mes: new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 1)).toISOString().slice(0, 7) })} className="text-meta underline">
                Siguiente →
              </Link>
            </div>
            <div className="grid grid-cols-7 gap-1 text-micro text-muted">
              {["lun", "mar", "mié", "jue", "vie", "sáb", "dom"].map((x) => (
                <span key={x} className="px-1">
                  {x}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {(() => {
                const first = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)) - 1, 1));
                const days = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).getUTCDate();
                const lead = (first.getUTCDay() + 6) % 7;
                return [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)].map((n, i) => {
                  const date = n ? `${month}-${String(n).padStart(2, "0")}` : null;
                  const items = date ? list.filter((r) => r.t.due_date === date) : [];
                  return (
                    <div key={i} className={cn("min-h-16 rounded-md border p-1 text-micro", n ? "border-line bg-surface" : "border-transparent", date === today && "border-navy")} aria-label={date ?? undefined}>
                      {n && <span className="num text-muted">{n}</span>}
                      {items.slice(0, 3).map(({ t }) => (
                        <p key={t.id} className={cn("truncate rounded px-1", t.status === "hecha" ? "text-muted line-through" : "bg-navy-soft")} title={t.title}>
                          {t.title}
                        </p>
                      ))}
                      {items.length > 3 && <p className="text-muted">+{items.length - 3}</p>}
                    </div>
                  );
                });
              })()}
            </div>
          </section>
        )}

        <form action={createTaskAction} className="grid gap-2 rounded-md border border-line bg-surface p-4 sm:grid-cols-[1.5fr_1fr_1fr_9rem_auto] sm:items-end">
          <input type="hidden" name="volver" value={volver} />
          <label className="text-meta text-muted">
            Nueva tarea
            <input name="title" required placeholder="Ej.: Pedir extractos de septiembre" className={cn(field, "mt-1 block w-full")} />
          </label>
          <label className="text-meta text-muted">
            Organización
            <select name="org" className={cn(field, "mt-1 block w-full")}>
              <option value="">—</option>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-meta text-muted">
            Responsable
            <select name="assignee" defaultValue={me.id} className={cn(field, "mt-1 block w-full")}>
              <option value="">Sin responsable</option>
              {staff.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-meta text-muted">
            Vence
            <input name="due" type="date" className={cn(field, "mt-1 block w-full")} />
          </label>
          <SubmitButton pendingText="…">Crear</SubmitButton>
        </form>
      </div>
    </>
  );
}
