import "server-only";
import { z } from "zod/v4";
import { accountFor, recentMessages, sendToOrganization, WhatsAppError } from "@/modules/whatsapp/server";
import { defineTool, ToolError } from "../types";
import { uuid } from "./helpers";

// WhatsApp para el Vigía: ver los últimos mensajes (lectura) y mandar un
// aviso con una plantilla aprobada, que es una comunicación con el cliente:
// siempre va a Aprobaciones.

export const whatsappTools = [
  defineTool<Record<string, never>, unknown>({
    name: "listar_mensajes_whatsapp",
    title: "Mensajes de WhatsApp",
    description: "Últimos mensajes de WhatsApp del estudio (enviados y recibidos), con su estado y a qué quedaron vinculados.",
    module: "whatsapp",
    level: "lectura",
    roles: ["dueno", "contador", "colaborador"],
    input: z.object({}),
    async handler(_i, ctx) {
      if (!(await accountFor(ctx.studioId))) throw new ToolError("El estudio no tiene WhatsApp activo (Configuración → Avanzado).", "error");
      const rows = (await recentMessages(ctx.studioId, 30)).filter(({ m }) => !ctx.allowedOrganizations || (m.organization_id && ctx.allowedOrganizations.includes(m.organization_id)));
      return { mensajes: rows.map(({ m, org }) => ({ fecha: m.created_at.toISOString(), sentido: m.direction, organizacion: org, tipo: m.template ?? m.kind, texto: m.body?.slice(0, 200) ?? null, estado: m.status, vinculado: m.entity_type })), enlace: "/admin/configuracion/avanzado?tab=whatsapp" };
    },
  }),
  defineTool<{ organizacion_id: string; mensaje: string }, unknown>({
    name: "enviar_whatsapp",
    title: "Enviar un aviso por WhatsApp",
    description: "Manda un aviso por WhatsApp (plantilla aprobada «faro_aviso_general») a las personas de una organización que verificaron su número y aceptaron avisos. Comunicación con el cliente: queda como propuesta hasta que alguien la aprueba.",
    module: "whatsapp",
    level: "sensible",
    roles: ["dueno", "contador"],
    input: z.object({ organizacion_id: uuid("ID de la organización"), mensaje: z.string().min(5).max(300) }),
    async organizationOf(i) {
      return i.organizacion_id;
    },
    describe: (i) => `Mandar por WhatsApp: «${i.mensaje.slice(0, 120)}»`,
    async handler(i, ctx) {
      const org = await ctx.organization(i.organizacion_id);
      try {
        const r = await sendToOrganization(ctx.studioId, org.id, i.mensaje);
        return { organizacion: org.name, ...r };
      } catch (e) {
        if (e instanceof WhatsAppError) throw new ToolError(e.message, "error");
        throw e;
      }
    },
  }),
];
