import { cronAuthorized, unauthorized } from "@/lib/http";
import { withJobLease } from "@/lib/jobs";
import { sendReminders } from "@/lib/agenda/bookings";

export const dynamic = "force-dynamic";

/**
 * Recordatorios 24 h y 1 h antes. Corren solos cada 5 minutos dentro de la app
 * (instrumentation.ts); este endpoint permite dispararlos desde un cron externo
 * con el header Authorization: Bearer <CRON_SECRET>.
 */
export async function POST(request: Request) {
  if (!cronAuthorized(request)) return unauthorized();
  // Mismo turno que la tarea interna: nunca dos envíos a la vez
  return Response.json((await withJobLease("agenda", 5 * 60_000, () => sendReminders())) ?? { ocupado: true });
}
