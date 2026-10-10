import "server-only";
import { and, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { z } from "zod/v4";
import { getDb } from "@/db";
import { leads, users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { likeTerm } from "@/lib/search";
import { defineTool, ToolError, type HandlerContext } from "../types";
import { limite, uuid } from "./helpers";

const ETAPAS = ["nuevo", "contactado", "presupuesto", "ganado", "perdido"] as const;

/** Las consultas comerciales son del estudio, no de una organización: un acceso limitado a organizaciones no las ve */
function requireStudioWide(ctx: HandlerContext) {
  if (ctx.allowedOrganizations) throw new ToolError("Este acceso está limitado a algunas organizaciones y no ve las consultas comerciales.", "sin_permiso");
}

const moverInput = z.object({
  consulta_id: uuid("ID de la consulta"),
  etapa: z.enum(ETAPAS),
  proxima_accion: z.string().max(200).optional(),
  motivo_perdida: z.string().max(300).optional(),
});

export const consultasTools = [
  defineTool({
    name: "listar_consultas",
    title: "Listar consultas comerciales",
    description: "Consultas comerciales (potenciales clientes que llegaron por la web, el diagnóstico o la agenda), filtrables por etapa o texto.",
    module: "consultas",
    level: "lectura",
    roles: ["dueno", "contador"],
    input: z.object({
      etapas: z.array(z.enum(ETAPAS)).optional().describe("Por defecto: nuevo, contactado y presupuesto"),
      texto: z.string().max(120).optional().describe("Nombre, empresa o email"),
      limite,
    }),
    async handler(input, ctx) {
      requireStudioWide(ctx);
      const q = input.texto?.trim();
      const rows = await getDb()
        .select({
          id: leads.id,
          nombre: leads.name,
          empresa: leads.company,
          email: leads.email,
          telefono: leads.phone,
          etapa: leads.status,
          origen: leads.source,
          necesidades: leads.needs,
          mensaje: leads.message,
          proxima_accion: leads.next_action,
          responsable: users.name,
          creada: leads.created_at,
        })
        .from(leads)
        .leftJoin(users, eq(users.id, leads.assigned_to))
        .where(
          and(
            eq(leads.studio_id, ctx.studioId),
            inArray(leads.status, input.etapas?.length ? input.etapas : ["nuevo", "contactado", "presupuesto"]),
            q ? or(ilike(leads.name, likeTerm(q)), ilike(leads.company, likeTerm(q)), ilike(leads.email, likeTerm(q))) : undefined,
          ),
        )
        .orderBy(desc(leads.created_at))
        .limit(input.limite);
      return { total: rows.length, consultas: rows };
    },
  }),
  defineTool<z.infer<typeof moverInput>, unknown>({
    name: "mover_consulta",
    title: "Mover consulta de etapa",
    description: "Cambia la etapa de una consulta comercial (contactado, presupuesto, ganado, perdido) y opcionalmente la próxima acción.",
    module: "consultas",
    level: "escritura",
    roles: ["dueno", "contador"],
    input: moverInput,
    describe: (i) => `Pasar la consulta a "${i.etapa}"${i.proxima_accion ? ` · próxima acción: ${i.proxima_accion}` : ""}`,
    async handler(input, ctx) {
      requireStudioWide(ctx);
      const [row] = await getDb()
        .update(leads)
        .set({
          status: input.etapa,
          ...(input.proxima_accion ? { next_action: input.proxima_accion } : {}),
          ...(input.etapa === "perdido" && input.motivo_perdida ? { lost_reason: input.motivo_perdida } : {}),
        })
        .where(and(eq(leads.id, input.consulta_id), eq(leads.studio_id, ctx.studioId)))
        .returning({ id: leads.id, nombre: leads.name });
      if (!row) throw new ToolError("No existe esa consulta.", "no_encontrado");
      await audit({
        studioId: ctx.studioId,
        actor: ctx.actor,
        action: "consultas.estado",
        entityType: "consulta",
        entityId: row.id,
        metadata: { origen: ctx.origin, etapa: input.etapa },
      });
      return { id: row.id, nombre: row.nombre, etapa: input.etapa };
    },
  }),
];
