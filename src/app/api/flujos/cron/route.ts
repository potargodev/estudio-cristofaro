import { cronAuthorized, unauthorized } from "@/lib/http";
import { withJobLease } from "@/lib/jobs";
import { runFlowWorker } from "@/modules/flows/engine";
import { runFlowScans } from "@/modules/flows/scans";

export const dynamic = "force-dynamic";

/** Motor de flujos desde un cron externo (Authorization: Bearer <CRON_SECRET>); ?escaneo=1 también corre los eventos por tiempo */
export async function POST(request: Request) {
  if (!cronAuthorized(request)) return unauthorized();
  const scans = new URL(request.url).searchParams.get("escaneo") === "1" ? ((await withJobLease("escaneo", 60 * 60_000, () => runFlowScans())) ?? 0) : 0;
  const r = await withJobLease("flujos", 5 * 60_000, async () => {
    const a = await runFlowWorker();
    // Una segunda vuelta toma las corridas que crearon los eventos recién encolados
    const b = await runFlowWorker();
    return { created: a.created + b.created, ran: a.ran + b.ran };
  });
  if (!r) return Response.json({ ocupado: true });
  return Response.json({ eventos: scans, creadas: r.created, ejecutadas: r.ran });
}
