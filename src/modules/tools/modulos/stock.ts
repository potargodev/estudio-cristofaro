import "server-only";
import { z } from "zod/v4";
import { todayAR } from "@/lib/format";
import { ownOrganization } from "@/lib/faro/tenants";
import { defineTool, ToolError, type HandlerContext } from "../types";
import { uuid } from "./helpers";

// Stock (§2.q etapa 7) para el Vigía, el Agente y MCP: cuánto queda de un
// producto, lo que está debajo del mínimo, los más vendidos y el inventario
// valorizado a una fecha. Todo lectura.

const org = z.object({ organizacion_id: uuid("Organización (en una cuenta personal no hace falta)").optional() });

async function scopeOf(input: { organizacion_id?: string }, ctx: HandlerContext) {
  const o = input.organizacion_id ? await ctx.organization(input.organizacion_id) : await ownOrganization(ctx.studioId);
  if (!o) throw new ToolError("Indicá la organización.", "entrada_invalida");
  const { stockEnabled } = await import("@/modules/stock/server");
  if (!(await stockEnabled(ctx.studioId, o.id))) throw new ToolError("El módulo Stock no está activo para esa organización.", "entrada_invalida");
  return { studioId: ctx.studioId, organizationId: o.id, canManage: false, name: o.name };
}

const of = (input: { organizacion_id?: string }) => input.organizacion_id ?? null;

export const stockTools = [
  defineTool<{ organizacion_id?: string; producto: string }, unknown>({
    name: "consultar_stock",
    title: "Existencia de un producto",
    description: "¿Cuánto queda de un producto? Busca por nombre, código o código de barras y devuelve la existencia, el mínimo y si está debajo.",
    module: "stock",
    level: "lectura",
    roles: ["dueno", "contador", "colaborador", "titular"],
    input: org.extend({ producto: z.string().min(1).max(120) }),
    organizationOf: async (i) => of(i),
    async handler(input, ctx) {
      const s = await scopeOf(input, ctx);
      const { findStock } = await import("@/modules/stock/server");
      return { organizacion: s.name, productos: await findStock(s, input.producto) };
    },
  }),
  defineTool<{ organizacion_id?: string }, unknown>({
    name: "stock_bajo_minimo",
    title: "Productos debajo del mínimo",
    description: "Productos cuya existencia está debajo del stock mínimo cargado.",
    module: "stock",
    level: "lectura",
    roles: ["dueno", "contador", "colaborador", "titular"],
    input: org,
    organizationOf: async (i) => of(i),
    async handler(input, ctx) {
      const s = await scopeOf(input, ctx);
      const { belowMinimum } = await import("@/modules/stock/server");
      const rows = await belowMinimum(s);
      return { organizacion: s.name, total: rows.length, productos: rows.map((x) => ({ codigo: x.p.code, descripcion: x.p.description, existencia: x.qty, minimo: Number(x.p.min_stock) })) };
    },
  }),
  defineTool<{ organizacion_id?: string; desde?: string; hasta?: string }, unknown>({
    name: "mas_vendidos",
    title: "Productos más vendidos",
    description: "Los productos más vendidos de un período (facturado en Faro y ventas de tiendas, menos devoluciones). Por defecto, los últimos 30 días.",
    module: "stock",
    level: "lectura",
    roles: ["dueno", "contador", "colaborador", "titular"],
    input: org.extend({ desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }),
    organizationOf: async (i) => of(i),
    async handler(input, ctx) {
      const s = await scopeOf(input, ctx);
      const { topSellers } = await import("@/modules/stock/server");
      const to = input.hasta ?? todayAR();
      const from = input.desde ?? new Date(Date.parse(to) - 30 * 86400000).toISOString().slice(0, 10);
      return { organizacion: s.name, desde: from, hasta: to, productos: (await topSellers(s, from, to)).map((x) => ({ codigo: x.code, descripcion: x.description, unidades: x.units })) };
    },
  }),
  defineTool<{ organizacion_id?: string; fecha?: string; metodo?: "ultimo" | "promedio" }, unknown>({
    name: "inventario_valorizado",
    title: "Inventario valorizado a una fecha",
    description: "Existencia y valor de cada producto a una fecha (también pasada, por ejemplo al 31/12), por último costo o promedio ponderado, con el CMV estimado del año hasta esa fecha.",
    module: "stock",
    level: "lectura",
    roles: ["dueno", "contador", "colaborador", "titular"],
    input: org.extend({ fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), metodo: z.enum(["ultimo", "promedio"]).optional() }),
    organizationOf: async (i) => of(i),
    async handler(input, ctx) {
      const s = await scopeOf(input, ctx);
      const { inventory, cmvOf } = await import("@/modules/stock/server");
      const date = input.fecha ?? todayAR();
      const inv = await inventory(s, date, input.metodo ?? "promedio");
      const c = await cmvOf(s, `${date.slice(0, 4)}-01-01`, date);
      return { organizacion: s.name, fecha: date, metodo: inv.method === "ultimo" ? "último costo" : "promedio ponderado", total: inv.total, productos: inv.rows.filter((r) => r.qty !== 0).slice(0, 100).map((r) => ({ codigo: r.code, descripcion: r.description, existencia: r.qty, costo_unitario: r.unitCost, valor: r.value })), cmv_estimado_del_anio: c.total, aviso: "Valuación de gestión según los movimientos cargados; no reemplaza el criterio de un contador." };
    },
  }),
];
