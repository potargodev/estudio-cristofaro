import { getDb } from "@/db";
import { copilot_messages } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { storeCopilotFile } from "@/modules/copilot/files";
import { processMessage } from "@/modules/copilot/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Mensaje nuevo al Vigía (texto y/o un archivo: audio, foto o PDF). Se
 * guarda primero (nunca se pierde) y después se procesa; si no hay cuota,
 * queda pendiente en la cola.
 */
export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me || me.assisted) return Response.json({ error: "No autorizado" }, { status: 401 });
  if (!rateLimit(`copiloto:${me.id}`, 20, 60_000)) return Response.json({ error: "Mandaste muchos mensajes seguidos. Esperá un momento." }, { status: 429 });
  const fd = await req.formData().catch(() => null);
  if (!fd) return Response.json({ error: "Pedido inválido" }, { status: 400 });
  const text = String(fd.get("text") ?? "").trim().slice(0, 2000);
  const file = fd.get("file");
  let stored: Awaited<ReturnType<typeof storeCopilotFile>> | null = null;
  if (file instanceof File && file.size > 0) {
    stored = await storeCopilotFile(me.id, file);
    if ("error" in stored) return Response.json({ error: stored.error }, { status: 400 });
  }
  if (!text && !stored) return Response.json({ error: "Escribí algo o mandá un audio o una foto." }, { status: 400 });
  const [m] = await getDb()
    .insert(copilot_messages)
    .values({
      user_id: me.id,
      role: "usuario",
      kind: stored && !("error" in stored) ? stored.kind : "texto",
      text: text || null,
      attachment_path: stored && !("error" in stored) ? stored.path : null,
      attachment_name: stored && !("error" in stored) ? stored.name : null,
      attachment_mime: stored && !("error" in stored) ? stored.mime : null,
      status: "procesando",
    })
    .returning({ id: copilot_messages.id });
  const r = await processMessage(m.id);
  return Response.json({ ok: true, id: m.id, status: r.status });
}
