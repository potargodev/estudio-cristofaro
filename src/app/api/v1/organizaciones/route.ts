import { withApi } from "@/modules/api/http";
import { apiOrganizations } from "@/modules/api/server";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  return withApi(req, async (a) => ({ body: await apiOrganizations(a) }));
}
