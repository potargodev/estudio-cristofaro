import "server-only";
import { z } from "zod/v4";
import { defineTool } from "../types";

// Buzón de comprobantes recibidos (§2.p, B8) para el Vigía, el Agente y MCP:
// qué quedó para revisar por organización y qué tiene algo para mirar.

export const buzonTools = [
  defineTool<Record<string, never>, unknown>({
    name: "buzon_comprobantes",
    title: "Buzón de comprobantes recibidos",
    description: "Comprobantes recibidos para revisar (subidos, del portal, WhatsApp, mail, ARCA o rendiciones), por organización, con los que tienen algo para mirar: repetidos, a nombre de otra CUIT, CAE que ARCA no encontró o CUIT del emisor con problemas.",
    module: "documentos",
    level: "lectura",
    roles: ["dueno", "contador", "colaborador"],
    input: z.object({}),
    async handler(_i, ctx) {
      const { inboxSummary } = await import("@/modules/buzon/server");
      return { ...(await inboxSummary(ctx.studioId, ctx.allowedOrganizations)), enlace: "/admin/buzon", aviso: "Aprobar pasa al Libro IVA y a la contabilidad: lo decide una persona desde el Buzón." };
    },
  }),
];
