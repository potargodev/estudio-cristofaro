import { bus, type ChatEvent } from "@/modules/messages/realtime";
import { myConversationIds } from "@/modules/messages/server";
import { chatUser } from "@/modules/messages/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Tiempo real (SSE): solo ids de los eventos de las conversaciones del
 * usuario; el contenido se pide aparte, con permisos. Latido cada 25 s.
 */
export async function GET(req: Request) {
  const me = await chatUser();
  if (!me) return new Response("No autorizado", { status: 401 });
  let convs = new Set(await myConversationIds(me.id));
  const enc = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          cleanup();
        }
      };
      const onEvent = async (e: ChatEvent) => {
        if (e.type === "membership") {
          if (!e.userIds.includes(me.id)) return;
          convs = new Set(await myConversationIds(me.id));
          return send("membership", {});
        }
        if (!convs.has(e.conversationId)) return;
        if (e.type === "typing" && e.userId === me.id) return;
        send(e.type, e);
      };
      const b = bus();
      b.on("event", onEvent);
      const beat = setInterval(() => send("ping", {}), 25_000);
      send("ready", {});
      cleanup = () => {
        clearInterval(beat);
        b.off("event", onEvent);
        try {
          controller.close();
        } catch {
          // ya cerrado
        }
      };
      req.signal.addEventListener("abort", () => cleanup());
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
}
