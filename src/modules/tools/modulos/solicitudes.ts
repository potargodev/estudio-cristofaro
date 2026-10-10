import "server-only";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod/v4";
import { getDb } from "@/db";
import { request_messages, requests, organizations, users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { notifyOrganization } from "@/lib/notify";
import { defineTool, ToolError } from "../types";
import { limite, orgFilter, uuid } from "./helpers";

const TIPOS = ["consulta", "factura", "empleado", "otro"] as const;
const ESTADOS = ["abierta", "en_curso", "resuelta"] as const;

async function requestOrg(id: string) {
  const [r] = await getDb().select({ org: requests.organization_id }).from(requests).where(eq(requests.id, id));
  return r?.org ?? null;
}

const responderInput = z.object({
  solicitud_id: uuid("ID de la solicitud"),
  mensaje: z.string().min(2).max(5000).describe("Respuesta para el cliente (la ve en el portal y le llega el aviso por mail)"),
  estado: z.enum(ESTADOS).optional().describe("Nuevo estado; por defecto pasa a en_curso"),
});

const crearInput = z.object({
  organizacion_id: uuid("ID de la organización"),
  tipo: z.enum(TIPOS).default("consulta"),
  asunto: z.string().min(3).max(200),
  detalle: z.string().min(2).max(5000).describe("Primer mensaje (nota interna del estudio sobre el pedido)"),
});

export const solicitudesTools = [
  defineTool({
    name: "listar_solicitudes",
    title: "Listar solicitudes",
    description: "Solicitudes de los clientes (consultas, pedidos de factura, altas o bajas de empleados). Por defecto solo las abiertas y en curso.",
    module: "solicitudes",
    level: "lectura",
    roles: ["admin", "contador", "colaborador"],
    input: z.object({
      organizacion_id: uuid("ID de la organización").optional(),
      estados: z.array(z.enum(ESTADOS)).optional().describe("Por defecto: abierta y en_curso"),
      limite,
    }),
    async organizationOf(input) {
      return input.organizacion_id ?? null;
    },
    async handler(input, ctx) {
      if (input.organizacion_id) await ctx.organization(input.organizacion_id);
      const rows = await getDb()
        .select({
          id: requests.id,
          asunto: requests.subject,
          tipo: requests.type,
          estado: requests.status,
          organizacion: organizations.name,
          organizacion_id: organizations.id,
          creada: requests.created_at,
          actualizada: requests.updated_at,
        })
        .from(requests)
        .innerJoin(organizations, eq(organizations.id, requests.organization_id))
        .where(
          and(
            eq(requests.studio_id, ctx.studioId),
            eq(organizations.studio_id, ctx.studioId),
            orgFilter(ctx, requests.organization_id),
            input.organizacion_id ? eq(requests.organization_id, input.organizacion_id) : undefined,
            inArray(requests.status, input.estados?.length ? input.estados : ["abierta", "en_curso"]),
          ),
        )
        .orderBy(desc(requests.updated_at))
        .limit(input.limite);
      return { total: rows.length, solicitudes: rows };
    },
  }),
  defineTool({
    name: "ver_solicitud",
    title: "Ver solicitud",
    description: "Una solicitud con toda su conversación (mensajes del cliente y del estudio).",
    module: "solicitudes",
    level: "lectura",
    roles: ["admin", "contador", "colaborador"],
    input: z.object({ solicitud_id: uuid("ID de la solicitud") }),
    organizationOf: async (input) => requestOrg(input.solicitud_id),
    async handler(input, ctx) {
      const db = getDb();
      const [req] = await db
        .select()
        .from(requests)
        .where(and(eq(requests.id, input.solicitud_id), eq(requests.studio_id, ctx.studioId)));
      if (!req) throw new ToolError("No existe esa solicitud.", "no_encontrado");
      const org = await ctx.organization(req.organization_id);
      const msgs = await db
        .select({ de_cliente: request_messages.from_client, autor: users.name, mensaje: request_messages.body, fecha: request_messages.created_at })
        .from(request_messages)
        .leftJoin(users, eq(users.id, request_messages.author_id))
        .where(eq(request_messages.request_id, req.id))
        .orderBy(asc(request_messages.created_at));
      return { id: req.id, organizacion: org.name, asunto: req.subject, tipo: req.type, estado: req.status, mensajes: msgs };
    },
  }),
  defineTool<z.infer<typeof crearInput>, unknown>({
    name: "crear_solicitud",
    title: "Crear solicitud",
    description: "Abre una solicitud nueva en una organización (por ejemplo, para registrar un pedido que llegó por WhatsApp o por mail). No le avisa al cliente.",
    module: "solicitudes",
    level: "escritura",
    roles: ["admin", "contador", "colaborador"],
    input: crearInput,
    organizationOf: async (input) => input.organizacion_id,
    describe: (i) => `Abrir la solicitud "${i.asunto}" (${i.tipo})`,
    async handler(input, ctx) {
      const org = await ctx.organization(input.organizacion_id);
      const db = getDb();
      const [req] = await db
        .insert(requests)
        .values({ studio_id: ctx.studioId, organization_id: org.id, type: input.tipo, subject: input.asunto, created_by: ctx.actor.id })
        .returning({ id: requests.id });
      await db.insert(request_messages).values({ request_id: req.id, author_id: ctx.actor.id, from_client: false, body: input.detalle });
      await audit({
        studioId: ctx.studioId,
        organizationId: org.id,
        actor: ctx.actor,
        action: "solicitud.crear",
        entityType: "solicitud",
        entityId: req.id,
        metadata: { origen: ctx.origin, asunto: input.asunto },
      });
      return { id: req.id, organizacion: org.name, creada: true };
    },
  }),
  defineTool<z.infer<typeof responderInput>, unknown>({
    name: "responder_solicitud",
    title: "Responder solicitud",
    description:
      "Responde una solicitud de un cliente. Es una comunicación al cliente: no se envía sola, queda como borrador en la bandeja de aprobaciones hasta que alguien del estudio la apruebe.",
    module: "solicitudes",
    level: "sensible",
    roles: ["admin", "contador", "colaborador"],
    input: responderInput,
    organizationOf: async (input) => requestOrg(input.solicitud_id),
    describe: (i) => `Responderle al cliente: "${i.mensaje.length > 140 ? `${i.mensaje.slice(0, 140)}…` : i.mensaje}"`,
    async handler(input, ctx) {
      const db = getDb();
      const [req] = await db
        .select()
        .from(requests)
        .where(and(eq(requests.id, input.solicitud_id), eq(requests.studio_id, ctx.studioId)));
      if (!req) throw new ToolError("No existe esa solicitud.", "no_encontrado");
      const org = await ctx.organization(req.organization_id);
      await db.insert(request_messages).values({ request_id: req.id, author_id: ctx.actor.id, from_client: false, body: input.mensaje });
      const status = input.estado ?? (req.status === "abierta" ? "en_curso" : req.status);
      await db.update(requests).set({ status }).where(eq(requests.id, req.id));
      await notifyOrganization(ctx.studioId, org.id, { kind: "respuesta", subject: req.subject });
      await audit({
        studioId: ctx.studioId,
        organizationId: org.id,
        actor: ctx.actor,
        action: "solicitud.responder",
        entityType: "solicitud",
        entityId: req.id,
        metadata: { origen: ctx.origin, estado: status },
      });
      return { id: req.id, organizacion: org.name, respondida: true, estado: status };
    },
  }),
];
