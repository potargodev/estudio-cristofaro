import { audit } from "@/lib/audit";
import { getSessionUser } from "@/lib/auth";
import { reportResponse } from "@/lib/export-table";
import { isUuid } from "@/lib/ids";
import { isStudioRole } from "@/lib/roles";
import { studioOrganization } from "@/lib/organizations";
import { ivaDigitalZip, ivaReport } from "@/modules/iva/export";
import { bookFor, IvaError } from "@/modules/iva/server";

export const dynamic = "force-dynamic";

/** Libro IVA de un período en Excel, PDF o los archivos del Libro IVA Digital (ZIP): solo el equipo del estudio */
export async function GET(req: Request, { params }: { params: Promise<{ org: string }> }) {
  const { org: orgId } = await params;
  const me = await getSessionUser();
  if (!me) return new Response("No autorizado", { status: 401 });
  const q = new URL(req.url).searchParams;
  const book = q.get("libro") === "ventas" ? "ventas" : "compras";
  const format = ["pdf", "digital"].includes(q.get("formato") ?? "") ? q.get("formato")! : "xlsx";
  const period = q.get("periodo") ?? "";
  const cuit = (q.get("cuit") ?? "").replace(/\D/g, "") || null;
  const org = isStudioRole(me.role) && me.tenantKind === "studio" && isUuid(orgId) ? await studioOrganization(orgId, me.studioId) : null;
  if (!org) {
    await audit({ studioId: me.studioId, actor: me, action: "iva.exportar", entityType: "organizacion", entityId: orgId, result: "denegado" });
    return new Response("No encontrado", { status: 404 });
  }
  try {
    const rows = await bookFor({ studioId: me.studioId, organizationId: org.id }, period, book, cuit);
    await audit({ studioId: me.studioId, organizationId: org.id, actor: me, action: "iva.exportar", entityType: "organizacion", entityId: org.id, metadata: { libro: book, periodo: period, cuit, formato: format, comprobantes: rows.length } });
    const name = `libro-iva-${book}-${period}-${org.name}`;
    if (format === "digital") {
      const zip = ivaDigitalZip(rows, book, { period, cuit });
      return new Response(Buffer.from(zip), { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${name}-digital.zip`)}`, "Cache-Control": "no-store" } });
    }
    return reportResponse(ivaReport(rows, book, { org: org.name, period, cuit, demo: me.isDemo }), format, name);
  } catch (e) {
    if (e instanceof IvaError) return new Response(e.message, { status: 400 });
    throw e;
  }
}
