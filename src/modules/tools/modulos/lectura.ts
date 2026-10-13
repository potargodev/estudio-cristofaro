import "server-only";
import { TAX_LABEL, taxBreakdown, type TaxKind } from "@/modules/bank-rec/core";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod/v4";
import { getDb } from "@/db";
import { documents, organizations, smart_documents } from "@/db/schema";
import { listStatements, orgStatus, statementView } from "@/modules/bank-rec/server";
import type { Extraction } from "@/modules/smart-docs/core";
import { readExisting, SmartDocError } from "@/modules/smart-docs/server";
import { defineTool, ToolError } from "../types";
import { limite, orgFilter, uuid } from "./helpers";

// Lectura inteligente y conciliación para el Vigía. Leer un documento deja el
// resultado en "Para confirmar" (no confirma nada); confirmar y conciliar
// siguen siendo acciones de una persona en la pantalla.

export const lecturaTools = [
  defineTool<{ documento_id: string }, unknown>({
    name: "leer_comprobante",
    title: "Leer un comprobante con IA",
    description: "Lee con IA un documento PDF o foto que ya está en Documentos de una organización (factura, ticket o extracto) y lo deja en la bandeja «Para confirmar» de la lectura inteligente, con validaciones y alerta de duplicados. No confirma nada.",
    module: "documentos",
    level: "escritura",
    roles: ["dueno", "contador", "colaborador"],
    input: z.object({ documento_id: uuid("ID del documento") }),
    async organizationOf(input, ctx) {
      const [d] = await getDb().select({ org: documents.organization_id }).from(documents).where(and(eq(documents.id, input.documento_id), eq(documents.studio_id, ctx.studioId)));
      if (!d) throw new ToolError("No encontramos ese documento.", "no_encontrado");
      return d.org;
    },
    describe: () => "Leer el documento con IA y dejarlo para confirmar",
    async handler(input, ctx) {
      const [d] = await getDb().select({ org: documents.organization_id }).from(documents).where(and(eq(documents.id, input.documento_id), eq(documents.studio_id, ctx.studioId)));
      if (!d) throw new ToolError("No encontramos ese documento.", "no_encontrado");
      await ctx.organization(d.org);
      try {
        const r = await readExisting({ studioId: ctx.studioId, organizationId: d.org, ownerUserId: null, scope: "organizacion", canConfirm: true }, ctx.actor, input.documento_id);
        const e = r.extracted as unknown as Extraction | null;
        return { estado: r.status, emisor: e?.razon_social_emisor ?? null, total: e?.total ?? null, repetido: !!r.duplicate_of, revisar: r.low_fields, enlace: `/admin/organizaciones/${d.org}/lectura/${r.id}` };
      } catch (err) {
        if (err instanceof SmartDocError) throw new ToolError(err.message, "error");
        throw err;
      }
    },
  }),
  defineTool<{ organizacion_id?: string; limite: number }, unknown>({
    name: "comprobantes_para_confirmar",
    title: "Comprobantes para confirmar",
    description: "Documentos leídos con IA que esperan revisión en la bandeja «Para confirmar» (de una organización o de todas), con total, emisor, datos a revisar y si parecen repetidos.",
    module: "documentos",
    level: "lectura",
    roles: ["dueno", "contador", "colaborador"],
    input: z.object({ organizacion_id: uuid("ID de la organización").optional(), limite }),
    async organizationOf(input) {
      return input.organizacion_id ?? null;
    },
    async handler(input, ctx) {
      if (input.organizacion_id) await ctx.organization(input.organizacion_id);
      const rows = await getDb()
        .select({ id: smart_documents.id, org: organizations.id, organizacion: organizations.name, archivo: smart_documents.file_name, extracted: smart_documents.extracted, low: smart_documents.low_fields, dup: smart_documents.duplicate_of })
        .from(smart_documents)
        .innerJoin(organizations, eq(organizations.id, smart_documents.organization_id))
        .where(and(eq(smart_documents.studio_id, ctx.studioId), eq(organizations.studio_id, ctx.studioId), eq(smart_documents.scope, "organizacion"), eq(smart_documents.status, "para_confirmar"), orgFilter(ctx, smart_documents.organization_id), input.organizacion_id ? eq(smart_documents.organization_id, input.organizacion_id) : undefined))
        .orderBy(desc(smart_documents.created_at))
        .limit(input.limite);
      return {
        total: rows.length,
        documentos: rows.map((r) => {
          const e = r.extracted as unknown as Extraction | null;
          return { organizacion: r.organizacion, archivo: r.archivo, emisor: e?.razon_social_emisor ?? null, total: e?.total ?? null, fecha: e?.fecha ?? null, revisar: r.low, repetido: !!r.dup, enlace: `/admin/organizaciones/${r.org}/lectura/${r.id}` };
        }),
      };
    },
  }),
  defineTool<{ organizacion_id: string }, unknown>({
    name: "estado_conciliacion",
    title: "Estado de la conciliación bancaria",
    description: "Cómo viene la conciliación bancaria de una organización: movimientos sin conciliar, sugeridos y conciliados, y el resumen del último extracto (facturas pagadas, pendientes, en tránsito, pagos sin factura, comisiones e impuestos) con el detalle de impuestos del banco: débitos y créditos (Ley 25.413), SIRCREB, percepciones e IVA de gastos.",
    module: "conciliacion",
    level: "lectura",
    roles: ["dueno", "contador"],
    input: z.object({ organizacion_id: uuid("ID de la organización") }),
    async organizationOf(input) {
      return input.organizacion_id;
    },
    async handler(input, ctx) {
      const org = await ctx.organization(input.organizacion_id);
      const scope = { studioId: ctx.studioId, organizationId: org.id };
      const [status, list] = await Promise.all([orgStatus(scope), listStatements(scope)]);
      const last = list.find((x) => x.total > 0) ?? list[0];
      const view = last ? await statementView(scope, last.id) : null;
      const pesos = (c: number) => Math.round(c) / 100;
      return {
        organizacion: org.name,
        movimientos: status,
        ultimo_extracto: view ? { banco: view.st.bank, desde: view.st.period_from, hasta: view.st.period_to, ...view.summary, comisiones: pesos(view.summary.comisiones), impuestos: pesos(view.summary.impuestos), enlace: `/admin/organizaciones/${org.id}/conciliacion/${view.st.id}` } : null,
        impuestos_bancarios: view
          ? (() => {
              const t = taxBreakdown(view.movs);
              return { ...Object.fromEntries(Object.entries(t.totals).filter(([, v]) => v).map(([k, v]) => [TAX_LABEL[k as TaxKind], pesos(v)])), computable_ley_25413_a_validar: pesos(t.computable) };
            })()
          : null,
      };
    },
  }),
];
