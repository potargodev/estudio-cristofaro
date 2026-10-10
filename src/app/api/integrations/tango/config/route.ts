import { getCurrentUser } from "@/lib/auth";
import { buildConnectorConfig } from "@/lib/integrations/tango/config-template";
import { getSiteUrl } from "@/lib/runtime-config";

export const dynamic = "force-dynamic";

/** config.json prellenado para el conector (sin la clave: esa se muestra una sola vez). Solo admin. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== "dueno") return new Response("No autorizado", { status: 401 });
  return new Response(JSON.stringify(buildConnectorConfig(getSiteUrl()), null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": 'attachment; filename="config.json"',
      "Cache-Control": "no-store",
    },
  });
}
