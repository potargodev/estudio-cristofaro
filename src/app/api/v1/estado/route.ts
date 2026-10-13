import { publicStatus } from "@/modules/api/status";

export const dynamic = "force-dynamic";

/** Estado público de Faro y de ARCA (sin token) */
export async function GET() {
  return Response.json(await publicStatus(), { headers: { "Cache-Control": "public, max-age=30" } });
}
