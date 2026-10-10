import { audit } from "@/lib/audit";
import { auditActor } from "@/modules/gastos/server/actor";
import { getGastosActor } from "@/modules/gastos/server/session";
import { toCsv, toPdf, toXlsx } from "@/modules/gastos/server/export";
import { GastosError, getGroupView } from "@/modules/gastos/server/service";

export const dynamic = "force-dynamic";

/** Exporta un grupo (CSV, XLSX o PDF). Solo integrantes; todo queda en la auditoría. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getGastosActor();
  if (!actor) return new Response("No autorizado", { status: 401 });
  const format = new URL(request.url).searchParams.get("formato") ?? "csv";
  if (!["csv", "xlsx", "pdf"].includes(format)) return new Response("Formato inválido", { status: 400 });
  let v;
  try {
    v = await getGroupView(actor, id);
  } catch (e) {
    if (e instanceof GastosError) return new Response("No encontrado", { status: 404 });
    throw e;
  }
  await audit({ studioId: v.group.studio_id, organizationId: v.group.organization_id, ...auditActor(actor), action: "gastos.exportar", entityType: "grupo_gastos", entityId: v.group.id, metadata: { formato: format } });
  const slug = v.group.name.normalize("NFD").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "grupo";
  const headers = (type: string, ext: string) => ({ "Content-Type": type, "Content-Disposition": `attachment; filename="gastos-${slug}.${ext}"`, "Cache-Control": "private, no-store" });
  if (format === "csv") return new Response(toCsv(v), { headers: headers("text/csv; charset=utf-8", "csv") });
  if (format === "xlsx") return new Response(new Uint8Array(await toXlsx(v)), { headers: headers("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx") });
  return new Response(new Uint8Array(await toPdf(v)), { headers: headers("application/pdf", "pdf") });
}
