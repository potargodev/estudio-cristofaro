"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { parseAmount } from "@/modules/bitacora/catalog";
import { closingCheck, ConexionError, decide, inviteClient, openDispute, postDisputeMessage, requestInfo, requestInterview, resolveDispute, signAsStudio, startClosing, studioAct } from "@/modules/conexiones/server";

// Conexiones del lado del estudio: admisión, acuerdo, trabajo en vivo y
// cierre. El estudio sale siempre de la sesión y cada función valida que la
// conexión sea de este estudio (nunca se confía en el ID del navegador).

const s = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
};
const back = (fd: FormData) => {
  const b = s(fd, "volver");
  return b.startsWith("/admin/") ? b : "/admin/comercial/conexiones";
};
const go = (base: string, q: Record<string, string>): never => redirect(`${base}${base.includes("?") ? "&" : "?"}${new URLSearchParams(q)}`);
async function run(fd: FormData, fn: () => Promise<unknown>, ok: string) {
  const b = back(fd);
  try {
    await fn();
  } catch (e) {
    if (e instanceof ConexionError) go(b, { error: e.message });
    throw e;
  }
  revalidatePath("/admin/comercial/conexiones", "layout");
  revalidatePath("/admin/organizaciones", "layout");
  go(b, { ok });
}

export async function inviteClientAction(fd: FormData) {
  const me = await requireStaff();
  await run(fd, () => inviteClient(me, s(fd, "email"), s(fd, "message")), "Invitación enviada: la persona elige qué compartir y aceptás después de la admisión.");
}
export async function interviewAction(fd: FormData) {
  const me = await requireStaff();
  await run(fd, () => requestInterview(me, s(fd, "id"), s(fd, "note")), "Le pediste una entrevista: elige un horario en tu agenda.");
}
export async function infoAction(fd: FormData) {
  const me = await requireStaff();
  await run(fd, () => requestInfo(me, s(fd, "id"), s(fd, "question")), "Le pediste más información.");
}
export async function acceptConnectionAction(fd: FormData) {
  return decideConnection(fd, true);
}
export async function rejectConnectionAction(fd: FormData) {
  return decideConnection(fd, false);
}
async function decideConnection(fd: FormData, accept: boolean) {
  const me = await requireStaff();
  const price = parseAmount(s(fd, "price"));
  await run(fd, () => decide(me, s(fd, "id"), { accept, reason: s(fd, "reason"), services: s(fd, "services"), monthlyPrice: price == null ? NaN : price / 100, noticeDays: Number(s(fd, "notice")) || 30 }), accept ? "Aceptada: falta que firmen el acuerdo." : "Rechazada. La persona ve el motivo.");
}
export async function studioSignAction(fd: FormData) {
  const me = await requireStaff();
  await run(fd, () => signAsStudio(me, s(fd, "id"), s(fd, "signed_name")), "Firmaste el acuerdo.");
}
export async function studioActAction(fd: FormData) {
  const me = await requireStaff();
  const op = s(fd, "op");
  if (op === "editar_movimiento")
    return run(
      fd,
      () => studioAct(me, s(fd, "id"), { op: "editar_movimiento", entryId: s(fd, "entry"), category: s(fd, "category") || undefined, deductible: fd.has("deductible_set") ? fd.get("deductible") === "on" : undefined, invoiced: fd.has("invoiced_set") ? fd.get("invoiced") === "on" : undefined }),
      "Guardado. La persona lo ve en «Lo que hizo tu contador».",
    );
  const amount = parseAmount(s(fd, "amount"));
  return run(
    fd,
    () => studioAct(me, s(fd, "id"), { op: "crear_movimiento", kind: s(fd, "kind") === "ingreso" ? "ingreso" : "gasto", amount: amount ?? 0, date: s(fd, "date") || new Date().toISOString().slice(0, 10), category: s(fd, "category"), description: s(fd, "description"), invoiced: fd.get("invoiced") === "on", deductible: fd.get("deductible") === "on" }),
    "Listo. Si la persona eligió «Proponer y aprobar», queda para que la apruebe.",
  );
}
export async function studioCloseAction(fd: FormData) {
  const me = await requireStaff();
  await run(fd, () => startClosing(me, "estudio", s(fd, "id"), s(fd, "reason")), "Iniciaste el cierre: solo lectura por 30 días.");
}
export async function studioCheckAction(fd: FormData) {
  const me = await requireStaff();
  const item = s(fd, "item");
  await run(fd, () => closingCheck(me, "estudio", s(fd, "id"), item === "honorarios" || item === "pendientes" ? item : "constancia"), "Guardado en el checklist.");
}
export async function studioDisputeAction(fd: FormData) {
  const me = await requireStaff();
  const op = s(fd, "op");
  await run(fd, () => (op === "abrir" ? openDispute(me, "estudio", s(fd, "id"), s(fd, "message")) : op === "resolver" ? resolveDispute(me, "estudio", s(fd, "id")) : postDisputeMessage(me, "estudio", s(fd, "id"), s(fd, "message"))), "Listo.");
}
