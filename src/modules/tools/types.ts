import type { z } from "zod/v4";

// Registro de herramientas de Faro. Cada módulo declara las suyas con nombre,
// descripción, esquema de entrada (zod → JSON Schema), nivel, roles y handler.
// Las usan el Asistente IA, el servidor MCP y (más adelante) los Flujos: todas
// pasan por executeTool(), que valida estudio, organización, rol y alcance en
// el servidor y deja todo en la auditoría.

export type ToolLevel = "lectura" | "escritura" | "sensible";
export type ToolOrigin = "asistente" | "mcp" | "flujo";
export type StaffRole = "admin" | "contador" | "colaborador" | "autonomo";

/** Módulos del registro (los alcances de MCP se eligen por módulo) */
export const TOOL_MODULES = {
  organizaciones: "Organizaciones",
  vencimientos: "Vencimientos",
  documentos: "Documentos",
  solicitudes: "Solicitudes",
  agenda: "Agenda",
  consultas: "Consultas comerciales",
  estudio: "Resumen del estudio",
  conexiones: "Conexiones (Tango, Xubio, archivos)",
} as const;
export type ToolModule = keyof typeof TOOL_MODULES;

export interface ToolActor {
  id: string;
  email: string;
  name: string;
  role: StaffRole;
}

/** Quién pide y con qué límites. Se arma SIEMPRE en el servidor (sesión o token MCP). */
export interface ToolContext {
  studioId: string;
  actor: ToolActor;
  origin: ToolOrigin;
  /** null = todas las organizaciones del estudio */
  organizationIds: string[] | null;
  /** null = todos los módulos */
  modules: ToolModule[] | null;
  /** Permite herramientas de escritura y sensibles (como propuesta) */
  canWrite: boolean;
  mcpAccessId?: string | null;
  conversationId?: string | null;
}

/** Contexto que recibe el handler: además del pedido, helpers que validan pertenencia */
export interface HandlerContext extends ToolContext {
  /** Organización del estudio y permitida en este pedido, o tira ToolError */
  organization(id: string): Promise<{ id: string; name: string }>;
  /** Filtro de organizaciones permitidas para listados (null = sin restricción) */
  allowedOrganizations: string[] | null;
}

export interface ToolDefinition<I = Record<string, unknown>, O = unknown> {
  name: string;
  /** Título corto para tarjetas y la bandeja de aprobaciones */
  title: string;
  description: string;
  module: ToolModule;
  input: z.ZodType<I>;
  /** Nivel fijo o según la entrada (ej. un vencimiento con importe o link de pago es sensible) */
  level: ToolLevel | ((input: I) => ToolLevel);
  roles: readonly StaffRole[];
  /** Organización afectada (para validarla antes de proponer y mostrarla en aprobaciones) */
  organizationOf?: (input: I, ctx: HandlerContext) => Promise<string | null>;
  /** Resumen legible de lo que se va a hacer (propuestas y confirmaciones) */
  describe?: (input: I) => string;
  handler: (input: I, ctx: HandlerContext) => Promise<O>;
}

export class ToolError extends Error {
  constructor(
    message: string,
    readonly code: "no_encontrado" | "sin_permiso" | "entrada_invalida" | "error" = "error",
  ) {
    super(message);
  }
}

export type ToolOutcome =
  | { status: "ok"; result: unknown }
  | { status: "confirmacion"; approvalId: string; summary: string }
  | { status: "aprobacion"; approvalId: string; summary: string }
  | { status: "denegado"; message: string }
  | { status: "error"; message: string };

export const defineTool = <I, O>(t: ToolDefinition<I, O>) => t as unknown as ToolDefinition;
