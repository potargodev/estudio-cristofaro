import { cronAuthorized, unauthorized } from "@/lib/http";
import { runFlowWorker } from "@/modules/flows/engine";
import { runFlowScans } from "@/modules/flows/scans";

export const dynamic = "force-dynamic";

/** Motor de flujos desde un cron externo (Authorization: Bearer <CRON_SECRET>); ?escaneo=1 también corre los eventos por tiempo */
export async function POST(request: Request) {
  if (!cronAuthorized(request)) return unauthorized();
  const scans = new URL(request.url).searchParams.get("escaneo") === "1" ? await runFlowScans() : 0;
  const r = await runFlowWorker();
  // Una segunda vuelta toma las corridas que crearon los eventos recién encolados
  const r2 = await runFlowWorker();
  return Response.json({ eventos: scans, creadas: r.created + r2.created, ejecutadas: r.ran + r2.ran });
}
