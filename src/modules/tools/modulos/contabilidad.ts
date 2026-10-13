import "server-only";
import { z } from "zod/v4";
import { todayAR } from "@/lib/format";
import { defineTool, ToolError, type HandlerContext } from "../types";
import { uuid } from "./helpers";

// Contabilidad general (A1) para el Vigía, el Agente y MCP: estados
// contables, sumas y saldos y cuentas corrientes (lectura), y la generación
// de los asientos automáticos de un período (escritura: quedan en borrador,
// los registra una persona o el interruptor «contabilidad.asientos»).

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const input = z.object({ organizacion_id: uuid("ID de la organización"), desde: fecha.optional(), hasta: fecha.optional() });
type Input = z.infer<typeof input>;

async function scopeOf(i: Input, ctx: HandlerContext) {
  const o = await ctx.organization(i.organizacion_id);
  const { currentYear } = await import("@/modules/contabilidad/server");
  const s = { studioId: ctx.studioId, organizationId: o.id };
  const fy = await currentYear(s);
  return { s, name: o.name, from: i.desde ?? fy.start, to: i.hasta ?? todayAR() };
}
const $ = (c: number) => Math.round(c) / 100;

async function guard<T>(fn: () => Promise<T>) {
  const { AccountingError } = await import("@/modules/contabilidad/server");
  try {
    return await fn();
  } catch (e) {
    if (e instanceof AccountingError) throw new ToolError(e.message, "entrada_invalida");
    throw e;
  }
}

export const contabilidadTools = [
  defineTool<Input, unknown>({
    name: "estados_contables",
    title: "Estados contables de una organización",
    description: "Situación patrimonial (activo, pasivo y patrimonio neto) y estado de resultados de un período, armados con los asientos registrados (moneda nominal). Por defecto, el ejercicio en curso. Son datos para el contador: la firma y el dictamen son de un matriculado.",
    module: "contabilidad",
    level: "lectura",
    roles: ["dueno", "contador", "colaborador"],
    input,
    organizationOf: async (i) => i.organizacion_id,
    async handler(i, ctx) {
      const { s, name, from, to } = await scopeOf(i, ctx);
      const { statementsOf } = await import("@/modules/contabilidad/server");
      const st = await guard(() => statementsOf(s, from, to));
      return {
        organizacion: name,
        desde: from,
        hasta: to,
        activo: $(st.situacion.activo),
        pasivo: $(st.situacion.pasivo),
        patrimonio_neto: $(st.situacion.patrimonioNeto),
        resultado: $(st.resultados.resultado),
        cierra: st.cierra,
        ingresos: st.resultados.ingresos.map((x) => ({ cuenta: x.name, importe: $(x.amount) })),
        egresos: st.resultados.egresos.map((x) => ({ cuenta: x.name, importe: $(x.amount) })),
        enlace: `/admin/organizaciones/${s.organizationId}?tab=contabilidad&ver=estados&desde=${from}&hasta=${to}`,
      };
    },
  }),
  defineTool<Input, unknown>({
    name: "sumas_y_saldos",
    title: "Balance de sumas y saldos",
    description: "Balance de sumas y saldos de un período: debe, haber y saldo de cada cuenta del plan, y si balancea.",
    module: "contabilidad",
    level: "lectura",
    roles: ["dueno", "contador", "colaborador"],
    input,
    organizationOf: async (i) => i.organizacion_id,
    async handler(i, ctx) {
      const { s, name, from, to } = await scopeOf(i, ctx);
      const { trialOf } = await import("@/modules/contabilidad/server");
      const t = await guard(() => trialOf(s, from, to));
      return { organizacion: name, desde: from, hasta: to, balancea: t.balanced, cuentas: t.rows.map((r) => ({ codigo: r.code, cuenta: r.name, debe: $(r.debit), haber: $(r.credit), saldo: $(r.balance) })) };
    },
  }),
  defineTool<Input & { tipo?: "clientes" | "proveedores" }, unknown>({
    name: "cuentas_corrientes",
    title: "Cuentas corrientes y antigüedad de saldos",
    description: "Saldos pendientes de clientes (facturas sin cobrar) o de proveedores (compras sin pago conciliado), por antigüedad desde el vencimiento.",
    module: "contabilidad",
    level: "lectura",
    roles: ["dueno", "contador", "colaborador"],
    input: input.extend({ tipo: z.enum(["clientes", "proveedores"]).optional() }),
    organizationOf: async (i) => i.organizacion_id,
    async handler(i, ctx) {
      const { s, name, to } = await scopeOf(i, ctx);
      const { receivables, payables } = await import("@/modules/contabilidad/server");
      const a = i.tipo === "proveedores" ? await payables(s, to) : await receivables(s, to);
      return { organizacion: name, al: to, tipo: i.tipo ?? "clientes", total: $(a.total), por_antiguedad: a.totals.map($), detalle: a.rows.slice(0, 30).map((r) => ({ quien: r.party, total: $(r.total), mas_de_90_dias: $(r.buckets[4]) })) };
    },
  }),
  defineTool<Input, unknown>({
    name: "generar_asientos",
    title: "Generar los asientos automáticos",
    description: "Arma los asientos de un período desde las facturas emitidas, las compras confirmadas, los sueldos, los cobros, los pagos y los impuestos y comisiones del banco. No duplica: un asiento por origen. Quedan en borrador para que el contador los revise y registre.",
    module: "contabilidad",
    level: "escritura",
    roles: ["dueno", "contador"],
    input,
    organizationOf: async (i) => i.organizacion_id,
    async handler(i, ctx) {
      const { s, name, from, to } = await scopeOf(i, ctx);
      const { generateEntries } = await import("@/modules/contabilidad/server");
      const r = await guard(() => generateEntries(s, ctx.actor, from, to));
      return { organizacion: name, desde: from, hasta: to, ...r, enlace: `/admin/organizaciones/${s.organizationId}?tab=contabilidad&ver=asientos&desde=${from}&hasta=${to}` };
    },
  }),
];
