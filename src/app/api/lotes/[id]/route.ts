import { audit } from "@/lib/audit";
import { getSessionUser } from "@/lib/auth";
import { reportResponse } from "@/lib/export-table";
import { isStudioRole } from "@/lib/roles";
import { personalIssuer } from "@/modules/arca/server";
import { BatchError, type BatchScope } from "@/modules/lotes/server";
import { batchReport, batchZip } from "@/modules/lotes/send";

export const dynamic = "force-dynamic";

/** Informe de un lote (Excel o PDF) o el ZIP con los PDF emitidos: el estudio o el titular de la cuenta */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getSessionUser();
  if (!me) return new Response("No autorizado", { status: 401 });
  let scope: BatchScope | null = null;
  if (me.tenantKind === "studio" && isStudioRole(me.role)) scope = { studioId: me.studioId, organizationId: null, cuit: null, canEmit: false };
  else if (me.role === "titular") {
    const s = await personalIssuer(me).catch(() => null);
    if (s) scope = { studioId: me.studioId, organizationId: s.organizationId, cuit: s.cuit, canEmit: false };
  }
  if (!scope) return new Response("No encontrado", { status: 404 });
  const format = new URL(req.url).searchParams.get("formato") ?? "xlsx";
  try {
    if (format === "zip") {
      const zip = await batchZip(scope, id);
      await audit({ studioId: me.studioId, actor: me, action: "lote.descargar", entityType: "lote", entityId: id, metadata: { formato: "zip" } });
      return new Response(new Uint8Array(zip), { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="lote-${id.slice(0, 8)}.zip"`, "Cache-Control": "private, no-store" } });
    }
    const report = await batchReport(scope, id);
    await audit({ studioId: me.studioId, actor: me, action: "lote.descargar", entityType: "lote", entityId: id, metadata: { formato: format } });
    return reportResponse(report, format, `lote-${id.slice(0, 8)}`);
  } catch (e) {
    if (e instanceof BatchError) {
      await audit({ studioId: me.studioId, actor: me, action: "lote.descargar", entityType: "lote", entityId: id, result: "denegado" });
      return new Response("No encontrado", { status: 404 });
    }
    throw e;
  }
}
