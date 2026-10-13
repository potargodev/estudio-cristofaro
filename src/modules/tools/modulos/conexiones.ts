import "server-only";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { getDb } from "@/db";
import { external_records, organizations, tango_records } from "@/db/schema";
import { TANGO_PROCESS } from "@/lib/integrations/tango/constants";
import { defineTool, ToolError } from "../types";
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
  defineTool({
    name: "estado_sincronizacion_tango",
    title: "Tango en los dos sentidos",
    description:
      "Estado de la sincronización con Tango: comprobantes pendientes, con error o en conflicto (diferencias entre Faro y Tango que tiene que decidir una persona) y nombres sugeridos para unificar. Solo lectura: los conflictos y las reglas se aprueban en Configuración → Conexiones → Tango → Tango en los dos sentidos.",
    module: "conexiones",
    level: "lectura",
    roles: ["dueno", "contador", "colaborador"],
    input: z.object({}),
    async handler(_input, ctx) {
      const { getLink, listRules, openConflicts, syncCounts } = await import("@/modules/tango-sync/server");
      const [link, counts, conflicts, rules] = await Promise.all([getLink(ctx.studioId), syncCounts(ctx.studioId), openConflicts(ctx.studioId), listRules(ctx.studioId)]);
      if (!link) return { enlazado: false, nota: "El estudio no tiene enlace con la API de Tango. Sigue funcionando la importación por archivo y el conector local." };
      return {
        enlazado: true,
        modo: link.webhooks ? "webhooks (al instante)" : "sondeo cada 15 minutos",
        escritura_en_tango: link.write_enabled,
        ultimo_error: link.last_error,
        comprobantes: counts.map((c) => ({ estado: c.status, origen: c.origin, cantidad: c.n })),
        conflictos: conflicts.slice(0, 20).map(({ c, d }) => ({ comprobante: `${d.doc_type} ${d.number}`, cliente: d.customer_std, diferencias: c.fields })),
        nombres_para_revisar: rules.filter((r) => r.status === "sugerida").slice(0, 20).map((r) => ({ como_viene: r.examples, sugerido: r.standard })),
        enlace: "/admin/configuracion/conexiones/tango/sincronizacion",
      };
    },
  }),
  defineTool<{ organizacion_id: string }, unknown>({
    name: "sistemas_conectados",
    title: "Sistemas conectados de una organización",
    description: "Qué sistemas externos tiene conectados una organización (Tango, Xubio, Contabilium, archivos, tiendas, Mercado Pago), quién manda en cada área (contabilidad, facturación, compras, sueldos y stock), qué espeja y qué escribe cada uno, su última sincronización y los conflictos abiertos.",
    module: "conexiones",
    level: "lectura",
    roles: ["dueno", "contador", "colaborador"],
    input: z.object({ organizacion_id: uuid("ID de la organización") }),
    organizationOf: async (input) => input.organizacion_id,
    async handler(input, ctx) {
      const o = await ctx.organization(input.organizacion_id);
      const { orgAdapters, sourcesOf, conflictsOf } = await import("@/modules/adapters/server");
      const { mirrorsAndWrites, ENTITIES, STATUS_LABEL } = await import("@/modules/adapters/types");
      const scope = { studioId: ctx.studioId, organizationId: o.id };
      const [adapters, sources, conflicts] = await Promise.all([orgAdapters(scope), sourcesOf(scope), conflictsOf(scope)]);
      const name = (k: string) => (k === "faro" ? "Faro" : (adapters.find((a) => a.def.key === k)?.def.name ?? k));
      return {
        organizacion: o.name,
        fuente_de_verdad: Object.fromEntries(Object.entries(sources).map(([area, k]) => [area, name(k)])),
        sistemas: adapters.map((a) => {
          const mw = mirrorsAndWrites(a.def);
          return { sistema: a.def.name, clave: a.def.key, estado: STATUS_LABEL[a.state.status], espeja: mw.mirrors.map((e) => ENTITIES[e]), escribe: mw.writes.map((e) => ENTITIES[e]), registros: a.state.records, ultima_sincronizacion: a.state.lastSync?.toISOString() ?? null, conflictos: a.state.conflicts };
        }),
        conflictos_abiertos: conflicts.map((c) => ({ sistema: name(c.adapter), que: c.title, campos: c.fields })),
        enlace: `/admin/organizaciones/${o.id}?tab=sistemas`,
      };
    },
  }),
  defineTool<{ organizacion_id: string; sistema: string }, unknown>({
    name: "sincronizar_sistema",
    title: "Sincronizar un sistema conectado",
    description: "Trae lo nuevo de un sistema conectado (Xubio, Contabilium, Tango, Google Drive o una tienda) al núcleo de Faro, sin pisar nada: si Faro y el sistema cambiaron lo mismo, queda un conflicto para que decida una persona.",
    module: "conexiones",
    level: "escritura",
    roles: ["dueno", "contador"],
    input: z.object({ organizacion_id: uuid("ID de la organización"), sistema: z.string().min(2).max(40).describe("tango, xubio, contabilium, google_drive o tienda_<plataforma>") }),
    organizationOf: async (input) => input.organizacion_id,
    async handler(input, ctx) {
      const o = await ctx.organization(input.organizacion_id);
      const { runOp, AdapterError } = await import("@/modules/adapters/server");
      try {
        const r = await runOp({ studioId: ctx.studioId, organizationId: o.id }, ctx.actor, input.sistema, "sincronizar");
        return { organizacion: o.name, ok: r.ok, resultado: r.message };
      } catch (e) {
        if (e instanceof AdapterError) throw new ToolError(e.message, "entrada_invalida");
        throw e;
      }
    },
  }),
];
