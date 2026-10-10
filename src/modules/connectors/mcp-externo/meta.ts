import "server-only";
import { and, eq } from "drizzle-orm";
import type { ToolMeta } from "@/components/admin/ai/AssistantChat";
import { getDb } from "@/db";
import { connections } from "@/db/schema";
import { assistantToolName, settingsOf } from "./client";

/** Títulos de las herramientas de MCP externos para las tarjetas del Asistente */
export async function externalToolMeta(studioId: string): Promise<Record<string, ToolMeta>> {
  const rows = await getDb()
    .select()
    .from(connections)
    .where(and(eq(connections.studio_id, studioId), eq(connections.connector, "mcp_externo")));
  const out: Record<string, ToolMeta> = {};
  for (const c of rows) {
    const s = settingsOf(c);
    for (const t of s.tools ?? []) {
      if (t.permission !== "off") out[assistantToolName(s.prefix ?? "mcp", t.name)] = { title: `${c.name} · ${t.title ?? t.name}`, level: t.permission === "escritura" ? "escritura" : "lectura" };
    }
  }
  return out;
}
