import "server-only";
import type { ToolMeta } from "@/components/admin/ai/AssistantChat";

/** Títulos de las herramientas de MCP externos para las tarjetas del Asistente (se completa con el conector) */
export async function externalToolMeta(_studioId: string): Promise<Record<string, ToolMeta>> {
  return {};
}
