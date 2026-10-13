"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOperator } from "@/lib/auth";
import { createTasks, decide, markRecategorized, notifyClients, RecatError, reviewBatch, saveParams } from "@/modules/recategorizacion/server";

// Recategorización de la cartera (A5): dueños y contadores del estudio. Cada
// ID se valida contra el estudio de la sesión en el módulo.

const PATH = "/admin/recategorizacion";
const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const period = (fd: FormData) => (/^\d{4}-(01|07)$/.test(s(fd, "periodo")) ? s(fd, "periodo") : "");
const num = (v: string) => (v ? Number(v.replace(/\./g, "").replace(",", ".")) : null);

function go(q: Record<string, string>, fd: FormData): never {
  const p = period(fd);
  redirect(`${PATH}?${new URLSearchParams({ ...(p ? { periodo: p } : {}), ...(s(fd, "mov") ? { mov: s(fd, "mov") } : {}), ...q })}`);
}

async function guard<T>(fd: FormData, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof RecatError) go({ error: e.message }, fd);
    throw e;
  }
}

export async function paramsAction(fd: FormData) {
  const me = await requireOperator();
  await guard(fd, () => saveParams(me.studioId, me, s(fd, "id"), period(fd), { activity: s(fd, "activity") === "bienes" ? "bienes" : "servicios", surfaceM2: num(s(fd, "surface")), energyKw: num(s(fd, "energy")), rentAnnual: num(s(fd, "rent")), notes: s(fd, "notes") || null }));
  revalidatePath(PATH);
  go({ ok: "Parámetros guardados: la categoría se recalculó." }, fd);
}

export async function reviewAction(fd: FormData) {
  const me = await requireOperator();
  const ids = fd.getAll("id").map(String);
  if (!ids.length) go({ error: "Elegí al menos un monotributista." }, fd);
  const op = s(fd, "op");
  if (op === "avisar") {
    const n = await guard(fd, () => notifyClients(me.studioId, me, ids, period(fd), { app: fd.get("app") === "on", mail: fd.get("mail") === "on", whatsapp: fd.get("whatsapp") === "on" }));
    revalidatePath(PATH);
    go(n ? { ok: `Avisamos a ${n} ${n === 1 ? "cliente" : "clientes"}.` } : { error: "Solo se avisa a los revisados o recategorizados." }, fd);
  }
  const n = await guard(fd, () => reviewBatch(me.studioId, me, ids, period(fd), op === "actual" ? "actual" : "sugerida"));
  revalidatePath(PATH);
  go({ ok: `${n} ${n === 1 ? "revisado" : "revisados"}. Los excluidos y los que no tienen categoría se deciden uno por uno.` }, fd);
}

export async function decideAction(fd: FormData) {
  const me = await requireOperator();
  await guard(fd, () => decide(me.studioId, me, s(fd, "id"), period(fd), s(fd, "category")));
  revalidatePath(PATH);
  go({ ok: "Categoría decidida." }, fd);
}

export async function recategorizedAction(fd: FormData) {
  const me = await requireOperator();
  const file = fd.get("receipt");
  await guard(fd, () => markRecategorized(me.studioId, me, s(fd, "id"), period(fd), file instanceof File && file.size ? file : null));
  revalidatePath(PATH);
  go({ ok: "Marcado como recategorizado: la categoría de la CUIT quedó actualizada." }, fd);
}

export async function tasksAction(fd: FormData) {
  const me = await requireOperator();
  const n = await guard(fd, () => createTasks(me.studioId, me, period(fd)));
  revalidatePath(PATH);
  go({ ok: n ? `Creamos ${n} ${n === 1 ? "tarea" : "tareas"} con vencimiento el día de la recategorización.` : "Las tareas ya estaban creadas." }, fd);
}
