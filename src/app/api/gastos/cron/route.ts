import { cronAuthorized, unauthorized } from "@/lib/http";
import { withJobLease } from "@/lib/jobs";
import { runGastosJobs } from "@/modules/gastos/server/jobs";

export const dynamic = "force-dynamic";

/** Gastos recurrentes y recordatorios desde un cron externo (Authorization: Bearer <CRON_SECRET>) */
export async function POST(request: Request) {
  if (!cronAuthorized(request)) return unauthorized();
  return Response.json((await withJobLease("gastos", 60 * 60_000, () => runGastosJobs())) ?? { ocupado: true });
}
