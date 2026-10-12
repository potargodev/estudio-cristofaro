import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { payroll_items } from "@/db/schema";
import { audit } from "@/lib/audit";
import { getSessionUser } from "@/lib/auth";
import { isUuid } from "@/lib/ids";
import { receiptOf } from "@/modules/liquidacion/server";
import { canSeePayroll, viewerFor } from "@/modules/payroll/access";

export const dynamic = "force-dynamic";

/** Vista previa del recibo de una liquidación (con marca de borrador si no está aprobada): el estudio o quien ve sueldos */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getSessionUser();
  if (!me) return new Response("No autorizado", { status: 401 });
  if (!isUuid(id)) return new Response("No encontrado", { status: 404 });
  const [it] = await getDb().select({ org: payroll_items.organization_id, studio: payroll_items.studio_id }).from(payroll_items).where(and(eq(payroll_items.id, id), eq(payroll_items.studio_id, me.studioId)));
  const v = it ? await viewerFor(it.org, it.studio) : null;
  if (!it || !v || !canSeePayroll(v)) {
    await audit({ studioId: me.studioId, actor: me, action: "recibo.descargar", entityType: "recibo_liquidacion", entityId: id, result: "denegado" });
    return new Response("No encontrado", { status: 404 });
  }
  const r = await receiptOf({ studioId: it.studio, organizationId: it.org, canManage: false, fromStudio: v.studio }, id);
  if (!r) return new Response("No encontrado", { status: 404 });
  return new Response(new Uint8Array(r.pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${r.name}"`, "Cache-Control": "private, no-store" } });
}
