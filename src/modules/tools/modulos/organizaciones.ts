import "server-only";
import { and, asc, count, desc, eq, ilike, inArray, ne, notInArray, or } from "drizzle-orm";
import { z } from "zod/v4";
import { getDb } from "@/db";
import { documents, legal_entities, obligations, organization_modules, organizations, requests, service_plans } from "@/db/schema";
import { getOrgStaff } from "@/lib/organizations";
import { likeTerm } from "@/lib/search";
import { defineTool } from "../types";
import { limite, orgFilter, uuid } from "./helpers";

export const organizacionesTools = [
  defineTool({
    name: "buscar_organizaciones",
    title: "Buscar organizaciones",
    description:
      "Busca organizaciones (empresas clientes) del estudio por nombre, razón social o CUIT. Sin texto devuelve las más recientes. Devuelve id, nombre, estado, riesgo y plan.",
    module: "organizaciones",
    level: "lectura",
    roles: ["admin", "contador"],
    input: z.object({
      texto: z.string().max(120).optional().describe("Nombre, razón social o CUIT (con o sin guiones)"),
      estado: z.enum(["onboarding", "activa", "pausada", "baja"]).optional(),
      limite,
    }),
    async handler(input, ctx) {
      const db = getDb();
      const q = input.texto?.trim();
      const digits = q?.replace(/\D/g, "") ?? "";
      const matchIds = q
        ? (
            await db
              .selectDistinct({ id: legal_entities.organization_id })
              .from(legal_entities)
              .where(
                and(
                  eq(legal_entities.studio_id, ctx.studioId),
                  or(ilike(legal_entities.business_name, likeTerm(q)), digits.length >= 4 ? ilike(legal_entities.cuit, `%${digits}%`) : undefined),
                ),
              )
          ).map((r) => r.id)
        : [];
      const rows = await db
        .select({
          id: organizations.id,
          nombre: organizations.name,
          estado: organizations.status,
          riesgo: organizations.risk_level,
          plan: service_plans.name,
        })
        .from(organizations)
        .leftJoin(service_plans, eq(service_plans.id, organizations.service_plan_id))
        .where(
          and(
            eq(organizations.studio_id, ctx.studioId),
            orgFilter(ctx, organizations.id),
            input.estado ? eq(organizations.status, input.estado) : undefined,
            q ? or(ilike(organizations.name, likeTerm(q)), matchIds.length ? inArray(organizations.id, matchIds) : undefined) : undefined,
          ),
        )
        .orderBy(q ? asc(organizations.name) : desc(organizations.created_at))
        .limit(input.limite);
      return { total: rows.length, organizaciones: rows };
    },
  }),
  defineTool({
    name: "ver_organizacion",
    title: "Ver ficha de organización",
    description:
      "Ficha de una organización: datos de contacto, razones sociales y CUIT, plan, módulos activos, equipo del estudio y conteos de vencimientos pendientes, solicitudes abiertas y documentos.",
    module: "organizaciones",
    level: "lectura",
    roles: ["admin", "contador"],
    input: z.object({ organizacion_id: uuid("ID de la organización") }),
    async organizationOf(input) {
      return input.organizacion_id;
    },
    async handler(input, ctx) {
      const org = await ctx.organization(input.organizacion_id);
      const db = getDb();
      const [[full], entities, mods, staff, [pend], [open], [docs]] = await Promise.all([
        db
          .select({ o: organizations, plan: service_plans.name })
          .from(organizations)
          .leftJoin(service_plans, eq(service_plans.id, organizations.service_plan_id))
          .where(eq(organizations.id, org.id)),
        db
          .select({ id: legal_entities.id, razon_social: legal_entities.business_name, cuit: legal_entities.cuit, regimen: legal_entities.regime })
          .from(legal_entities)
          .where(eq(legal_entities.organization_id, org.id)),
        db
          .select({ key: organization_modules.module_key })
          .from(organization_modules)
          .where(and(eq(organization_modules.organization_id, org.id), eq(organization_modules.active, true))),
        getOrgStaff(org.id),
        db
          .select({ n: count() })
          .from(obligations)
          .where(and(eq(obligations.organization_id, org.id), notInArray(obligations.status, ["presentado", "pagado"]))),
        db
          .select({ n: count() })
          .from(requests)
          .where(and(eq(requests.organization_id, org.id), ne(requests.status, "resuelta"))),
        db.select({ n: count() }).from(documents).where(eq(documents.organization_id, org.id)),
      ]);
      const o = full.o;
      return {
        id: o.id,
        nombre: o.name,
        estado: o.status,
        riesgo: o.risk_level,
        plan: full.plan,
        contacto: { nombre: o.contact_name, email: o.email, telefono: o.phone },
        servicios: o.services,
        notas: o.notes,
        razones_sociales: entities,
        modulos_activos: mods.map((m) => m.key),
        equipo_estudio: staff.map((s) => ({ nombre: s.name, email: s.email, rol: s.assignment })),
        vencimientos_pendientes: pend.n,
        solicitudes_abiertas: open.n,
        documentos: docs.n,
      };
    },
  }),
];
