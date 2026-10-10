import { getCurrentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { isMonth, monthOf } from "@/modules/bitacora/catalog";
import { exportCsv } from "@/modules/bitacora/server";

export const dynamic = "force-dynamic";

/** CSV de la Bitácora del mes, solo de la sesión */
export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return new Response("No autorizado", { status: 401 });
  const u = new URL(req.url);
  const mes = u.searchParams.get("mes");
  const month = isMonth(mes) ? mes : monthOf();
  const cat = u.searchParams.get("categoria");
  const csv = await exportCsv(me.id, month, cat && /^[0-9a-f-]{36}$/i.test(cat) ? cat : null);
  await audit({ studioId: me.studioId, actor: me, action: "bitacora.exportar", entityType: "bitacora", metadata: { mes: month } });
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="bitacora-${month}.csv"`, "Cache-Control": "no-store" } });
}
