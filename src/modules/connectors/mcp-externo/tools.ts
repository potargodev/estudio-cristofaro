import "server-only";
import type { ToolSet } from "ai";
import type { ToolContext } from "@/modules/tools";

/** Herramientas de servidores MCP externos para el Asistente (se completa con el conector) */
export async function externalAssistantTools(_ctx: ToolContext): Promise<ToolSet> {
  return {};
}
