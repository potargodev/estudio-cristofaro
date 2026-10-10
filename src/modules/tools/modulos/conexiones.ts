import "server-only";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { getDb } from "@/db";
import { external_records, organizations, tango_records } from "@/db/schema";
import { TANGO_PROCESS } from "@/lib/integrations/tango/constants";
import { defineTool } from "../types";
import { limite, orgFilter, uuid } from "./helpers";

const RECURSOS = ["clientes", "comprobantes_venta", "comprobantes_compra", "asientos", "archivos"] as const;
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** El registro original puede ser grande: se recorta para la IA */
function brief(raw: unknown) {
  const s = JSON.stringify(raw);
  return s.length > 1500 ? `${s.slice(0, 1500)}…` : raw;
}

export const conexionesTools = [
  defineTool({
    name: "listar_registros_externos",
    title: "Registros de conexiones",
    description:
      "Datos traídos de las conexiones del estudio (Xubio, Tango, archivos de Holistor/Bejerman, Google Drive): clientes, comprobantes de venta y compra, asientos y archivos. Cada registro trae fuente, fecha de sincronización, ID externo, estado de validación y el registro original.",
    module: "conexiones",
    level: "lectura",
    roles: ["dueno", "contador", "colaborador"],
    input: z.object({
      fuente: z.string().max(30).optional().describe("xubio, tango, holistor, bejerman, generico, google_drive"),
      recurso: z.enum(RECURSOS).optional(),
      organizacion_id: uuid("ID de la organización").optional(),
      cuit: z.string().max(20).optional(),
      desde: fecha.optional(),
      hasta: fecha.optional(),
      limite,
    }),
    organizationOf: async (input) => input.organizacion_id ?? null,
    async handler(input, ctx) {
      if (input.organizacion_id) await ctx.organization(input.organizacion_id);
      const db = getDb();
      const cuit = input.cuit?.replace(/\D/g, "") || undefined;
      const out: Record<string, unknown>[] = [];
      if (!input.fuente || input.fuente === "tango") {
        if (!input.recurso || input.recurso === "clientes") {
          const rows = await db
            .select({ r: tango_records, org: organizations.name })
            .from(tango_records)
            .leftJoin(organizations, eq(organizations.id, tango_records.organization_id))
            .where(
              and(
                eq(tango_records.studio_id, ctx.studioId),
                eq(tango_records.process, TANGO_PROCESS.clientes),
                orgFilter(ctx, tango_records.organization_id),
                // Con acceso limitado, solo lo ya vinculado a una organización permitida
                ctx.allowedOrganizations ? sql`${tango_records.organization_id} is not null` : undefined,
                input.organizacion_id ? eq(tango_records.organization_id, input.organizacion_id) : undefined,
              ),
            )
            .orderBy(desc(tango_records.synced_at))
            .limit(input.limite);
          for (const { r, org } of rows) {
            out.push({
              fuente: "tango",
              recurso: "clientes",
              id_externo: r.external_id,
              empresa_tango: r.company_id,
              organizacion: org,
              estado_validacion: r.organization_id ? "cruzado" : "sin_cruzar",
              sincronizado: r.synced_at,
              original: brief(r.raw),
            });
          }
        }
      }
      if (input.fuente !== "tango") {
        const rows = await db
          .select({ r: external_records, org: organizations.name })
          .from(external_records)
          .leftJoin(organizations, eq(organizations.id, external_records.organization_id))
          .where(
            and(
              eq(external_records.studio_id, ctx.studioId),
              orgFilter(ctx, external_records.organization_id),
              ctx.allowedOrganizations ? sql`${external_records.organization_id} is not null` : undefined,
              input.fuente ? eq(external_records.source, input.fuente) : undefined,
              input.recurso ? eq(external_records.resource, input.recurso) : undefined,
              input.organizacion_id ? eq(external_records.organization_id, input.organizacion_id) : undefined,
              cuit ? eq(external_records.cuit, cuit) : undefined,
              input.desde ? gte(external_records.record_date, input.desde) : undefined,
              input.hasta ? lte(external_records.record_date, input.hasta) : undefined,
            ),
          )
          .orderBy(desc(external_records.record_date), desc(external_records.synced_at))
          .limit(input.limite);
        for (const { r, org } of rows) {
          out.push({
            fuente: r.source,
            recurso: r.resource,
            id_externo: r.external_id,
            nombre: r.name,
            cuit: r.cuit,
            fecha: r.record_date,
            importe: r.amount,
            organizacion: org,
            estado_validacion: r.validation_status,
            sincronizado: r.synced_at,
            original: brief(r.raw),
          });
        }
      }
      return { total: out.length, registros: out.slice(0, input.limite) };
    },
  }),
  defineTool({
    name: "resumen_comprobantes",
    title: "Resumen de comprobantes",
    description:
      "Totales de comprobantes de venta y compra sincronizados (Xubio u otras fuentes) por organización en un rango de fechas: cantidad e importe total de cada tipo.",
    module: "conexiones",
    level: "lectura",
    roles: ["dueno", "contador", "colaborador"],
    input: z.object({
      organizacion_id: uuid("ID de la organización"),
      desde: fecha.optional(),
      hasta: fecha.optional(),
    }),
    organizationOf: async (input) => input.organizacion_id,
    async handler(input, ctx) {
      const org = await ctx.organization(input.organizacion_id);
      const rows = await getDb()
        .select({
          recurso: external_records.resource,
          fuente: external_records.source,
          cantidad: sql<number>`count(*)::int`,
          total: sql<string>`coalesce(sum(${external_records.amount}), 0)`,
        })
        .from(external_records)
        .where(
          and(
            eq(external_records.studio_id, ctx.studioId),
            eq(external_records.organization_id, org.id),
            sql`${external_records.resource} in ('comprobantes_venta', 'comprobantes_compra')`,
            input.desde ? gte(external_records.record_date, input.desde) : undefined,
            input.hasta ? lte(external_records.record_date, input.hasta) : undefined,
          ),
        )
        .groupBy(external_records.resource, external_records.source);
      return { organizacion: org.name, desde: input.desde ?? null, hasta: input.hasta ?? null, totales: rows.map((r) => ({ ...r, total: Number(r.total) })) };
    },
  }),
];
