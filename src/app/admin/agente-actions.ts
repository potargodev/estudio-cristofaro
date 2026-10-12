"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { requireOwnAccount, requireTenant, type StaffUser } from "@/lib/auth";
import { setAutomation } from "@/modules/agent/automations";
import type { AgentScope } from "@/modules/agent/catalog";
import { AgentError, createTask, deleteMemory, runAgentWorker, saveMemory, saveRoutine, setRoutineState, setTaskState, type AgentActor } from "@/modules/agent/server";

// Agente contable (§2.q, pestaña «Agente» del Vigía). Cada función del motor
// valida el estudio de la sesión, el rol, el plan y los IDs que llegan.

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const TAB = "/admin/vigia?tab=agente";
const taskPage = (id: string) => `/admin/vigia/agente/${id}`;

function go(path: string, q: Record<string, string>): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}${new URLSearchParams(q)}`);
}

const actorOf = (u: StaffUser): AgentActor => ({ id: u.id, email: u.email, name: u.name, role: u.role, studioId: u.studioId, tenantKind: u.tenantKind });
const me = async () => actorOf(await requireTenant(["studio", "personal"]));

async function guard<T>(back: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof AgentError) go(back, { error: e.message });
    throw e;
  }
}

/** Arranca enseguida, sin esperar la próxima vuelta del motor (la fila se toma con turno: no se duplica) */
const kick = () =>
  after(async () => {
    await runAgentWorker().catch((e) => console.error("[agente]", (e as Error).message));
  });

export async function createAgentTaskAction(fd: FormData) {
  const actor = await me();
  const back = `${TAB}&vista=nueva`;
  const scope = s(fd, "alcance");
  const id = await guard(back, () =>
    createTask(actor, {
      text: s(fd, "pedido") || null,
      templateKey: s(fd, "plantilla") || null,
      organizationId: s(fd, "organizacion") || null,
      scope: ["organizacion", "cartera", "personal"].includes(scope) ? (scope as AgentScope) : null,
      period: s(fd, "periodo") || null,
      date: s(fd, "fecha") || null,
    }),
  );
  kick();
  revalidatePath("/admin/vigia");
  go(taskPage(id), { ok: "Tarea en marcha: podés seguir el avance acá o irte; te avisamos cuando esté lista." });
}

export async function agentTaskStateAction(fd: FormData) {
  const actor = await me();
  const id = s(fd, "id");
  const action = s(fd, "accion");
  if (!["pausar", "reanudar", "cancelar"].includes(action)) go(taskPage(id), { error: "Acción inválida." });
  await guard(taskPage(id), () => setTaskState(actor, id, action as "pausar" | "reanudar" | "cancelar"));
  if (action === "reanudar") kick();
  revalidatePath(taskPage(id));
  go(taskPage(id), { ok: action === "pausar" ? "Pausada." : action === "reanudar" ? "Reanudada." : "Cancelada." });
}

export async function saveRoutineAction(fd: FormData) {
  const actor = await me();
  const back = `${TAB}&vista=rutinas`;
  const tipo = s(fd, "tipo");
  const schedule = { tipo, hora: Number(s(fd, "hora") || 9), dia: Number(s(fd, "dia") || 5), dia_semana: Number(s(fd, "dia_semana") || 1), dias: Number(s(fd, "dias") || 3), impuesto: s(fd, "impuesto") || "IVA" };
  await guard(back, () =>
    saveRoutine(actor, {
      name: s(fd, "nombre"),
      templateKey: s(fd, "plantilla"),
      scope: (s(fd, "alcance") as AgentScope) || "cartera",
      organizationId: s(fd, "organizacion") || null,
      schedule,
      channels: fd.getAll("canales").map(String),
    }),
  );
  revalidatePath("/admin/vigia");
  go(back, { ok: "Rutina guardada." });
}

export async function routineStateAction(fd: FormData) {
  const actor = await me();
  const back = `${TAB}&vista=rutinas`;
  const action = s(fd, "accion");
  if (!["pausar", "activar", "borrar"].includes(action)) go(back, { error: "Acción inválida." });
  await guard(back, () => setRoutineState(actor, s(fd, "id"), action as "pausar" | "activar" | "borrar"));
  revalidatePath("/admin/vigia");
  go(back, { ok: action === "borrar" ? "Rutina borrada." : action === "pausar" ? "Rutina pausada." : "Rutina activa." });
}

export async function saveMemoryAction(fd: FormData) {
  const actor = await me();
  const back = `${TAB}&vista=memoria`;
  await guard(back, () => saveMemory(actor, { id: s(fd, "id") || null, organizationId: s(fd, "organizacion") || null, subject: s(fd, "tema") || null, content: s(fd, "criterio") }));
  revalidatePath("/admin/vigia");
  go(back, { ok: "Criterio guardado: el Agente lo tiene en cuenta desde la próxima tarea." });
}

export async function deleteMemoryAction(fd: FormData) {
  const actor = await me();
  const back = `${TAB}&vista=memoria`;
  await guard(back, () => deleteMemory(actor, s(fd, "id")));
  revalidatePath("/admin/vigia");
  go(back, { ok: "Criterio borrado." });
}

/** Interruptor de una automatización (regla fiscal de §2.q): nunca en un acceso asistido */
export async function setAutomationAction(fd: FormData) {
  const u = await requireOwnAccount(requireTenant(["studio", "personal"]));
  const back = `${TAB}&vista=rutinas`;
  const state = s(fd, "estado");
  if (!["activa", "pausada", "apagada"].includes(state)) go(back, { error: "Estado inválido." });
  await guard(back, () => setAutomation({ id: u.id, email: u.email, role: u.role, studioId: u.studioId }, { action: s(fd, "accion"), organizationId: s(fd, "organizacion") || null, state: state as "activa" | "pausada" | "apagada" }));
  revalidatePath("/admin/vigia");
  go(back, { ok: state === "activa" ? "Automatización activada: queda en la auditoría." : state === "pausada" ? "Automatización en pausa: vuelve a pedir aprobación." : "Automatización apagada." });
}
