import { timingSafeEqual } from "node:crypto";
import { sendReminders } from "@/lib/agenda/bookings";

export const dynamic = "force-dynamic";

/**
 * Recordatorios 24 h y 1 h antes. Corren solos cada 5 minutos dentro de la app
 * (instrumentation.ts); este endpoint permite dispararlos desde un cron externo
 * con el header Authorization: Bearer <CRON_SECRET>.
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) {
    return new Response("No autorizado", { status: 401 });
  }
  return Response.json(await sendReminders());
}
