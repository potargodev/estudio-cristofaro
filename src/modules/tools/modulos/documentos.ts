import "server-only";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod/v4";
import { getDb } from "@/db";
import { documents, organizations } from "@/db/schema";
import { audit } from "@/lib/audit";
import { extractText } from "@/lib/text/extract";
import { readStored } from "@/lib/uploads";
import { defineTool, ToolError } from "../types";
import { limite, orgFilter, uuid } from "./helpers";

export const documentosTools = [
  defineTool({
    name: "listar_documentos",
    title: "Listar documentos",
    description:
      "Documentos del portal (constancias, comprobantes, DDJJ, recibos…) de una organización o de todas, del más nuevo al más viejo. Con sin_revisar=true muestra solo los que subió el cliente y nadie del estudio vio.",
    module: "documentos",
    level: "lectura",
    roles: ["dueno", "contador", "colaborador"],
    input: z.object({
      organizacion_id: uuid("ID de la organización").optional(),
      categoria: z.string().max(40).optional().describe("comprobantes, constancias, ddjj, recibos, vep, balances, solicitud, otro"),
      sin_revisar: z.boolean().optional(),
      limite,
    }),
    async organizationOf(input) {
      return input.organizacion_id ?? null;
    },
    async handler(input, ctx) {
      if (input.organizacion_id) await ctx.organization(input.organizacion_id);
      const rows = await getDb()
        .select({
          id: documents.id,
          nombre: documents.name,
          organizacion: organizations.name,
          organizacion_id: organizations.id,
          categoria: documents.category,
          periodo: documents.period,
          origen: documents.source,
          tipo: documents.mime_type,
          subido: documents.created_at,
          revisado: documents.reviewed_at,
        })
        .from(documents)
        .innerJoin(organizations, eq(organizations.id, documents.organization_id))
        .where(
          and(
            eq(documents.studio_id, ctx.studioId),
            eq(organizations.studio_id, ctx.studioId),
            orgFilter(ctx, documents.organization_id),
            input.organizacion_id ? eq(documents.organization_id, input.organizacion_id) : undefined,
            input.categoria ? eq(documents.category, input.categoria) : undefined,
            input.sin_revisar ? and(eq(documents.source, "cliente"), isNull(documents.reviewed_at)) : undefined,
          ),
        )
        .orderBy(desc(documents.created_at))
        .limit(input.limite);
      return { total: rows.length, documentos: rows };
    },
  }),
  defineTool({
    name: "leer_documento",
    title: "Leer documento",
    description:
      "Devuelve el contenido de texto de un documento (PDF con texto, XLSX, CSV o texto). Las imágenes y los escaneos todavía no se leen. La lectura queda en la auditoría.",
    module: "documentos",
    level: "lectura",
    roles: ["dueno", "contador", "colaborador"],
    input: z.object({ documento_id: uuid("ID del documento") }),
    async organizationOf(input) {
      const [d] = await getDb().select({ org: documents.organization_id }).from(documents).where(eq(documents.id, input.documento_id));
      return d?.org ?? null;
    },
    async handler(input, ctx) {
      const [doc] = await getDb()
        .select()
        .from(documents)
        .where(and(eq(documents.id, input.documento_id), eq(documents.studio_id, ctx.studioId)));
      if (!doc) throw new ToolError("No existe ese documento.", "no_encontrado");
      const org = await ctx.organization(doc.organization_id);
      let buf: Buffer;
      try {
        buf = (await readStored(doc.storage_path)).data;
      } catch {
        throw new ToolError("El archivo no está disponible en el servidor.", "no_encontrado");
      }
      const text = await extractText(buf, doc.name, doc.mime_type);
      await audit({
        studioId: ctx.studioId,
        organizationId: org.id,
        actor: ctx.actor,
        action: "documento.leer_ia",
        entityType: "documento",
        entityId: doc.id,
        metadata: { origen: ctx.origin, nombre: doc.name },
      });
      return {
        id: doc.id,
        nombre: doc.name,
        organizacion: org.name,
        categoria: doc.category,
        periodo: doc.period,
        ...(text.ok ? { texto: text.text, recortado: text.truncated } : { texto: null, motivo: text.reason }),
      };
    },
  }),
];
