import { audit } from "@/lib/audit";
import { getSessionUser } from "@/lib/auth";
import { reportResponse } from "@/lib/export-table";
import { todayAR } from "@/lib/format";
import { isUuid } from "@/lib/ids";
import { studioOrganization } from "@/lib/organizations";
import { accountingReport, isReport } from "@/modules/contabilidad/reports";
import { AccountingError, currentYear } from "@/modules/contabilidad/server";

export const dynamic = "force-dynamic";

const date = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

/** Reportes contables de una organización en Excel o PDF: solo el estudio (dueños, contadores y colaboradores) */
export async function GET(req: Request, { params }: { params: Promise<{ org: string }> }) {
  const { org: orgId } = await params;
  const me = await getSessionUser();
  if (!me) return new Response("No autorizado", { status: 401 });
  const q = new URL(req.url).searchParams;
  const kind = q.get("reporte") ?? "";
  const org = me.tenantKind === "studio" && isUuid(orgId) ? await studioOrganization(orgId, me.studioId) : null;
  if (!org || !isReport(kind)) {
    await audit({ studioId: me.studioId, actor: me, action: "contabilidad.exportar", entityType: "organizacion", entityId: orgId, result: "denegado" });
    return new Response("No encontrado", { status: 404 });
  }
  const s = { studioId: me.studioId, organizationId: org.id };
  const fy = await currentYear(s);
  const from = date(q.get("desde")) ?? fy.start;
  const to = date(q.get("hasta")) ?? todayAR();
  try {
    const report = await accountingReport(s, org.name, kind, { from, to, code: q.get("cuenta") });
    await audit({ studioId: me.studioId, organizationId: org.id, actor: me, action: "contabilidad.exportar", entityType: "organizacion", entityId: org.id, metadata: { reporte: kind, desde: from, hasta: to, formato: q.get("formato") === "pdf" ? "pdf" : "xlsx" } });
    return reportResponse(report, q.get("formato") ?? "xlsx", `${kind}-${org.name}-${to}`);
  } catch (e) {
    if (e instanceof AccountingError) return new Response(e.message, { status: 409 });
    throw e;
  }
}
