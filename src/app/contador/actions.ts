"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePersonal } from "@/lib/auth";
import { acceptInvitation, answerInfo, closingCheck, ConexionError, decideAction, declineInvitation, openDispute, postDisputeMessage, rate, requestConnection, resolveDispute, setAutonomy, setScopes, setWeekly, signAsUser, startClosing } from "@/modules/conexiones/server";

// Conexión con un contador, del lado de la persona. Todo sale de la sesión:
// cada función valida que la conexión sea suya.

const s = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
};
const go = (q: Record<string, string>, base = "/contador"): never => redirect(`${base}?${new URLSearchParams(q)}`);
async function run(fn: () => Promise<unknown>, ok: string, base = "/contador") {
  try {
    await fn();
  } catch (e) {
    if (e instanceof ConexionError) go({ error: e.message }, base);
    throw e;
  }
  revalidatePath("/contador");
  revalidatePath("/personal");
  go({ ok }, base);
}

export async function requestConnectionAction(fd: FormData) {
  const me = await requirePersonal();
  const slug = s(fd, "studio");
  await run(() => requestConnection(me, slug, { message: s(fd, "message"), scopePersonal: fd.get("personal") === "on", autonomy: s(fd, "autonomy") }), "Listo: le mandamos tu pedido al estudio. Ahora hace su admisión.");
}
export async function acceptInvitationAction(fd: FormData) {
  const me = await requirePersonal();
  await run(() => acceptInvitation(me, s(fd, "id"), { scopePersonal: fd.get("personal") === "on", autonomy: s(fd, "autonomy") }), "Aceptaste la invitación: el estudio hace su admisión.");
}
export async function declineAction(fd: FormData) {
  const me = await requirePersonal();
  await run(() => declineInvitation(me, s(fd, "id")), "Listo, cancelada.");
}
export async function answerInfoAction(fd: FormData) {
  const me = await requirePersonal();
  await run(() => answerInfo(me, s(fd, "id"), s(fd, "answer")), "Respuesta enviada al estudio.");
}
export async function signAction(fd: FormData) {
  const me = await requirePersonal();
  await run(() => signAsUser(me, s(fd, "id"), s(fd, "signed_name"), fd.get("policies") === "on"), "Firmaste el acuerdo.");
}
export async function autonomyAction(fd: FormData) {
  const me = await requirePersonal();
  await run(() => setAutonomy(me, s(fd, "id"), s(fd, "autonomy")), "Guardado.");
}
export async function scopesAction(fd: FormData) {
  const me = await requirePersonal();
  await run(() => setScopes(me, s(fd, "id"), fd.get("personal") === "on"), "Guardado: qué compartís quedó actualizado.");
}
export async function weeklyAction(fd: FormData) {
  const me = await requirePersonal();
  await run(() => setWeekly(me, s(fd, "id"), fd.get("weekly") === "on"), "Guardado.");
}
export async function approveActionAction(fd: FormData) {
  return decideOne(fd, true);
}
export async function rejectActionAction(fd: FormData) {
  return decideOne(fd, false);
}
async function decideOne(fd: FormData, ok: boolean) {
  const me = await requirePersonal();
  await run(() => decideAction(me, s(fd, "action"), ok), ok ? "Aprobado: ya se aplicó." : "Rechazado.");
}
export async function startClosingAction(fd: FormData) {
  const me = await requirePersonal();
  await run(() => startClosing(me, "usuario", s(fd, "id"), s(fd, "reason")), "Iniciaste el cierre. El estudio queda en solo lectura por 30 días.");
}
export async function closingClearAction(fd: FormData) {
  const me = await requirePersonal();
  await run(() => closingCheck(me, "usuario", s(fd, "id"), "constancia"), "Dejaste constancia de que nadie le debe nada a nadie.");
}
export async function disputeAction(fd: FormData) {
  const me = await requirePersonal();
  await run(() => openDispute(me, "usuario", s(fd, "id"), s(fd, "message")), "Abriste una disputa: hablen por acá hasta resolverla.");
}
export async function disputeMessageAction(fd: FormData) {
  const me = await requirePersonal();
  await run(() => postDisputeMessage(me, "usuario", s(fd, "id"), s(fd, "message")), "Mensaje enviado.");
}
export async function resolveDisputeAction(fd: FormData) {
  const me = await requirePersonal();
  await run(() => resolveDispute(me, "usuario", s(fd, "id")), "Resuelto: siguen con el cierre.");
}
export async function rateAction(fd: FormData) {
  return rateOne(fd, false);
}
export async function skipRatingAction(fd: FormData) {
  return rateOne(fd, true);
}
async function rateOne(fd: FormData, skip: boolean) {
  const me = await requirePersonal();
  const kind = s(fd, "kind") === "cierre" ? "cierre" : "periodica";
  await run(() => rate(me, s(fd, "id"), kind, { score: Number(s(fd, "score")), comment: s(fd, "comment"), skip }), skip ? "Listo, te volvemos a preguntar más adelante." : "¡Gracias! Tu opinión queda guardada.");
}
