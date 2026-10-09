import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { client_users, documents } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { isUuid } from "@/lib/ids";
import { readStored } from "@/lib/uploads";

export const dynamic = "force-dynamic";

const notFound = () => new Response("No encontrado", { status: 404 });

/**
 * Única forma de bajar un archivo. Lo puede ver:
 * - alguien del estudio (admin o contador) del mismo estudio, o
 * - un usuario cliente vinculado (client_users) al cliente del documento.
 * Para cualquier otro caso responde 404 (no revela si el archivo existe).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return new Response("No autorizado", { status: 401 });
  if (!isUuid(id)) return notFound();

  const db = getDb();
  const [doc] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, id), eq(documents.studio_id, user.studioId)));
  if (!doc) return notFound();

  if (user.role === "cliente") {
    const [link] = await db
      .select({ clientId: client_users.client_id })
      .from(client_users)
      .where(and(eq(client_users.user_id, user.id), eq(client_users.client_id, doc.client_id)));
    if (!link) return notFound();
  } else if (user.role !== "admin" && user.role !== "contador") {
    return notFound();
  }

  let file: Awaited<ReturnType<typeof readStored>>;
  try {
    file = await readStored(doc.storage_path);
  } catch (error) {
    console.error("[archivos] No se pudo leer", doc.storage_path, (error as Error).message);
    return notFound();
  }

  const asciiName = doc.name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return new Response(new Uint8Array(file.data), {
    headers: {
      "Content-Type": doc.mime_type ?? "application/octet-stream",
      "Content-Length": String(file.size),
      "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(doc.name)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
