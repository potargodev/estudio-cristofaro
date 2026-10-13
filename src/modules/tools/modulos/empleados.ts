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
  defineTool<{ organizacion_id: string; periodo: string; tipo?: "mensual" | "sac" | "vacaciones" }, unknown>({
    name: "liquidar_sueldos",
    title: "Liquidar sueldos (borrador)",
    description: "Arma (o re-liquida) el borrador de la liquidación de sueldos de una organización para un período AAAA-MM con el convenio, la categoría y las novedades de cada empleado. Devuelve neto, costo laboral y lo raro (variaciones mayores al 20 %, faltas de datos, embargos, horas extra). Queda en borrador: una persona la revisa y la aprueba.",
    module: "empleados",
    level: "escritura",
    roles: ["dueno", "contador", "colaborador"],
    input: z.object({ organizacion_id: uuid("ID de la organización"), periodo: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).describe("AAAA-MM"), tipo: z.enum(["mensual", "sac", "vacaciones"]).optional() }),
    async organizationOf(input) {
      return input.organizacion_id;
    },
    describe: (i) => `Liquidar sueldos de ${i.periodo} (borrador)`,
    async handler(input, ctx) {
      const org = await ctx.organization(input.organizacion_id);
      const { liquidateForAgent, LiquidacionError } = await import("@/modules/liquidacion/server");
      try {
        const r = await liquidateForAgent(scopeOf(ctx.studioId, org.id), ctx.actor, input.periodo, input.tipo ?? "mensual");
        return { organizacion: org.name, liquidacion_id: r.runId, estado: r.status, empleados: r.employees, neto: r.net / 100, costo_laboral: r.cost / 100, alertas: r.alerts, escalas_a_validar: r.scalesToValidate, enlace: `/admin/organizaciones/${org.id}/sueldos/liquidacion/${r.runId}`, aviso: "Queda en borrador para revisar y aprobar. Esto no reemplaza el criterio de un contador." };
      } catch (e) {
        if (e instanceof LiquidacionError) throw new ToolError(e.message, "entrada_invalida");
        throw e;
      }
    },
  }),
  defineTool<{ organizacion_id: string }, unknown>({
    name: "resumen_liquidaciones",
    title: "Liquidaciones de sueldos",
    description: "Últimas liquidaciones de sueldos de una organización: período, tipo, estado, empleados, neto y costo laboral.",
    module: "empleados",
    level: "lectura",
    roles: ["dueno", "contador", "colaborador"],
    input: z.object({ organizacion_id: uuid("ID de la organización") }),
    async organizationOf(input) {
      return input.organizacion_id;
    },
    async handler(input, ctx) {
      const org = await ctx.organization(input.organizacion_id);
      const { listRuns } = await import("@/modules/liquidacion/server");
      const runs = await listRuns(scopeOf(ctx.studioId, org.id));
      return { organizacion: org.name, liquidaciones: runs.slice(0, 12).map((r) => ({ id: r.id, periodo: r.period, tipo: r.kind, estado: r.status, version: r.version, empleados: r.totals.employees, neto: r.totals.net / 100, costo_laboral: r.totals.cost / 100, enlace: `/admin/organizaciones/${org.id}/sueldos/liquidacion/${r.id}` })) };
    },
  }),
  defineTool<{ organizacion_id: string; periodo: string; tipo?: "control" | "costo" | "acreditacion" | "empleados" | "asiento" }, unknown>({
    name: "reporte_sueldos",
    title: "Reporte de cierre de sueldos",
    description: "Reporte de la liquidación aprobada de un período (AAAA-MM): control contra el período anterior (variaciones por empleado y por concepto), costo laboral, acreditación, nómina de empleados o asiento de sueldos. Devuelve el resumen y el enlace para descargarlo en Excel o PDF.",
    module: "empleados",
    level: "lectura",
    roles: ["dueno", "contador", "colaborador"],
    input: z.object({ organizacion_id: uuid("ID de la organización"), periodo: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).describe("AAAA-MM"), tipo: z.enum(["control", "costo", "acreditacion", "empleados", "asiento"]).optional() }),
    async organizationOf(input) {
      return input.organizacion_id;
    },
    async handler(input, ctx) {
      const org = await ctx.organization(input.organizacion_id);
      const scope = scopeOf(ctx.studioId, org.id);
      const { listRuns } = await import("@/modules/liquidacion/server");
      const run = (await listRuns(scope)).filter((r) => r.period === input.periodo && ["aprobada", "publicada"].includes(r.status)).sort((a, b) => (a.kind === "mensual" ? -1 : 1) - (b.kind === "mensual" ? -1 : 1))[0];
      if (!run) throw new ToolError(`No hay una liquidación aprobada de ${input.periodo}.`, "entrada_invalida");
      const tipo = input.tipo ?? "control";
      const { payrollControl, payrollReport } = await import("@/modules/liquidacion/reportes");
      const descarga = (f: string) => `/api/sueldos/reportes/${org.id}?reporte=${tipo}&liquidacion=${run.id}&formato=${f}`;
      if (tipo === "control") {
        const c = await payrollControl(scope, run.id);
        return {
          organizacion: org.name,
          liquidacion: `${run.period} ${run.kind}`,
          contra: c.prev ? `${c.prev.period} ${c.prev.kind}` : null,
          a_revisar: c.employees.filter((e) => e.flag !== "ok").map((e) => ({ empleado: e.name, neto: e.net / 100, neto_anterior: e.prevNet === null ? null : e.prevNet / 100, variacion: e.delta === null ? "nuevo" : `${Math.round(e.delta * 1000) / 10} %` })),
          ya_no_estan: c.gone,
          conceptos_con_mas_diferencia: c.concepts.slice(0, 8).map((x) => ({ concepto: x.name, anterior: x.before / 100, actual: x.now / 100, diferencia: x.diff / 100 })),
          excel: descarga("xlsx"),
          pdf: descarga("pdf"),
        };
      }
      const rep = await payrollReport(scope, org.name, tipo, { runId: run.id });
      return { organizacion: org.name, reporte: rep.title, detalle: rep.subtitle, filas: rep.sections.map((x) => ({ seccion: x.title, columnas: x.header, filas: x.rows.slice(0, 20), totales: x.totals ?? null })), excel: descarga("xlsx"), pdf: descarga("pdf") };
    },
  }),
];
