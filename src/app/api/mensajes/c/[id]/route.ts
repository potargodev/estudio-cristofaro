import { rateLimit } from "@/lib/rate-limit";
import { getConversation, MessagesError, sendMessage } from "@/modules/messages/server";
import { chatUser } from "@/modules/messages/session";
import { forbidden, sameOrigin } from "@/lib/http";

export const dynamic = "force-dynamic";

const fail = (e: unknown) => {
  if (e instanceof MessagesError) return Response.json({ error: e.message }, { status: 404 });
  console.error("[mensajes]", (e as Error).message);
  return Response.json({ error: "No pudimos completar la acción." }, { status: 500 });
};

/** La conversación (o los mensajes nuevos desde ?after=) para el usuario de la sesión */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await chatUser();
  if (!me) return Response.json({ error: "No autorizado" }, { status: 401 });
  const { id } = await params;
  try {
    return Response.json(await getConversation(me, id, new URL(req.url).searchParams.get("after")));
  } catch (e) {
    return fail(e);
  }
}

/** Mensaje nuevo (texto y/o archivo, y la respuesta a otro mensaje) */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return forbidden();
  const me = await chatUser();
  if (!me) return Response.json({ error: "No autorizado" }, { status: 401 });
  if (!rateLimit(`mensajes:${me.id}`, 40, 60_000)) return Response.json({ error: "Mandaste muchos mensajes seguidos. Esperá un momento." }, { status: 429 });
  const { id } = await params;
  const fd = await req.formData().catch(() => null);
  if (!fd) return Response.json({ error: "Pedido inválido" }, { status: 400 });
  const file = fd.get("file");
  try {
    const m = await sendMessage(me, id, { body: String(fd.get("body") ?? ""), replyTo: String(fd.get("replyTo") ?? "") || null, file: file instanceof File && file.size > 0 ? file : null });
    return Response.json({ ok: true, id: m.id });
  } catch (e) {
    if (e instanceof MessagesError) return Response.json({ error: e.message }, { status: 400 });
    return fail(e);
  }
}
