import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { employee_documents } from "@/db/schema";
import { audit } from "@/lib/audit";
import { getSessionUser } from "@/lib/auth";
import { isUuid } from "@/lib/ids";
import { readStored } from "@/lib/uploads";
import { canSeePayroll, viewerFor } from "@/modules/payroll/access";

export const dynamic = "force-dynamic";
const nf = () => new Response("No encontrado", { status: 404 });

/** Documento del legajo: el estudio o quien ve sueldos en la organización */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getSessionUser();
  if (!me) return new Response("No autorizado", { status: 401 });
  if (!isUuid(id)) return nf();
  const [doc] = await getDb().select().from(employee_documents).where(and(eq(employee_documents.id, id), eq(employee_documents.studio_id, me.studioId)));
  if (!doc) return nf();
  const v = await viewerFor(doc.organization_id, doc.studio_id);
  if (!v || !canSeePayroll(v)) {
    await audit({ studioId: me.studioId, organizationId: doc.organization_id, actor: me, action: "legajo.descargar", entityType: "documento_legajo", entityId: doc.id, result: "denegado" });
    return nf();
  }
  const { data } = await readStored(doc.storage_path).catch(() => ({ data: null as Buffer | null }));
  if (!data) return nf();
  await audit({ studioId: me.studioId, organizationId: doc.organization_id, actor: me, action: "legajo.descargar", entityType: "documento_legajo", entityId: doc.id });
  return new Response(new Uint8Array(data), { headers: { "Content-Type": doc.mime_type, "Content-Disposition": `inline; filename="${encodeURIComponent(doc.name)}"`, "Cache-Control": "private, no-store" } });
}
