import "server-only";
import { z } from "zod/v4";
import { createAnnouncement, listBatches, listEmployees, PayrollError, remindUnsigned, type PayrollScope } from "@/modules/payroll/server";
import { defineTool, ToolError } from "../types";
import { uuid } from "./helpers";

// Empleados para el Vigía: consultar el legajo y el estado de las firmas es
// lectura; recordar firmas y publicar comunicados son comunicaciones a
// personas, así que siempre van a Aprobaciones.

const scopeOf = (studioId: string, organizationId: string): PayrollScope => ({ studioId, organizationId, canManage: true, fromStudio: true });
const wrap = async <T>(fn: () => Promise<T>) => {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof PayrollError) throw new ToolError(e.message, "error");
    throw e;
  }
};

export const empleadosTools = [
  defineTool<{ organizacion_id: string }, unknown>({
    name: "listar_empleados",
    title: "Empleados de una organización",
    description: "Legajo resumido de los empleados de una organización: nombre, puesto, área, CUIL, ingreso, baja y si tiene acceso al portal.",
    module: "empleados",
    level: "lectura",
    roles: ["dueno", "contador", "colaborador"],
    input: z.object({ organizacion_id: uuid("ID de la organización") }),
    async organizationOf(input) {
      return input.organizacion_id;
    },
    async handler(input, ctx) {
      const org = await ctx.organization(input.organizacion_id);
      const rows = await listEmployees(scopeOf(ctx.studioId, org.id));
      return { organizacion: org.name, total: rows.length, activos: rows.filter((e) => e.active).length, empleados: rows.map((e) => ({ nombre: `${e.first_name} ${e.last_name}`.trim(), puesto: e.position, area: e.area, cuil: e.cuil, ingreso: e.start_date, baja: e.end_date, portal: !!e.user_id })) };
    },
  }),
  defineTool<{ organizacion_id: string }, unknown>({
    name: "estado_recibos",
    title: "Estado de los recibos de sueldo",
    description: "Lotes de recibos de una organización por período: cuántos se publicaron, cuántos firmaron conforme, no conforme y cuántos faltan firmar.",
    module: "empleados",
    level: "lectura",
    roles: ["dueno", "contador", "colaborador"],
    input: z.object({ organizacion_id: uuid("ID de la organización") }),
    async organizationOf(input) {
      return input.organizacion_id;
    },
    async handler(input, ctx) {
      const org = await ctx.organization(input.organizacion_id);
      const list = await listBatches(scopeOf(ctx.studioId, org.id));
      return { organizacion: org.name, lotes: list.map(({ b, counts }) => ({ id: b.id, periodo: b.period, estado: b.status, conforme: counts.conforme ?? 0, no_conforme: counts.no_conforme ?? 0, falta_firmar: counts.publicado ?? 0, sin_asignar: counts.sin_asignar ?? 0, enlace: `/admin/organizaciones/${org.id}/sueldos/recibos/${b.id}` })) };
    },
  }),
  defineTool<{ organizacion_id: string; lote_id: string }, unknown>({
    name: "recordar_firma_recibos",
    title: "Recordar la firma de los recibos",
    description: "Manda un recordatorio a los empleados que no firmaron los recibos de un lote. Siempre queda en Aprobaciones.",
    module: "empleados",
    level: "sensible",
    roles: ["dueno", "contador", "colaborador"],
    input: z.object({ organizacion_id: uuid("ID de la organización"), lote_id: uuid("ID del lote de recibos") }),
    async organizationOf(input) {
      return input.organizacion_id;
    },
    describe: () => "Recordar la firma a quienes no firmaron",
    async handler(input, ctx) {
      const org = await ctx.organization(input.organizacion_id);
      const n = await wrap(() => remindUnsigned(scopeOf(ctx.studioId, org.id), ctx.actor, input.lote_id));
      return { recordatorios: n };
    },
  }),
  defineTool<{ organizacion_id: string; titulo: string; texto: string; area?: string; confirmar_lectura: boolean }, unknown>({
    name: "publicar_comunicado",
    title: "Publicar un comunicado interno",
    description: "Publica un comunicado de la organización a todos los empleados o a un área, con confirmación de lectura. Siempre queda en Aprobaciones.",
    module: "empleados",
    level: "sensible",
    roles: ["dueno", "contador", "colaborador"],
    input: z.object({ organizacion_id: uuid("ID de la organización"), titulo: z.string().min(3).max(140), texto: z.string().min(3).max(4000), area: z.string().max(60).optional(), confirmar_lectura: z.boolean().default(true) }),
    async organizationOf(input) {
      return input.organizacion_id;
    },
    describe: (i) => `Comunicado «${i.titulo}»${i.area ? ` al área ${i.area}` : " a todos"}`,
    async handler(input, ctx) {
      const org = await ctx.organization(input.organizacion_id);
      const r = await wrap(() => createAnnouncement(scopeOf(ctx.studioId, org.id), ctx.actor, { title: input.titulo, body: input.texto, area: input.area ?? null, requireAck: input.confirmar_lectura, files: [] }));
      return { enviado: true, destinatarios: r.recipients, enlace: `/admin/organizaciones/${org.id}/sueldos/comunicados/${r.a.id}` };
    },
  }),
];
