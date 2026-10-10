import { timingSafeEqual } from "node:crypto";
import { runGastosJobs } from "@/modules/gastos/server/jobs";

export const dynamic = "force-dynamic";

/** Gastos recurrentes y recordatorios desde un cron externo (Authorization: Bearer <CRON_SECRET>) */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) {
    return new Response("No autorizado", { status: 401 });
  }
  return Response.json(await runGastosJobs());
}
