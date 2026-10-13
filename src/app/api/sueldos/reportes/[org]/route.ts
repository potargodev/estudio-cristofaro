import { audit } from "@/lib/audit";
import { getSessionUser } from "@/lib/auth";
import { reportResponse } from "@/lib/export-table";
import { isUuid } from "@/lib/ids";
import { studioOrganization } from "@/lib/organizations";
import { can } from "@/lib/permissions";
import { isPayrollReport, payrollReport } from "@/modules/liquidacion/reportes";
import { LiquidacionError } from "@/modules/liquidacion/server";
import { viewerFor } from "@/modules/payroll/access";

export const dynamic = "force-dynamic";

/** Reportes de cierre de sueldos en Excel o PDF: el estudio o quien gestiona sueldos en la organización */
export async function GET(req: Request, { params }: { params: Promise<{ org: string }> }) {
  const { org: orgId } = await params;
  const me = await getSessionUser();
  if (!me) return new Response("No autorizado", { status: 401 });
  const q = new URL(req.url).searchParams;
  const kind = q.get("reporte") ?? "";
  // La organización tiene que ser del estudio de la sesión (viewerFor no lo valida para el equipo del estudio)
  const org = isUuid(orgId) ? await studioOrganization(orgId, me.studioId) : null;
  const v = org ? await viewerFor(org.id, me.studioId) : null;
  if (!org || !v || !(v.studio || (v.role && can(v.role, "sueldos.gestionar"))) || !isPayrollReport(kind)) {
    await audit({ studioId: me.studioId, actor: me, action: "sueldos.reporte", entityType: "organizacion", entityId: orgId, result: "denegado" });
    return new Response("No encontrado", { status: 404 });
  }
  const runId = q.get("liquidacion");
  try {
    const report = await payrollReport({ studioId: me.studioId, organizationId: orgId, canManage: true, fromStudio: v.studio }, org.name, kind, { runId: runId && isUuid(runId) ? runId : null, from: q.get("desde") ?? undefined, to: q.get("hasta") ?? undefined, group: q.get("agrupar") });
    await audit({ studioId: me.studioId, organizationId: orgId, actor: me, action: "sueldos.reporte", entityType: "organizacion", entityId: orgId, metadata: { reporte: kind, liquidacion: runId, formato: q.get("formato") === "pdf" ? "pdf" : "xlsx" } });
    return reportResponse(report, q.get("formato") ?? "xlsx", `sueldos-${kind}-${org.name}`);
  } catch (e) {
    if (e instanceof LiquidacionError) return new Response(e.message, { status: 409 });
    throw e;
  }
}
