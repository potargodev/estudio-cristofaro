import "server-only";
import { z } from "zod/v4";
import { approveConsult, consultOrganization, ConsultError, consultsAvailable, draftConsult, pendingConsults } from "@/modules/ai-consults/server";
import { defineTool, ToolError } from "../types";
import { uuid } from "./helpers";

// Consultas laborales y fiscales con IA para el Vigía: listar las que esperan
// revisión (lectura), preparar otro borrador (escritura) y enviar la respuesta
// al cliente, que es una comunicación sensible: siempre va a Aprobaciones.

const STAFF = ["dueno", "contador", "colaborador"] as const;
async function guard<T>(studioId: string, fn: () => Promise<T>) {
  if (!(await consultsAvailable(studioId))) throw new ToolError("Las consultas con IA vienen con el plan Profesional.", "error");
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ConsultError) throw new ToolError(e.message, "error");
    throw e;
  }
}

export const consultasIaTools = [
  defineTool<Record<string, never>, unknown>({
    name: "listar_consultas_ia",
    title: "Consultas con IA para revisar",
    description: "Consultas laborales y fiscales de los clientes con el borrador que preparó la IA y que todavía nadie del estudio aprobó.",
    module: "consultas_ia",
    level: "lectura",
    roles: STAFF,
    input: z.object({}),
    async handler(_input, ctx) {
      const rows = await guard(ctx.studioId, () => pendingConsults(ctx.studioId, ctx.allowedOrganizations ?? undefined));
      return {
        total: rows.length,
        consultas: rows.slice(0, 30).map(({ c, subject, org }) => ({ id: c.id, organizacion: org, asunto: subject, tema: c.topic, estado: c.status, borrador: c.draft?.slice(0, 600) ?? null })),
        enlace: "/admin/solicitudes?ia=1",
      };
    },
  }),
  defineTool<{ consulta_id: string }, unknown>({
    name: "preparar_respuesta_consulta",
    title: "Preparar otro borrador",
    description: "Pide a la IA un borrador nuevo para una consulta laboral o fiscal. No le llega nada al cliente.",
    module: "consultas_ia",
    level: "escritura",
    roles: STAFF,
    input: z.object({ consulta_id: uuid("ID de la consulta") }),
    async organizationOf(input, ctx) {
      const org = await consultOrganization(ctx.studioId, input.consulta_id);
      if (!org) throw new ToolError("No encontramos la consulta.", "no_encontrado");
      return org;
    },
    describe: () => "Preparar un borrador nuevo de la respuesta",
    async handler(input, ctx) {
      const c = await guard(ctx.studioId, () => draftConsult(ctx.studioId, input.consulta_id, { ...ctx.actor, studioId: ctx.studioId }));
      return { estado: c.status, borrador: c.draft, error: c.error, enlace: `/admin/solicitudes?id=${c.request_id}` };
    },
  }),
  defineTool<{ consulta_id: string; texto: string; resolver?: boolean }, unknown>({
    name: "enviar_respuesta_consulta",
    title: "Enviar la respuesta de una consulta",
    description: "Envía al cliente la respuesta de una consulta laboral o fiscal (el texto aprobado). Es una comunicación sensible: queda como propuesta hasta que una persona la aprueba.",
    module: "consultas_ia",
    level: "sensible",
    roles: ["dueno", "contador"],
    input: z.object({ consulta_id: uuid("ID de la consulta"), texto: z.string().min(5).max(5000), resolver: z.boolean().optional() }),
    async organizationOf(input, ctx) {
      const org = await consultOrganization(ctx.studioId, input.consulta_id);
      if (!org) throw new ToolError("No encontramos la consulta.", "no_encontrado");
      return org;
    },
    describe: (i) => `Enviar al cliente: «${i.texto.slice(0, 120)}${i.texto.length > 120 ? "…" : ""}»`,
    async handler(input, ctx) {
      const r = await guard(ctx.studioId, () => approveConsult({ ...ctx.actor, studioId: ctx.studioId }, input.consulta_id, input.texto, !!input.resolver));
      return { enviada: true, editada: r.edited, enlace: `/admin/solicitudes?id=${r.requestId}` };
    },
  }),
];
