import "server-only";
import { and, count, eq, gte, inArray, isNull, lte, notInArray, sum } from "drizzle-orm";
import { z } from "zod/v4";
import { getDb } from "@/db";
import { approvals, bookings, documents, leads, obligations, organizations, requests } from "@/db/schema";
import { defineTool } from "../types";
import { orgFilter } from "./helpers";

export const estudioTools = [
  defineTool({
    name: "resumen_estudio",
    title: "Resumen del estudio",
    description:
      "Foto del estudio hoy: organizaciones por estado y riesgo, vencimientos de los próximos 7 días y vencidos, solicitudes abiertas, documentos sin revisar, consultas nuevas, llamadas de la semana, propuestas pendientes de aprobación y honorarios mensuales.",
    module: "estudio",
    level: "lectura",
    // Incluye honorarios: solo administradores
    roles: ["admin"],
    input: z.object({}),
    async handler(_input, ctx) {
      const db = getDb();
      const today = new Date().toISOString().slice(0, 10);
      const week = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
      const studio = eq(organizations.studio_id, ctx.studioId);
      const [orgs, [due], [late], [open], [unread], [newLeads], [calls], [pending], [fees]] = await Promise.all([
        db
          .select({ estado: organizations.status, riesgo: organizations.risk_level, n: count() })
          .from(organizations)
          .where(and(studio, orgFilter(ctx, organizations.id)))
          .groupBy(organizations.status, organizations.risk_level),
        db
          .select({ n: count() })
          .from(obligations)
          .where(
            and(
              eq(obligations.studio_id, ctx.studioId),
              orgFilter(ctx, obligations.organization_id),
              gte(obligations.due_date, today),
              lte(obligations.due_date, week),
              notInArray(obligations.status, ["presentado", "pagado"]),
            ),
          ),
        db
          .select({ n: count() })
          .from(obligations)
          .where(
            and(
              eq(obligations.studio_id, ctx.studioId),
              orgFilter(ctx, obligations.organization_id),
              lte(obligations.due_date, today),
              notInArray(obligations.status, ["presentado", "pagado"]),
            ),
          ),
        db
          .select({ n: count() })
          .from(requests)
          .where(and(eq(requests.studio_id, ctx.studioId), orgFilter(ctx, requests.organization_id), inArray(requests.status, ["abierta", "en_curso"]))),
        db
          .select({ n: count() })
          .from(documents)
          .where(and(eq(documents.studio_id, ctx.studioId), orgFilter(ctx, documents.organization_id), eq(documents.source, "cliente"), isNull(documents.reviewed_at))),
        db
          .select({ n: count() })
          .from(leads)
          .where(and(eq(leads.studio_id, ctx.studioId), eq(leads.status, "nuevo"))),
        db
          .select({ n: count() })
          .from(bookings)
          .where(and(eq(bookings.studio_id, ctx.studioId), eq(bookings.status, "confirmada"), gte(bookings.starts_at, new Date()), lte(bookings.starts_at, new Date(Date.now() + 7 * 86400000)))),
        db
          .select({ n: count() })
          .from(approvals)
          .where(and(eq(approvals.studio_id, ctx.studioId), eq(approvals.status, "pendiente"), eq(approvals.level, "sensible"))),
        db
          .select({ total: sum(organizations.monthly_fee) })
          .from(organizations)
          .where(and(studio, orgFilter(ctx, organizations.id), eq(organizations.status, "activa"))),
      ]);
      const scoped = Boolean(ctx.allowedOrganizations);
      return {
        organizaciones: orgs,
        vencimientos_proximos_7_dias: due.n,
        vencimientos_atrasados: late.n,
        solicitudes_abiertas: open.n,
        documentos_sin_revisar: unread.n,
        ...(scoped ? {} : { consultas_nuevas: newLeads.n, llamadas_esta_semana: calls.n, propuestas_pendientes: pending.n }),
        honorarios_mensuales_activos: fees.total ? Number(fees.total) : 0,
      };
    },
  }),
];
