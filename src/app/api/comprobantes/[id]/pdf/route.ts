import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { commercial_docs } from "@/db/schema";
import { audit } from "@/lib/audit";
import { getMemberships, getSessionUser } from "@/lib/auth";
import { isUuid } from "@/lib/ids";
import { can } from "@/lib/permissions";
import { isStudioRole } from "@/lib/roles";
import { commercialPdf, issuerOf } from "@/modules/facturacion-plus/pdf";

export const dynamic = "force-dynamic";

/** PDF de un presupuesto, remito o recibo: el estudio, el titular de la cuenta o un miembro que ve documentos */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getSessionUser();
  if (!me) return new Response("No autorizado", { status: 401 });
  if (!isUuid(id)) return new Response("No encontrado", { status: 404 });
  const [d] = await getDb().select().from(commercial_docs).where(and(eq(commercial_docs.id, id), eq(commercial_docs.studio_id, me.studioId)));
  let ok = !!d && (isStudioRole(me.role) || me.role === "titular");
  if (d && !ok) {
    const m = (await getMemberships(me.id, me.studioId)).find((x) => x.organizationId === d.organization_id);
    ok = !!m && can(m.role, "documentos.ver");
  }
  if (!d || !ok) {
    await audit({ studioId: me.studioId, actor: me, action: "comprobante.descargar", entityType: "comercial", entityId: id, result: "denegado" });
    return new Response("No encontrado", { status: 404 });
  }
  const pdf = await commercialPdf(d, await issuerOf(d), { demo: me.isDemo });
  return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${d.kind}-${String(d.number).padStart(8, "0")}.pdf"`, "Cache-Control": "private, no-store" } });
}
