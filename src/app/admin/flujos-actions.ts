"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOperator } from "@/lib/auth";
import type { Graph } from "@/modules/flows/core";
import { createBlank, createFromPhrase, createFromTemplate, deleteFlow, FlowError, saveFlow, setFlowStatus, triggerManual } from "@/modules/flows/engine";

// Flujos del estudio: dueños y contadores. Cada función del motor filtra por
// el estudio de la sesión.

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const LIST = "/admin/vigia?tab=automatizaciones";
const page = (id: string) => `/admin/vigia/flujos/${id}`;

function go(path: string, q: Record<string, string>): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}${new URLSearchParams(q)}`);
}

async function guard<T>(back: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof FlowError) go(back, { error: e.message });
    throw e;
  }
}

export async function createFlowAction(fd: FormData) {
  const me = await requireOperator();
  const tpl = s(fd, "template");
  const frase = s(fd, "frase");
  const f = await guard(LIST, async () => (frase ? (await createFromPhrase(me.studioId, me, frase)).flow : tpl ? await createFromTemplate(me.studioId, me, tpl) : await createBlank(me.studioId, me)));
  revalidatePath("/admin/vigia");
  go(page(f.id), { ok: frase ? "Armamos un borrador con tu frase: revisalo y activalo." : "Flujo creado en borrador." });
}

export async function saveFlowAction(fd: FormData) {
  const me = await requireOperator();
  const id = s(fd, "id");
  let graph: Graph;
  try {
    graph = JSON.parse(s(fd, "graph")) as Graph;
    if (!Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) throw new Error();
  } catch {
    go(page(id), { error: "El flujo no se pudo leer. Probá de nuevo." });
  }
  const issues = await guard(page(id), () => saveFlow(me.studioId, me, id, { name: s(fd, "name"), graph }));
  revalidatePath(page(id));
  go(page(id), issues.length ? { ok: `Guardado. Antes de activarlo revisá: ${issues[0].message}` } : { ok: "Guardado." });
}

export async function flowStatusAction(fd: FormData) {
  const me = await requireOperator();
  const id = s(fd, "id");
  const st = s(fd, "status") === "activo" ? "activo" : "pausado";
  await guard(page(id), () => setFlowStatus(me.studioId, me, id, st));
  revalidatePath(page(id));
  revalidatePath("/admin/vigia");
  go(page(id), { ok: st === "activo" ? "Flujo activo." : "Flujo pausado: no se dispara hasta que lo reanudes." });
}

export async function testFlowAction(fd: FormData) {
  const me = await requireOperator();
  const id = s(fd, "id");
  let datos: Record<string, unknown> = {};
  try {
    datos = s(fd, "datos") ? (JSON.parse(s(fd, "datos")) as Record<string, unknown>) : {};
  } catch {
    go(page(id), { error: "Los datos de prueba tienen que ser JSON." });
  }
  const r = await guard(page(id), () => triggerManual(me.studioId, me, id, datos, "prueba"));
  revalidatePath(page(id));
  go(`${page(id)}/corridas/${r.id}`, { ok: "Corrida de prueba en cola: el motor la toma en menos de un minuto." });
}

export async function deleteFlowAction(fd: FormData) {
  const me = await requireOperator();
  await deleteFlow(me.studioId, me, s(fd, "id"));
  revalidatePath("/admin/vigia");
  go(LIST, { ok: "Flujo borrado." });
}
