import { type NextRequest } from "next/server";
import { audit } from "@/lib/audit";
import { readStored } from "@/lib/uploads";
import { resolveScope, type Ambito } from "@/modules/smart-docs/scope";
import { getDoc } from "@/modules/smart-docs/server";

export const dynamic = "force-dynamic";

/** Archivo de un documento leído: solo dentro del alcance de la sesión (si no, 404) */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = req.nextUrl.searchParams.get("ambito");
  const ambito: Ambito = a === "estudio" || a === "personal" ? a : "bitacora";
  const r = await resolveScope(ambito, req.nextUrl.searchParams.get("org"));
  const d = await getDoc(r.scope, id);
  if (!d) return new Response("No encontrado", { status: 404 });
  let file;
  try {
    file = await readStored(d.storage_path);
  } catch {
    return new Response("No encontrado", { status: 404 });
  }
  await audit({ studioId: r.scope.studioId, organizationId: r.scope.organizationId, actor: r.actor, action: "lectura.descargar", entityType: "documento_leido", entityId: d.id });
  return new Response(new Uint8Array(file.data), { headers: { "Content-Type": d.mime_type, "Content-Disposition": `inline; filename="${encodeURIComponent(d.file_name)}"`, "Cache-Control": "private, no-store" } });
}
