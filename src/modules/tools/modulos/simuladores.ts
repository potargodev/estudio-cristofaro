import "server-only";
import { z } from "zod/v4";
import { defineTool } from "../types";

// Parte C · Modos de servicio y simuladores para el Vigía, el Agente y MCP:
// en qué modo está cada servicio del espacio (Real, Prueba o Simulador) y lo
// último que pasó en los simuladores. Solo lectura.

export const simuladoresTools = [
  defineTool<Record<string, never>, unknown>({
    name: "modo_de_servicios",
    title: "Modo de los servicios (Real, Prueba o Simulador)",
    description: "En qué modo funciona cada servicio externo del espacio (ARCA, Mercado Pago, WhatsApp, mails, tiendas, Tango, Xubio, Contabilium y bancos): Real, Prueba (ambiente de prueba oficial, sin validez fiscal) o Simulador (dentro de Faro). Incluye lo último que pasó en los simuladores. Sirve para saber si una factura tiene validez fiscal o fue de prueba.",
    module: "conexiones",
    level: "lectura",
    roles: ["dueno", "contador", "colaborador", "titular"],
    input: z.object({}),
    async handler(_input, ctx) {
      const { SERVICES, MODES } = await import("@/modules/simuladores/core");
      const { spaceModes } = await import("@/modules/simuladores/panel");
      const { simEvents } = await import("@/modules/simuladores/server");
      const modes = await spaceModes(ctx.studioId);
      const events = await simEvents(null, ctx.studioId, 15);
      return {
        servicios: (Object.keys(modes) as (keyof typeof modes)[]).map((k) => ({ servicio: SERVICES[k].label, modo: MODES[modes[k]] })),
        ultimos_eventos_de_simuladores: events.map((e) => ({ servicio: e.service, que: e.summary, cuando: e.created_at })),
        enlace: "/simuladores",
        aviso: "Lo emitido en Prueba o en el Simulador no tiene validez fiscal. Faro nunca pide ni guarda la clave fiscal.",
      };
    },
  }),
];
