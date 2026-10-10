import "server-only";
import { inArray, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import type { HandlerContext } from "../types";

// Utilidades compartidas por las herramientas.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** ID (uuid). Se valida con refine para que el JSON Schema quede liviano para los modelos. */
export const uuid = (descripcion: string) =>
  z
    .string()
    .length(36)
    .refine((v) => UUID_RE.test(v), "ID inválido (tiene que ser un UUID)")
    .describe(descripcion);
export const limite = z.number().int().min(1).max(100).default(20).describe("Máximo de resultados (1 a 100)");

/** Restringe un listado a las organizaciones permitidas del pedido */
export function orgFilter(ctx: HandlerContext, column: AnyPgColumn): SQL | undefined {
  if (!ctx.allowedOrganizations) return undefined;
  return inArray(column, ctx.allowedOrganizations.length ? ctx.allowedOrganizations : ["00000000-0000-0000-0000-000000000000"]);
}

export const isoDate = (d: Date | string | null) => (d ? (typeof d === "string" ? d : d.toISOString()) : null);
