import { cronAuthorized, unauthorized } from "@/lib/http";
import { runCopilotJobs } from "@/modules/copilot/jobs";

export const dynamic = "force-dynamic";

/** Cola y recordatorios del Vigía desde un cron externo (Authorization: Bearer <CRON_SECRET>) */
export async function POST(request: Request) {
  if (!cronAuthorized(request)) return unauthorized();
  return Response.json(await runCopilotJobs());
}
