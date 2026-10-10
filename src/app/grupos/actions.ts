"use server";

import { headers, cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth-server";
import { fileFromForm } from "@/lib/uploads";
import { GUEST_COOKIE, homeOf } from "@/modules/gastos/server/actor";
import { getGastosActor } from "@/modules/gastos/server/session";
import { parseExpensePayload } from "@/modules/gastos/server/forms";
import { fxRate } from "@/modules/gastos/server/fx";
import { readReceipt, type ReceiptGuess } from "@/modules/gastos/server/receipt";
import * as svc from "@/modules/gastos/server/service";
import { parseAmount } from "@/modules/gastos/core/split";

// Acciones de grupos de gastos. Cada una resuelve el actor en el servidor y
// delega en el servicio, que valida que sea integrante del grupo.

export type FormState = { ok?: boolean; message?: string; link?: string | null };

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

async function actor() {
  const a = await getGastosActor();
  if (!a) redirect("/grupos/entrar");
  return a;
}

async function attempt(fn: () => Promise<FormState | void>): Promise<FormState> {
  try {
    return (await fn()) ?? { ok: true };
  } catch (e) {
    if (e instanceof svc.GastosError) return { ok: false, message: e.message };
    throw e;
  }
}

export async function createGroupAction(_: FormState, fd: FormData): Promise<FormState> {
  const a = await actor();
  let id = "";
  const r = await attempt(async () => {
    const g = await svc.createGroup(a, {
      name: str(fd, "name"),
      type: str(fd, "type"),
      baseCurrency: str(fd, "currency"),
      color: str(fd, "color"),
      context: str(fd, "context"),
      simplify: fd.get("simplify") === "on",
    });
    id = g.id;
  });
  if (!r.ok) return r;
  redirect(`/grupos/g/${id}?nuevo=1`);
}

export async function updateGroupAction(_: FormState, fd: FormData): Promise<FormState> {
  const a = await actor();
  const groupId = str(fd, "group");
  return attempt(async () => {
    await svc.updateGroup(a, groupId, { name: str(fd, "name"), simplify: fd.get("simplify") === "on", reminders: str(fd, "reminders"), color: str(fd, "color") || undefined });
    revalidatePath(`/grupos/g/${groupId}`);
    return { ok: true, message: "Guardamos la configuración." };
  });
}

export async function toggleSimplifyAction(fd: FormData) {
  const a = await actor();
  const groupId = str(fd, "group");
  try {
    await svc.updateGroup(a, groupId, { simplify: fd.get("simplify") === "1" });
  } catch (e) {
    if (!(e instanceof svc.GastosError)) throw e;
  }
  revalidatePath(`/grupos/g/${groupId}`);
}

export async function archiveGroupAction(fd: FormData) {
  const a = await actor();
  try {
    await svc.archiveGroup(a, str(fd, "group"));
  } catch (e) {
    if (!(e instanceof svc.GastosError)) throw e;
  }
  redirect("/grupos");
}

export async function inviteAction(_: FormState, fd: FormData): Promise<FormState> {
  const a = await actor();
  const groupId = str(fd, "group");
  return attempt(async () => {
    const r = await svc.inviteMember(a, groupId, { name: str(fd, "name"), email: str(fd, "email") });
    revalidatePath(`/grupos/g/${groupId}`);
    return {
      ok: true,
      link: r.link,
      message: r.link ? (r.mailed ? "Le mandamos el enlace por mail. También podés copiarlo." : "Copiá el enlace y pasáselo: entra sin crear una cuenta.") : "Ya tiene cuenta en Faro: lo va a ver en su panel.",
    };
  });
}

export async function renewLinkAction(_: FormState, fd: FormData): Promise<FormState> {
  const a = await actor();
  return attempt(async () => ({ ok: true, link: await svc.renewGuestLink(a, str(fd, "group"), str(fd, "member")), message: "Enlace nuevo: el anterior ya no sirve." }));
}

export async function updateMeAction(_: FormState, fd: FormData): Promise<FormState> {
  const a = await actor();
  const groupId = str(fd, "group");
  return attempt(async () => {
    await svc.updateMyMember(a, groupId, { alias: str(fd, "alias"), cvu: str(fd, "cvu"), optOut: fd.get("optout") === "on" });
    revalidatePath(`/grupos/g/${groupId}`);
    return { ok: true, message: "Guardamos tus datos." };
  });
}

export async function removeMemberAction(fd: FormData) {
  const a = await actor();
  const groupId = str(fd, "group");
  try {
    await svc.removeMember(a, groupId, str(fd, "member"));
  } catch (e) {
    if (!(e instanceof svc.GastosError)) throw e;
    redirect(`/grupos/g/${groupId}?tab=integrantes&error=${encodeURIComponent(e.message)}`);
  }
  revalidatePath(`/grupos/g/${groupId}`);
}

export async function createExpenseAction(_: FormState, fd: FormData): Promise<FormState> {
  const a = await actor();
  const groupId = str(fd, "group");
  const r = await attempt(async () => {
    const input = parseExpensePayload(fd.get("payload"));
    await svc.createExpense(a, groupId, { ...input, receipt: fileFromForm(fd, "receipt") });
  });
  if (!r.ok) return r;
  revalidatePath(`/grupos/g/${groupId}`);
  redirect(`/grupos/g/${groupId}?guardado=gasto`);
}

export async function deleteExpenseAction(fd: FormData) {
  const a = await actor();
  const groupId = str(fd, "group");
  try {
    await svc.deleteExpense(a, groupId, str(fd, "expense"));
  } catch (e) {
    if (!(e instanceof svc.GastosError)) throw e;
    redirect(`/grupos/g/${groupId}?error=${encodeURIComponent(e.message)}`);
  }
  redirect(`/grupos/g/${groupId}?guardado=borrado`);
}

export async function stopRecurrenceAction(fd: FormData) {
  const a = await actor();
  const groupId = str(fd, "group");
  const expenseId = str(fd, "expense");
  try {
    await svc.stopRecurrence(a, groupId, expenseId);
  } catch (e) {
    if (!(e instanceof svc.GastosError)) throw e;
  }
  revalidatePath(`/grupos/g/${groupId}/gasto/${expenseId}`);
}

export async function settleAction(_: FormState, fd: FormData): Promise<FormState> {
  const a = await actor();
  const groupId = str(fd, "group");
  const amount = parseAmount(str(fd, "amount"));
  const r = await attempt(async () => {
    const method = str(fd, "method") as svc.NewSettlement["method"];
    const s = await svc.recordSettlement(a, groupId, {
      from: str(fd, "from"),
      to: str(fd, "to"),
      amount: amount ?? 0,
      currency: str(fd, "currency"),
      method,
      note: str(fd, "note"),
      receipt: fileFromForm(fd, "receipt"),
    });
    if (s.payment_link) return { ok: true, link: s.payment_link, message: "Registramos el pago. Abrí el link de Mercado Pago para pagar." };
  });
  if (!r.ok || r.link) {
    if (r.ok) revalidatePath(`/grupos/g/${groupId}`);
    return r;
  }
  revalidatePath(`/grupos/g/${groupId}`);
  redirect(`/grupos/g/${groupId}?tab=saldos&guardado=pago`);
}

export async function answerSettlementAction(fd: FormData) {
  const a = await actor();
  const groupId = str(fd, "group");
  try {
    await svc.answerSettlement(a, groupId, str(fd, "settlement"), fd.get("accept") === "1");
  } catch (e) {
    if (!(e instanceof svc.GastosError)) throw e;
  }
  revalidatePath(`/grupos/g/${groupId}`);
}

export async function partnerMovementAction(_: FormState, fd: FormData): Promise<FormState> {
  const a = await actor();
  const groupId = str(fd, "group");
  return attempt(async () => {
    await svc.addPartnerMovement(a, groupId, {
      memberId: str(fd, "member"),
      kind: str(fd, "kind") === "retiro" ? "retiro" : "aporte",
      amount: parseAmount(str(fd, "amount")) ?? 0,
      currency: str(fd, "currency"),
      date: str(fd, "date"),
      note: str(fd, "note"),
    });
    revalidatePath(`/grupos/g/${groupId}`);
    return { ok: true, message: "Movimiento registrado." };
  });
}

export async function commentAction(_: FormState, fd: FormData): Promise<FormState> {
  const a = await actor();
  const groupId = str(fd, "group");
  return attempt(async () => {
    await svc.addComment(a, groupId, { expenseId: str(fd, "expense") || null, body: str(fd, "body") });
    revalidatePath(`/grupos/g/${groupId}`, "layout");
    return { ok: true };
  });
}

/** Cotización para mostrar en el formulario (la que se guarda se vuelve a pedir en el servidor si no viene) */
export async function fxAction(from: string, to: string, source: "oficial" | "mep"): Promise<number | null> {
  const a = await getGastosActor();
  if (!a || (source !== "oficial" && source !== "mep")) return null;
  return fxRate(from.slice(0, 3), to.slice(0, 3), source);
}

/** Lee un ticket con IA (si el plan lo incluye): devuelve una propuesta para revisar */
export async function readReceiptAction(fd: FormData): Promise<ReceiptGuess | { error: string }> {
  const a = await getGastosActor();
  if (!a) return { error: "Tu sesión venció." };
  const file = fileFromForm(fd, "receipt");
  if (!file) return { error: "Elegí una foto del ticket." };
  return readReceipt(a.studioId, a.kind === "user" ? a.userId : null, file);
}

/** Cierra la sesión (o la invitación) y vuelve al inicio */
export async function gastosSignOut() {
  const a = await getGastosActor();
  const jar = await cookies();
  jar.delete(GUEST_COOKIE);
  if (a?.kind === "user") {
    try {
      await getAuth().api.signOut({ headers: await headers() });
    } catch {
      // sin sesión
    }
    redirect(homeOf(a) === "/admin" ? "/admin/login" : "/ingresar");
  }
  redirect("/grupos/entrar");
}
