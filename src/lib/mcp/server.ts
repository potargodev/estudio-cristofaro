import "server-only";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema, type CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { mcp_accesses, mcp_calls, type users } from "@/db/schema";
import { executeTool, getTool, inputJsonSchema, maxLevel, TOOLS, toolAllowed, type ToolContext, type ToolModule } from "@/modules/tools";
import type { McpAccess } from "./tokens";

// Faro como servidor MCP: expone las herramientas del registro con los límites
// del acceso (módulos, lectura/escritura y organizaciones) y el rol de quien
// lo creó. Cada llamada queda en mcp_calls y en la auditoría (executeTool).

export function mcpToolContext(access: McpAccess, user: typeof users.$inferSelect): ToolContext {
  return {
    studioId: access.studio_id,
    actor: { id: user.id, email: user.email, name: user.name, role: user.role === "admin" ? "admin" : "contador" },
    origin: "mcp",
    organizationIds: access.organization_ids ?? null,
    modules: access.modules.length ? (access.modules as ToolModule[]) : null,
    canWrite: access.can_write,
    mcpAccessId: access.id,
  };
}

async function logCall(access: McpAccess, method: string, tool: string | null, result: string, started: number, message?: string) {
  try {
    const db = getDb();
    await db.insert(mcp_calls).values({ studio_id: access.studio_id, access_id: access.id, method, tool, result, duration_ms: Date.now() - started, message: message?.slice(0, 500) ?? null });
    await db.update(mcp_accesses).set({ last_used_at: new Date() }).where(eq(mcp_accesses.id, access.id));
  } catch (error) {
    console.error("[mcp] No se pudo registrar la llamada", error);
  }
}

const LEVEL_HINT = {
  lectura: "Solo lectura.",
  escritura: "Escribe datos en Faro.",
  sensible: "Acción sensible: NO se ejecuta directo, crea una propuesta en la bandeja de Aprobaciones de Faro.",
};

export function createFaroMcpServer(access: McpAccess, user: typeof users.$inferSelect) {
  const ctx = mcpToolContext(access, user);
  const visible = TOOLS.filter((t) => toolAllowed(t, ctx) && (ctx.canWrite || maxLevel(t) === "lectura"));
  const server = new Server(
    { name: "faro", title: "Faro", version: "1.0.0" },
    {
      capabilities: { tools: {} },
      instructions:
        "Faro es la plataforma de gestión del estudio contable. Usá las herramientas para consultar organizaciones, vencimientos, documentos, solicitudes, agenda y conexiones. Las acciones sensibles (comunicaciones a clientes, pagos, datos fiscales) quedan como propuesta en Aprobaciones: avisale a la persona que alguien del estudio las tiene que aprobar.",
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const started = Date.now();
    await logCall(access, "tools/list", null, "ok", started);
    return {
      tools: visible.map((t) => {
        const level = maxLevel(t);
        return {
          name: t.name,
          title: t.title,
          description: `${t.description} ${LEVEL_HINT[level]}`,
          inputSchema: inputJsonSchema(t) as { type: "object"; properties?: Record<string, object> },
          annotations: { title: t.title, readOnlyHint: level === "lectura", destructiveHint: false, openWorldHint: false },
        };
      }),
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (req): Promise<CallToolResult> => {
    const started = Date.now();
    const name = req.params.name;
    // Una herramienta que el acceso no lista tampoco se puede llamar
    if (!visible.some((t) => t.name === name)) {
      const exists = Boolean(getTool(name));
      await executeTool(name, req.params.arguments ?? {}, ctx); // deja la denegación en la auditoría
      await logCall(access, "tools/call", name, "denegado", started, exists ? "Fuera del alcance del acceso" : "No existe");
      return { isError: true, content: [{ type: "text", text: exists ? "Esta herramienta no está dentro del alcance de este acceso." : "Esa herramienta no existe." }] };
    }
    const outcome = await executeTool(name, req.params.arguments ?? {}, ctx);
    switch (outcome.status) {
      case "ok":
        await logCall(access, "tools/call", name, "ok", started);
        return {
          content: [{ type: "text", text: JSON.stringify(outcome.result, null, 2) }],
          structuredContent: outcome.result && typeof outcome.result === "object" && !Array.isArray(outcome.result) ? (outcome.result as Record<string, unknown>) : undefined,
        };
      case "aprobacion":
      case "confirmacion":
        await logCall(access, "tools/call", name, "aprobacion", started);
        return {
          content: [
            {
              type: "text",
              text: `Enviado a aprobación: "${outcome.summary}". No se ejecutó: queda en la bandeja de Aprobaciones de Faro (id ${outcome.approvalId}) hasta que alguien del estudio la apruebe.`,
            },
          ],
          structuredContent: { estado: "enviado_a_aprobacion", aprobacion_id: outcome.approvalId, resumen: outcome.summary },
        };
      case "denegado":
        await logCall(access, "tools/call", name, "denegado", started, outcome.message);
        return { isError: true, content: [{ type: "text", text: outcome.message }] };
      case "error":
        await logCall(access, "tools/call", name, "error", started, outcome.message);
        return { isError: true, content: [{ type: "text", text: outcome.message }] };
    }
  });

  return server;
}
