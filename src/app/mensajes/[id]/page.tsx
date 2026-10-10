import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ChatRoom } from "@/components/mensajes/ChatRoom";
import { getConversation, markRead, MessagesError } from "@/modules/messages/server";
import { requireChatUser } from "@/modules/messages/session";

export const metadata: Metadata = { title: "Conversación" };

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireChatUser();
  const { id } = await params;
  let view;
  try {
    view = await getConversation(me, id);
    await markRead(me, id);
  } catch (e) {
    if (e instanceof MessagesError) notFound();
    throw e;
  }
  return <ChatRoom initial={view} meId={me.id} />;
}
