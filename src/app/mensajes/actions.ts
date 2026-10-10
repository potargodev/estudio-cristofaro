"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as m from "@/modules/messages/server";
import { requireChatUser } from "@/modules/messages/session";

// Acciones de Mensajes: el usuario sale de la sesión y el servicio valida que
// comparta el espacio o la conversación. Los ids del navegador solo eligen.

export type ChatState = { ok?: boolean; message?: string };
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

async function attempt<T>(fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; message: string }> {
  try {
    return { ok: true, value: await fn() };
  } catch (e) {
    if (e instanceof m.MessagesError) return { ok: false, message: e.message };
    throw e;
  }
}

export async function openDirectAction(fd: FormData) {
  const me = await requireChatUser();
  const r = await attempt(() => m.openDirect(me, str(fd, "user")));
  if (!r.ok) redirect(`/mensajes/nueva?error=${encodeURIComponent(r.message)}`);
  redirect(`/mensajes/${r.value}`);
}

export async function createGroupChatAction(_: ChatState, fd: FormData): Promise<ChatState> {
  const me = await requireChatUser();
  const ids = fd.getAll("users").map(String);
  const r = await attempt(() => (fd.get("canal") === "1" ? m.createTeamChannel(me, str(fd, "title"), ids) : m.createGroupChat(me, str(fd, "title"), ids)));
  if (!r.ok) return { ok: false, message: r.message };
  redirect(`/mensajes/${r.value}`);
}

export async function editMessageAction(id: string, body: string): Promise<ChatState> {
  const me = await requireChatUser();
  const r = await attempt(() => m.editMessage(me, id, body));
  return r.ok ? { ok: true } : { ok: false, message: r.message };
}

export async function deleteMessageAction(id: string): Promise<ChatState> {
  const me = await requireChatUser();
  const r = await attempt(() => m.deleteMessage(me, id));
  return r.ok ? { ok: true } : { ok: false, message: r.message };
}

export async function markReadAction(conversationId: string) {
  const me = await requireChatUser();
  await attempt(() => m.markRead(me, conversationId));
}

export async function typingAction(conversationId: string) {
  const me = await requireChatUser();
  await attempt(() => m.typing(me, conversationId));
}

export async function muteAction(conversationId: string, muted: boolean): Promise<ChatState> {
  const me = await requireChatUser();
  const r = await attempt(() => m.setMuted(me, conversationId, muted));
  revalidatePath("/mensajes");
  return r.ok ? { ok: true, message: muted ? "Conversación silenciada" : "Ya no está silenciada" } : { ok: false, message: r.message };
}

export async function leaveAction(conversationId: string) {
  const me = await requireChatUser();
  const r = await attempt(() => m.leaveConversation(me, conversationId));
  if (!r.ok) redirect(`/mensajes/${conversationId}?error=${encodeURIComponent(r.message)}`);
  redirect("/mensajes");
}

export async function blockAction(userId: string): Promise<ChatState> {
  const me = await requireChatUser();
  const r = await attempt(() => m.blockUser(me, userId));
  revalidatePath("/mensajes");
  return r.ok ? { ok: true, message: "Bloqueaste a esta persona. No te va a poder escribir y no vas a ver sus mensajes." } : { ok: false, message: r.message };
}

export async function unblockAction(fd: FormData) {
  const me = await requireChatUser();
  await m.unblockUser(me, str(fd, "user"));
  revalidatePath("/mensajes");
}

export async function reportAction(messageId: string, reason: string, detail: string): Promise<ChatState> {
  const me = await requireChatUser();
  const r = await attempt(() => m.reportMessage(me, messageId, reason, detail));
  return r.ok ? { ok: true, message: r.value ? "Gracias: el equipo de Faro va a revisar ese mensaje." : "Ya lo habías reportado." } : { ok: false, message: r.message };
}
