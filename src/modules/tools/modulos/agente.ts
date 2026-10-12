import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod/v4";
import { getDb } from "@/db";
import { agent_tasks, studios } from "@/db/schema";
import { AGENT_NAME } from "@/modules/agent/name";
import { defineTool, ToolError } from "../types";
import { limite, uuid } from "./helpers";

// El Vigía le pasa trabajo al Agente contable (§2.q): la carga rápida queda en
// el Vigía y lo que lleva varios pasos lo resuelve el Agente en segundo plano.
// El motor del Agente se importa al usarlo (el Agente usa este mismo registro).

export const agenteTools = [
  defineTool<{ pedido: string; organizacion_id?: string }, unknown>({
    name: "encargar_al_agente",
    title: `Encargar una tarea al ${AGENT_NAME}`,
    description: `Le pasa al ${AGENT_NAME} una tarea de varios pasos para hacer en segundo plano (cerrar un mes, revisar el IVA de la cartera, conciliar, ver quién está cerca del tope del monotributo, preparar resúmenes). Devuelve el enlace para seguir el avance.`,
    module: "agente",
    level: "escritura",
    roles: ["dueno", "contador", "colaborador", "titular"],
    input: z.object({ pedido: z.string().min(8).max(1000).describe("La tarea, en palabras de la persona"), organizacion_id: uuid("ID de la organización (si es sobre una sola)").optional() }),
    async organizationOf(input) {
      return input.organizacion_id ?? null;
    },
    describe: (i) => `Encargar al ${AGENT_NAME}: «${i.pedido.slice(0, 120)}»`,
    async handler(input, ctx) {
      const { createTask, AgentError } = await import("@/modules/agent/server");
      const [s] = await getDb().select({ kind: studios.kind }).from(studios).where(eq(studios.id, ctx.studioId));
      try {
        const id = await createTask({ ...ctx.actor, studioId: ctx.studioId, tenantKind: s?.kind ?? "studio" }, { text: input.pedido, organizationId: input.organizacion_id ?? null, scope: input.organizacion_id ? "organizacion" : null });
        return { listo: `Se la pasé al ${AGENT_NAME}`, enlace: `/admin/vigia/agente/${id}` };
      } catch (e) {
        if (e instanceof AgentError) throw new ToolError(e.message, "error");
        throw e;
      }
    },
  }),
  defineTool<{ limite: number }, unknown>({
    name: "ver_tareas_agente",
    title: `Tareas del ${AGENT_NAME}`,
    description: `Últimas tareas del ${AGENT_NAME}: estado, avance y resumen del informe.`,
    module: "agente",
    level: "lectura",
    roles: ["dueno", "contador", "colaborador", "titular"],
    input: z.object({ limite }),
    async handler(input, ctx) {
      const rows = await getDb()
        .select({ id: agent_tasks.id, title: agent_tasks.title, status: agent_tasks.status, plan: agent_tasks.plan, report: agent_tasks.report, created_at: agent_tasks.created_at })
        .from(agent_tasks)
        .where(and(eq(agent_tasks.studio_id, ctx.studioId)))
        .orderBy(desc(agent_tasks.created_at))
        .limit(input.limite);
      return {
        total: rows.length,
        tareas: rows.map((r) => ({ titulo: r.title, estado: r.status, avance: `${r.plan.filter((s) => s.status === "hecho" || s.status === "saltado" || s.status === "error").length}/${r.plan.length}`, resumen: r.report?.summary ?? null, enlace: `/admin/vigia/agente/${r.id}` })),
      };
    },
  }),
];
