import { cronAuthorized, unauthorized } from "@/lib/http";
import { withJobLease } from "@/lib/jobs";
import { runBillingJobs } from "@/modules/lotes/jobs";

export const dynamic = "force-dynamic";

/** Cola de ARCA, lotes, recurrentes y resumen diario desde un cron externo (Authorization: Bearer <CRON_SECRET>) */
export async function POST(request: Request) {
  if (!cronAuthorized(request)) return unauthorized();
  return Response.json((await withJobLease("facturacion", 5 * 60_000, () => runBillingJobs())) ?? { ocupado: true });
}
