"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { createTask, deleteTask, syncObligationTasks, TaskError, updateTask } from "@/modules/crm/server";

// Tareas del equipo: cualquier persona del estudio; las referencias
// (organización, responsable) se validan contra el estudio de la sesión.

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const back = (fd: FormData) => {
  const v = s(fd, "volver");
  return v.startsWith("/admin/tareas") ? v : "/admin/tareas";
};
function go(path: string, q: Record<string, string>): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}${new URLSearchParams(q)}`);
}
async function guard<T>(b: string, fn: () => Promise<T>) {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof TaskError) go(b, { error: e.message });
    throw e;
  }
}

export async function createTaskAction(fd: FormData) {
  const me = await requireStaff();
  await guard(back(fd), () => createTask(me.studioId, me, { title: s(fd, "title"), detail: s(fd, "detail") || null, organizationId: s(fd, "org") || null, assigneeId: s(fd, "assignee") || null, dueDate: s(fd, "due") || null }));
  revalidatePath("/admin/tareas");
  go(back(fd), { ok: "Tarea creada." });
}

export async function updateTaskAction(fd: FormData) {
  const me = await requireStaff();
  const patch: { status?: string; assigneeId?: string | null; dueDate?: string | null } = {};
  if (fd.has("status")) patch.status = s(fd, "status");
  if (fd.has("assignee")) patch.assigneeId = s(fd, "assignee") || null;
  if (fd.has("due")) patch.dueDate = s(fd, "due") || null;
  await guard(back(fd), () => updateTask(me.studioId, me, s(fd, "id"), patch));
  revalidatePath("/admin/tareas");
  go(back(fd), { ok: "Tarea actualizada." });
}

export async function deleteTaskAction(fd: FormData) {
  const me = await requireStaff();
  await deleteTask(me.studioId, me, s(fd, "id"));
  revalidatePath("/admin/tareas");
  go(back(fd), { ok: "Tarea borrada." });
}

export async function syncTasksAction(fd: FormData) {
  const me = await requireStaff();
  const r = await syncObligationTasks(me.studioId);
  revalidatePath("/admin/tareas");
  go(back(fd), { ok: r.created ? `Creamos ${r.created} tarea${r.created === 1 ? "" : "s"} de vencimientos.` : "Las tareas de los vencimientos ya estaban al día." });
}
