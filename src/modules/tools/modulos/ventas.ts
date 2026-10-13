import "server-only";
import { z } from "zod/v4";
import { defineTool } from "../types";
import { uuid } from "./helpers";

// Ventas de tiendas para facturar (§2.p, B7) para el Vigía, el Agente y MCP:
// qué quedó para facturar, en borrador, con error o devuelto, por tienda.

export const ventasTools = [
  defineTool<{ organizacion_id?: string }, unknown>({
    name: "ventas_para_facturar",
    title: "Ventas de tiendas para facturar",
    description: "Ventas de las tiendas (Mercado Libre, Tiendanube, Empretienda, Shopify, WooCommerce, VTEX, Mercado Pago y la tienda física) según su estado de facturación: para facturar, en borrador, con error, facturadas y devueltas con su nota de crédito, por tienda y con la regla de cada una.",
    module: "facturacion",
    level: "lectura",
    roles: ["dueno", "contador", "colaborador", "titular"],
    input: z.object({ organizacion_id: uuid("Organización (opcional; en una cuenta personal no hace falta)").optional() }),
    async organizationOf(input) {
      return input.organizacion_id ?? null;
    },
    async handler(input, ctx) {
      const org = input.organizacion_id ? await ctx.organization(input.organizacion_id) : null;
      const { salesStores, salesSummary } = await import("@/modules/ventas/server");
      const personal = ctx.actor.role === "titular";
      const scope = { studioId: ctx.studioId, organizationId: org?.id ?? null, canEmit: false };
      const stores = (await salesStores(scope)).filter((s) => personal || !ctx.allowedOrganizations || ctx.allowedOrganizations.includes(s.organizationId));
      return {
        tiendas: stores.map((s) => ({ tienda: s.name, plataforma: s.platform, organizacion: s.organization, regla: s.mode, cuit: s.cuit, pedidos: s.counts })),
        ultimos_30_dias: org || personal ? await salesSummary(scope) : undefined,
        enlace: personal ? "/facturacion/ventas" : "/admin/facturacion/ventas",
        aviso: "Las ventas se emiten solas solo con el interruptor «Facturar automáticamente las ventas de las tiendas»; si no, quedan en borrador para que una persona las emita.",
      };
    },
  }),
];
