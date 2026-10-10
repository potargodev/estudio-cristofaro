import { readStored } from "@/lib/uploads";
import { attachmentFor, MessagesError } from "@/modules/messages/server";
import { chatUser } from "@/modules/messages/session";

export const dynamic = "force-dynamic";

/** Adjunto de un mensaje: solo para integrantes vigentes de la conversación */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await chatUser();
  if (!me) return new Response("No autorizado", { status: 401 });
  const { id } = await params;
  try {
    const a = await attachmentFor(me, id);
    const { data } = await readStored(a.path);
    const inline = /^(image\/(png|jpe?g|webp)|application\/pdf)$/.test(a.mime);
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": a.mime,
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(a.name)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    if (e instanceof MessagesError) return new Response("No encontrado", { status: 404 });
    throw e;
  }
}
