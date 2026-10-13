import { getSessionUser } from "@/lib/auth";
import { ModeError } from "@/modules/simuladores/server";
import { bankStatement } from "@/modules/simuladores/panel";

export const dynamic = "force-dynamic";

/** Parte C · Extracto bancario simulado (CSV) de una organización del espacio de la sesión */
export async function GET(req: Request) {
  const me = await getSessionUser();
  if (!me || me.role === "cliente") return new Response("No autorizado", { status: 401 });
  try {
    const { csv, name } = await bankStatement(me.studioId, me, new URL(req.url).searchParams.get("org") ?? "");
    return new Response(`﻿${csv}`, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof ModeError) return new Response(e.message, { status: 404 });
    throw e;
  }
}
