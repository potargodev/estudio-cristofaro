import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { organizations } from "@/db/schema";
import { audit } from "@/lib/audit";
import { getSessionUser } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { isUuid } from "@/lib/ids";
import { can } from "@/lib/permissions";
import { ownOrganization } from "@/lib/faro/tenants";
import { inventory, stockEnabled } from "@/modules/stock/server";
import { viewerFor } from "@/modules/payroll/access";

export const dynamic = "force-dynamic";

/** Inventario valorizado a una fecha en CSV: el estudio, quien ve finanzas en la organización o el titular de la cuenta */
export async function GET(req: Request) {
  const me = await getSessionUser();
  if (!me) return new Response("No autorizado", { status: 401 });
  const url = new URL(req.url);
  const orgParam = url.searchParams.get("org");
  const date = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get("fecha") ?? "") ? url.searchParams.get("fecha")! : new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  const method = url.searchParams.get("metodo") === "ultimo" ? "ultimo" : "promedio";
  let orgId: string | null = null;
  if (orgParam) {
    if (!isUuid(orgParam)) return new Response("No encontrado", { status: 404 });
    const [o] = await getDb().select({ id: organizations.id }).from(organizations).where(and(eq(organizations.id, orgParam), eq(organizations.studio_id, me.studioId)));
    const v = o ? await viewerFor(o.id, me.studioId) : null;
    if (o && v && (v.studio || (v.role && can(v.role, "finanzas.ver")))) orgId = o.id;
  } else if (me.role === "titular") orgId = (await ownOrganization(me.studioId))?.id ?? null;
  if (!orgId || !(await stockEnabled(me.studioId, orgId))) {
    await audit({ studioId: me.studioId, actor: me, action: "stock.inventario_exportado", entityType: "organizacion", entityId: orgParam ?? null, result: "denegado" });
    return new Response("No encontrado", { status: 404 });
  }
  const inv = await inventory({ studioId: me.studioId, organizationId: orgId, canManage: false }, date, method);
  const csv = toCsv([["Código", "Descripción", "Unidad", "Existencia", method === "ultimo" ? "Último costo" : "Costo promedio", "Valor"], ...inv.rows.filter((r) => r.qty !== 0).map((r) => [r.code, r.description, r.unit, r.qty, r.unitCost, r.value]), ["", "Total", "", "", "", inv.total]], { decimalComma: true, bom: true });
  await audit({ studioId: me.studioId, organizationId: orgId, actor: me, action: "stock.inventario_exportado", entityType: "organizacion", entityId: orgId, metadata: { fecha: date, metodo: method } });
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="inventario-${date}.csv"`, "Cache-Control": "private, no-store" } });
}
