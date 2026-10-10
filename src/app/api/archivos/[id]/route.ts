import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { documents, request_messages, requests } from "@/db/schema";
import { audit } from "@/lib/audit";
import { getCurrentUser, getMemberships } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { isUuid } from "@/lib/ids";
import { readStored } from "@/lib/uploads";
import { isStudioRole } from "@/lib/roles";

export const dynamic = "force-dynamic";

const notFound = () => new Response("No encontrado", { status: 404 });

/**
 * Única forma de bajar un archivo. Lo puede ver:
 * - alguien del estudio (admin o contador) del mismo estudio, o
 * - un miembro activo de la organización del documento con permiso para ver
 *   documentos, o (RRHH) el adjunto de una solicitud laboral de su organización.
 * Para cualquier otro caso responde 404 (no revela si el archivo existe).
 * Toda descarga y todo intento rechazado quedan en la auditoría.
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

  let allowed = isStudioRole(user.role) && (!user.tenantSuspended || Boolean(user.assisted));
  if (user.role === "cliente") {
    const membership = (await getMemberships(user.id, user.studioId)).find((m) => m.organizationId === doc.organization_id);
    if (membership && can(membership.role, "documentos.ver")) allowed = true;
    else if (membership && can(membership.role, "solicitudes.laborales")) {
      // Adjunto de una solicitud de personal de su organización
      const [attached] = await db
        .select({ id: request_messages.id })
        .from(request_messages)
        .innerJoin(requests, eq(requests.id, request_messages.request_id))
        .where(and(eq(request_messages.document_id, doc.id), eq(requests.organization_id, doc.organization_id), eq(requests.type, "empleado")))
        .limit(1);
      allowed = Boolean(attached);
    }
  }
  if (!allowed) {
    await audit({
      studioId: user.studioId,
      organizationId: doc.organization_id,
      actor: user,
      action: "documento.descargar",
      entityType: "documento",
      entityId: doc.id,
      result: "denegado",
    });
    return notFound();
  }

  let file: Awaited<ReturnType<typeof readStored>>;
  try {
    file = await readStored(doc.storage_path);
  } catch (error) {
    console.error("[archivos] No se pudo leer", doc.storage_path, (error as Error).message);
    return notFound();
  }

  await audit({
    studioId: user.studioId,
    organizationId: doc.organization_id,
    actor: user,
    action: "documento.descargar",
    entityType: "documento",
    entityId: doc.id,
    metadata: { nombre: doc.name },
  });
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
