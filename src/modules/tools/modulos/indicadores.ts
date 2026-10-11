import "server-only";
import { z } from "zod/v4";
import { insightsEnabled, orgInsights, studioInsights } from "@/modules/insights/server";
import { defineTool, ToolError } from "../types";
import { uuid } from "./helpers";

// Indicadores para el Vigía (solo lectura, dueños y contadores, plan Avanzado)

const last = (s: { m: string; v: number }[]) => s.slice(-3).map((p) => ({ mes: p.m, valor: Math.round(p.v) }));
async function enabled(studioId: string) {
  if (!(await insightsEnabled(studioId))) throw new ToolError("Indicadores viene con el plan Avanzado.", "sin_permiso");
}

export const indicadoresTools = [
  defineTool<Record<string, never>, unknown>({
    name: "indicadores_estudio",
    title: "Indicadores del estudio",
    description: "Tablero del estudio: organizaciones activas, honorarios cobrados y por cobrar, vencimientos a término, solicitudes y tiempo de primera respuesta (últimos meses).",
    module: "indicadores",
    level: "lectura",
    roles: ["dueno", "contador"],
    input: z.object({}),
    async handler(_i, ctx) {
      await enabled(ctx.studioId);
      if (ctx.allowedOrganizations) throw new ToolError("El tablero del estudio necesita acceso a todas las organizaciones.", "sin_permiso");
      const d = await studioInsights(ctx.studioId);
      return {
        organizaciones: d.orgs,
        honorarios: { cobrados: last(d.feesPaid), por_cobrar: d.feesPending, vencidos: d.feesOverdue },
        vencimientos_a_termino_pct: last(d.onTime),
        solicitudes: last(d.requests),
        primera_respuesta_horas: d.responseHours,
        tareas: d.tasks,
        enlace: "/admin?tab=indicadores",
      };
    },
  }),
  defineTool<{ organizacion_id: string }, unknown>({
    name: "indicadores_organizacion",
    title: "Indicadores de una organización",
    description: "Ventas, gastos y resultado por mes, vencimientos a término y próximos, honorarios pendientes de una organización.",
    module: "indicadores",
    level: "lectura",
    roles: ["dueno", "contador"],
    input: z.object({ organizacion_id: uuid("ID de la organización") }),
    async organizationOf(i) {
      return i.organizacion_id;
    },
    async handler(i, ctx) {
      await enabled(ctx.studioId);
      const org = await ctx.organization(i.organizacion_id);
      const d = await orgInsights(ctx.studioId, org.id);
      if (!d) throw new ToolError("No encontramos la organización.", "no_encontrado");
      return { organizacion: org.name, ventas: last(d.sales), gastos: last(d.expenses), resultado: last(d.result), vencimientos_a_termino_pct: last(d.onTime), proximos_30_dias: d.upcoming, honorarios_pendientes: d.feesPending, enlace: `/admin/organizaciones/${org.id}?tab=indicadores` };
    },
  }),
];
