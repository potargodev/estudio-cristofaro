import "server-only";
import { and, asc, eq, gte, inArray, isNull, lte, ne, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { obligations, organization_staff, organizations, tasks, users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { hasModule } from "@/lib/faro/entitlements";
import { notify } from "@/modules/notifications/server";
import { emitEvent } from "@/modules/flows/events";

// Cartera y tareas (módulo crm, ítem Tareas del grupo Operación): el trabajo
// del equipo por cliente, con responsables, estados y vencimientos. Las
// tareas de cada vencimiento se generan solas (y se cierran cuando el
// vencimiento se presenta o se paga). Todo filtra por estudio.

const db = () => getDb();
const UUID = /^[0-9a-f-]{36}$/i;
export class TaskError extends Error {}
type Actor = { id: string; email: string; name?: string };
export const TASK_STATUS = { pendiente: "Pendiente", en_curso: "En curso", hecha: "Hecha" } as const;
export type TaskStatus = keyof typeof TASK_STATUS;

export async function crmEnabled(studioId: string) {
  return hasModule(studioId, "crm");
}

interface TaskFilters {
  status?: string | null;
  assignee?: string | null;
  org?: string | null;
  from?: string | null;
  to?: string | null;
}

export async function listTasks(studioId: string, f: TaskFilters = {}) {
  return db()
    .select({ t: tasks, org: organizations.name, assignee: users.name })
    .from(tasks)
    .leftJoin(organizations, eq(organizations.id, tasks.organization_id))
    .leftJoin(users, eq(users.id, tasks.assignee_id))
    .where(
      and(
        eq(tasks.studio_id, studioId),
        f.status && f.status in TASK_STATUS ? eq(tasks.status, f.status) : undefined,
        f.assignee === "nadie" ? isNull(tasks.assignee_id) : f.assignee && UUID.test(f.assignee) ? eq(tasks.assignee_id, f.assignee) : undefined,
        f.org && UUID.test(f.org) ? eq(tasks.organization_id, f.org) : undefined,
        f.from ? gte(tasks.due_date, f.from) : undefined,
        f.to ? lte(tasks.due_date, f.to) : undefined,
      ),
    )
    .orderBy(sql`${tasks.due_date} asc nulls last`, asc(tasks.created_at))
    .limit(500);
}

async function checkRefs(studioId: string, orgId: string | null, assigneeId: string | null) {
  if (orgId) {
    if (!UUID.test(orgId)) throw new TaskError("Organización inválida.");
    const [o] = await db().select({ id: organizations.id }).from(organizations).where(and(eq(organizations.id, orgId), eq(organizations.studio_id, studioId)));
    if (!o) throw new TaskError("Esa organización no es del estudio.");
  }
  if (assigneeId) {
    if (!UUID.test(assigneeId)) throw new TaskError("Responsable inválido.");
    const [u] = await db().select({ id: users.id }).from(users).where(and(eq(users.id, assigneeId), eq(users.studioId, studioId), eq(users.active, true), inArray(users.role, ["dueno", "contador", "colaborador"])));
    if (!u) throw new TaskError("Esa persona no es del equipo del estudio.");
  }
}

export async function createTask(studioId: string, actor: Actor, i: { title: string; detail: string | null; organizationId: string | null; assigneeId: string | null; dueDate: string | null }, opts: { emit?: boolean } = {}) {
  if (!(await crmEnabled(studioId))) throw new TaskError("Las tareas vienen con el plan Profesional.");
  if (!i.title.trim()) throw new TaskError("Poné qué hay que hacer.");
  await checkRefs(studioId, i.organizationId, i.assigneeId);
  const [t] = await db()
    .insert(tasks)
    .values({ studio_id: studioId, organization_id: i.organizationId, title: i.title.trim().slice(0, 160), detail: i.detail?.trim().slice(0, 2000) || null, assignee_id: i.assigneeId, due_date: i.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(i.dueDate) ? i.dueDate : null, created_by: actor.id })
    .returning();
  if (t.assignee_id && t.assignee_id !== actor.id) await notify([t.assignee_id], { kind: "aviso", title: `Te asignaron: ${t.title}`, href: "/admin/tareas" });
  await audit({ studioId, organizationId: t.organization_id, actor, action: "tarea.creada", entityType: "tarea", entityId: t.id });
  // Las que crea un flujo no disparan flujos (evita ciclos)
  if (opts.emit !== false) await emitEvent(studioId, "tarea.creada", { tarea_id: t.id, organizacion_id: t.organization_id, titulo: t.title, vence: t.due_date }, t.id);
  return t;
}

export async function updateTask(studioId: string, actor: Actor, id: string, patch: { status?: string; assigneeId?: string | null; dueDate?: string | null }) {
  if (!UUID.test(id)) throw new TaskError("Tarea inválida.");
  const [t] = await db().select().from(tasks).where(and(eq(tasks.id, id), eq(tasks.studio_id, studioId)));
  if (!t) throw new TaskError("No encontramos esa tarea.");
  const set: Partial<typeof tasks.$inferInsert> = {};
  if (patch.status !== undefined) {
    if (!(patch.status in TASK_STATUS)) throw new TaskError("Estado inválido.");
    set.status = patch.status;
    set.completed_at = patch.status === "hecha" ? new Date() : null;
  }
  if (patch.assigneeId !== undefined) {
    await checkRefs(studioId, null, patch.assigneeId);
    set.assignee_id = patch.assigneeId;
  }
  if (patch.dueDate !== undefined) set.due_date = patch.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(patch.dueDate) ? patch.dueDate : null;
  await db().update(tasks).set(set).where(eq(tasks.id, t.id));
  if (set.assignee_id && set.assignee_id !== actor.id && set.assignee_id !== t.assignee_id) await notify([set.assignee_id], { kind: "aviso", title: `Te asignaron: ${t.title}`, href: "/admin/tareas" });
  await audit({ studioId, organizationId: t.organization_id, actor, action: "tarea.actualizada", entityType: "tarea", entityId: t.id, metadata: { estado: set.status, responsable: set.assignee_id } });
}

export async function deleteTask(studioId: string, actor: Actor, id: string) {
  if (!UUID.test(id)) return;
  const [t] = await db().delete(tasks).where(and(eq(tasks.id, id), eq(tasks.studio_id, studioId))).returning({ id: tasks.id, org: tasks.organization_id });
  if (t) await audit({ studioId, organizationId: t.org, actor, action: "tarea.borrada", entityType: "tarea", entityId: t.id });
}

/**
 * Tareas recurrentes por obligación: una por cada vencimiento pendiente de
 * los próximos 30 días (vence 3 días antes, a cargo del responsable de la
 * organización), sin duplicar; se cierran solas cuando el vencimiento se
 * presenta o se paga.
 */
export async function syncObligationTasks(studioId?: string) {
  const today = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  const in30 = new Date(Date.now() - 3 * 3600_000 + 30 * 86400000).toISOString().slice(0, 10);
  const rows = await db()
    .select({ o: obligations, org: organizations.name })
    .from(obligations)
    .innerJoin(organizations, eq(organizations.id, obligations.organization_id))
    .where(and(studioId ? eq(obligations.studio_id, studioId) : undefined, eq(obligations.status, "pendiente"), gte(obligations.due_date, today), lte(obligations.due_date, in30), ne(organizations.status, "baja")));
  let created = 0;
  for (const { o, org } of rows) {
    if (!(await crmEnabled(o.studio_id))) continue;
    const [staff] = await db().select({ id: organization_staff.user_id }).from(organization_staff).where(eq(organization_staff.organization_id, o.organization_id!)).orderBy(asc(organization_staff.assignment)).limit(1);
    const due = new Date(new Date(`${o.due_date}T12:00:00Z`).getTime() - 3 * 86400000).toISOString().slice(0, 10);
    const r = await db()
      .insert(tasks)
      .values({ studio_id: o.studio_id, organization_id: o.organization_id, title: `Preparar ${o.tax} ${o.period} · ${org}`, detail: `Vence el ${o.due_date.split("-").reverse().join("/")}.`, due_date: due < today ? today : due, assignee_id: staff?.id ?? null, source: "obligacion", source_ref: o.id })
      .onConflictDoNothing()
      .returning({ id: tasks.id });
    created += r.length;
  }
  // Cierre automático
  const closed = await db().execute(sql`
    update tasks set status = 'hecha', completed_at = now()
    where source = 'obligacion' and status <> 'hecha' ${studioId ? sql`and studio_id = ${studioId}` : sql``}
      and source_ref in (select id::text from obligations where status in ('presentado', 'pagado'))
    returning id`);
  return { created, closed: (closed as unknown as unknown[]).length };
}

