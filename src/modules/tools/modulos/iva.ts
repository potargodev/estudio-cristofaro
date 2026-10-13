import "server-only";
import { z } from "zod/v4";
import { todayAR } from "@/lib/format";
import { defineTool, ToolError } from "../types";
import { uuid } from "./helpers";

// Análisis del Libro IVA (§2.q, etapa 4) para el Vigía, el Agente y MCP:
// resumen de compras y ventas del período, anomalías y lo que falta antes de
// presentar. Son datos para el contador, no una validación.

export const ivaTools = [
  defineTool<{ organizacion_id: string; periodo?: string }, unknown>({
    name: "analizar_libro_iva",
    title: "Análisis del Libro IVA",
    description: "Libro IVA compras y ventas de una organización en un período (AAAA-MM; por defecto el mes anterior): crédito y débito fiscal, saldo técnico, anomalías explicadas (concentración, monotributistas, CUIT y CAE con problemas, duplicados, fuera de período, importes atípicos, alícuotas, IVA en facturas B o C, saltos de numeración) y el checklist de lo que falta antes de presentar.",
    module: "facturacion",
    level: "lectura",
    roles: ["dueno", "contador", "colaborador"],
    input: z.object({ organizacion_id: uuid("ID de la organización"), periodo: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional().describe("AAAA-MM") }),
    async organizationOf(input) {
      return input.organizacion_id;
    },
    async handler(input, ctx) {
      const org = await ctx.organization(input.organizacion_id);
      const { brief, IvaError } = await import("@/modules/iva/server");
      const [y, m] = todayAR().split("-").map(Number);
      const period = input.periodo ?? (m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`);
      try {
        return { organizacion: org.name, ...(await brief({ studioId: ctx.studioId, organizationId: org.id }, period)) };
      } catch (e) {
        if (e instanceof IvaError) throw new ToolError(e.message, "entrada_invalida");
        throw e;
      }
    },
  }),
  defineTool<{ organizacion_id: string; periodo?: string; cuit?: string }, unknown>({
    name: "posicion_iva",
    title: "Posición de IVA y Libro IVA Digital",
    description: "Posición de IVA (débito − crédito fiscal) de una organización en el período y los 3 anteriores, opcionalmente de una sola CUIT, con el semáforo contra lo habitual, y los enlaces para bajar el Libro IVA en Excel, PDF o los archivos del Libro IVA Digital (a validar con el aplicativo antes de presentar).",
    module: "facturacion",
    level: "lectura",
    roles: ["dueno", "contador", "colaborador"],
    input: z.object({ organizacion_id: uuid("ID de la organización"), periodo: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional().describe("AAAA-MM"), cuit: z.string().regex(/^\d{11}$/).optional().describe("CUIT propia, 11 dígitos") }),
    async organizationOf(input) {
      return input.organizacion_id;
    },
    async handler(input, ctx) {
      const org = await ctx.organization(input.organizacion_id);
      const { ivaPosition, IvaError } = await import("@/modules/iva/server");
      const [y, m] = todayAR().split("-").map(Number);
      const period = input.periodo ?? (m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`);
      try {
        const pos = await ivaPosition({ studioId: ctx.studioId, organizationId: org.id }, period, input.cuit ?? null);
        const q = (libro: string, formato: string) => `/api/iva/${org.id}?${new URLSearchParams({ periodo: period, libro, formato, ...(input.cuit ? { cuit: input.cuit } : {}) })}`;
        return {
          organizacion: org.name,
          periodo: period,
          semaforo: pos.light,
          meses: pos.items.map((x) => ({ periodo: x.period, debito: x.debit / 100, credito: x.credit / 100, saldo: x.balance / 100 })),
          descargas: { ventas_excel: q("ventas", "xlsx"), compras_excel: q("compras", "xlsx"), ventas_digital: q("ventas", "digital"), compras_digital: q("compras", "digital") },
          aviso: "El semáforo compara con el promedio de los 3 meses anteriores. Los archivos del Libro IVA Digital quedan a validar con el aplicativo de ARCA: Faro no presenta ni pide la clave fiscal.",
        };
      } catch (e) {
        if (e instanceof IvaError) throw new ToolError(e.message, "entrada_invalida");
        throw e;
      }
    },
  }),
];
