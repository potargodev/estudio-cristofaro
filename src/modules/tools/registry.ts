import "server-only";
import { z } from "zod/v4";
import { agendaTools } from "./modulos/agenda";
import { conexionesTools } from "./modulos/conexiones";
import { consultasTools } from "./modulos/consultas";
import { documentosTools } from "./modulos/documentos";
import { estudioTools } from "./modulos/estudio";
import { gastosTools } from "./modulos/gastos";
import { organizacionesTools } from "./modulos/organizaciones";
import { solicitudesTools } from "./modulos/solicitudes";
import { vencimientosTools } from "./modulos/vencimientos";
import type { ToolDefinition, ToolLevel } from "./types";

// Registro único: lo que acá no está, no existe para el Asistente ni para MCP.

export const TOOLS: ToolDefinition[] = [
  ...organizacionesTools,
  ...vencimientosTools,
  ...documentosTools,
  ...solicitudesTools,
  ...agendaTools,
  ...consultasTools,
  ...estudioTools,
  ...conexionesTools,
  ...gastosTools,
];

const BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));
if (BY_NAME.size !== TOOLS.length) throw new Error("Hay herramientas con el mismo nombre en el registro");

export const getTool = (name: string) => BY_NAME.get(name);

/** Nivel "máximo" que puede tener una herramienta (para listar y para los alcances) */
export function maxLevel(t: ToolDefinition): ToolLevel {
  if (typeof t.level === "string") return t.level;
  return "sensible";
}

/** Nivel efectivo para una entrada concreta */
export function levelFor(t: ToolDefinition, input: unknown): ToolLevel {
  return typeof t.level === "string" ? t.level : t.level(input as never);
}

/** JSON Schema de la entrada (lo usan MCP y el Asistente) */
export function inputJsonSchema(t: ToolDefinition): Record<string, unknown> {
  const schema = z.toJSONSchema(t.input as z.ZodType, { io: "input", target: "draft-7" }) as Record<string, unknown>;
  delete schema.$schema;
  return schema;
}
