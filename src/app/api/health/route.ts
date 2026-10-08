import { sql } from "drizzle-orm";
import { getDb } from "@/db";

export const dynamic = "force-dynamic";

// Healthcheck para Easypanel: 200 si la app responde y la base contesta, 503 si no.
export async function GET() {
  try {
    await getDb().execute(sql`select 1`);
    return Response.json({ ok: true, db: "ok" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[health] La base no responde", (error as Error).message);
    return Response.json({ ok: false, db: "error" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
