import { cronAuthorized, unauthorized } from "@/lib/http";
import { runGastosJobs } from "@/modules/gastos/server/jobs";

export const dynamic = "force-dynamic";

/** Gastos recurrentes y recordatorios desde un cron externo (Authorization: Bearer <CRON_SECRET>) */
export async function POST(request: Request) {
  if (!cronAuthorized(request)) return unauthorized();
  return Response.json(await runGastosJobs());
}
