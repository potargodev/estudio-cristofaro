import "server-only";
import { z } from "zod/v4";
import { createTask, listTasks, TaskError } from "@/modules/crm/server";
import { defineTool, ToolError } from "../types";
import { uuid } from "./helpers";

// Tareas del equipo para el Vigía: listar (lectura) y crear (escritura, el
// asistente pide confirmación). Son internas: no le llegan al cliente.

export const tareasTools = [
  defineTool<{ estado?: string; organizacion_id?: string; mias?: boolean }, unknown>({
    name: "listar_tareas",
    title: "Tareas del equipo",
    description: "Tareas del estudio (pendientes, en curso o hechas), con organización, responsable y vencimiento. Con mias=true, solo las de quien pregunta.",
    module: "tareas",
    level: "lectura",
    roles: ["dueno", "contador", "colaborador"],
    input: z.object({ estado: z.enum(["pendiente", "en_curso", "hecha"]).optional(), organizacion_id: uuid("ID de la organización").optional(), mias: z.boolean().optional() }),
    async organizationOf(input) {
      return input.organizacion_id ?? null;
    },
    async handler(input, ctx) {
      const rows = (await listTasks(ctx.studioId, { status: input.estado ?? null, org: input.organizacion_id ?? null, assignee: input.mias ? ctx.actor.id : null })).filter((r) => !ctx.allowedOrganizations || !r.t.organization_id || ctx.allowedOrganizations.includes(r.t.organization_id));
      return { total: rows.length, tareas: rows.slice(0, 50).map(({ t, org, assignee }) => ({ id: t.id, titulo: t.title, organizacion: org, responsable: assignee, vence: t.due_date, estado: t.status })), enlace: "/admin/tareas" };
    },
  }),
  defineTool<{ titulo: string; organizacion_id?: string; vence?: string; detalle?: string }, unknown>({
    name: "crear_tarea",
    title: "Crear una tarea",
    description: "Crea una tarea interna del equipo (a cargo de quien la pide), opcionalmente para una organización y con vencimiento.",
    module: "tareas",
    level: "escritura",
    roles: ["dueno", "contador", "colaborador"],
    input: z.object({ titulo: z.string().min(3).max(160), organizacion_id: uuid("ID de la organización").optional(), vence: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), detalle: z.string().max(2000).optional() }),
    async organizationOf(input) {
      return input.organizacion_id ?? null;
    },
    describe: (i) => `Crear la tarea «${i.titulo}»`,
    async handler(input, ctx) {
      if (input.organizacion_id) await ctx.organization(input.organizacion_id);
      try {
        const t = await createTask(ctx.studioId, ctx.actor, { title: input.titulo, detail: input.detalle ?? null, organizationId: input.organizacion_id ?? null, assigneeId: ctx.actor.id, dueDate: input.vence ?? null });
        return { tarea: t.id, enlace: "/admin/tareas" };
      } catch (e) {
        if (e instanceof TaskError) throw new ToolError(e.message, "error");
        throw e;
      }
    },
  }),
];
