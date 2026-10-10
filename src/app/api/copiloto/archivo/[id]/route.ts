import { getCurrentUser } from "@/lib/auth";
import { readCopilotFile } from "@/modules/copilot/files";
import { ownMessage } from "@/modules/copilot/server";

export const dynamic = "force-dynamic";

/** Archivo de un mensaje del Vigía: solo para su dueño */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return new Response("No autorizado", { status: 401 });
  const m = await ownMessage(me.id, (await params).id);
  if (!m?.attachment_path) return new Response("No encontrado", { status: 404 });
  const data = await readCopilotFile(m.attachment_path).catch(() => null);
  if (!data) return new Response("No encontrado", { status: 404 });
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": m.attachment_mime ?? "application/octet-stream",
      "Content-Disposition": `inline; filename="${encodeURIComponent(m.attachment_name ?? "archivo")}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
