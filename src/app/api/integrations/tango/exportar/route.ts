import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { requireModule } from "@/lib/faro/require-module";
import { exportCsv } from "@/modules/tango-sync/server";

export const dynamic = "force-dynamic";

/** Comprobantes con los nombres estándar, para importar en Tango a mano (sin API) */
export async function GET() {
  const me = await requireAdmin();
  await requireModule(me.studioId, "tango");
  const csv = await exportCsv(me.studioId);
  await audit({ studioId: me.studioId, actor: me, action: "tango.exportacion", entityType: "integracion" });
  return new Response(`﻿${csv}`, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="faro-tango-comprobantes.csv"', "Cache-Control": "no-store" } });
}
