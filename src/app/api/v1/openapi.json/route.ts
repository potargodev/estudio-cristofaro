import { getSiteUrl } from "@/lib/runtime-config";
import { openApi } from "@/modules/api/openapi";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(openApi(getSiteUrl()), { headers: { "Cache-Control": "public, max-age=300", "Access-Control-Allow-Origin": "*" } });
}
