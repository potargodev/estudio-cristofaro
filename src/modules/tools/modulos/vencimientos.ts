import "server-only";
import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { z } from "zod/v4";
import { getDb } from "@/db";
import { legal_entities, obligations, organizations } from "@/db/schema";
import { audit } from "@/lib/audit";
import { notifyOrganization } from "@/lib/notify";
import { defineTool, ToolError } from "../types";
import { limite, orgFilter, uuid } from "./helpers";

const ESTADOS = ["pendiente", "en_proceso", "presentado", "pagado", "vencido"] as const;
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato AAAA-MM-DD");

const crearInput = z.object({
  organizacion_id: uuid("ID de la organización"),
  impuesto: z.string().min(2).max(80).describe("Impuesto u obligación: IVA, IIBB, Ganancias, Monotributo, F.931…"),
  periodo: z.string().regex(/^\d{4}-\d{2}$/).describe("Período AAAA-MM"),
  vencimiento: fecha.describe("Fecha de vencimiento AAAA-MM-DD"),
  cuit: z.string().optional().describe("CUIT de la razón social, si la organización tiene varias"),
  importe: z.number().nonnegative().optional().describe("Importe a pagar (dato fiscal: requiere aprobación)"),
  link_pago: z.string().url().optional().describe("Link de pago o VEP (requiere aprobación)"),
  notas: z.string().max(500).optional(),
  avisar_al_cliente: z.boolean().default(false).describe("Mandar el aviso por mail a la organización (requiere aprobación)"),
});
type CrearInput = z.infer<typeof crearInput>;

export const vencimientosTools = [
  defineTool({
    name: "listar_vencimientos",
    title: "Listar vencimientos",
    description:
      "Vencimientos impositivos de las organizaciones, ordenados por fecha. Se puede filtrar por organización, estado y rango de fechas (AAAA-MM-DD). Sin rango muestra desde hoy en adelante.",
    module: "vencimientos",
    level: "lectura",
    roles: ["admin", "contador"],
    input: z.object({
      organizacion_id: uuid("ID de la organización").optional(),
      estados: z.array(z.enum(ESTADOS)).optional(),
      desde: fecha.optional(),
      hasta: fecha.optional(),
      limite,
    }),
    async organizationOf(input) {
      return input.organizacion_id ?? null;
    },
    async handler(input, ctx) {
      if (input.organizacion_id) await ctx.organization(input.organizacion_id);
      const desde = input.desde ?? (input.hasta ? undefined : new Date().toISOString().slice(0, 10));
      const rows = await getDb()
        .select({
          id: obligations.id,
          organizacion: organizations.name,
          organizacion_id: organizations.id,
          impuesto: obligations.tax,
          periodo: obligations.period,
          vencimiento: obligations.due_date,
          estado: obligations.status,
          importe: obligations.amount,
          link_pago: obligations.payment_url,
        })
        .from(obligations)
        .innerJoin(organizations, eq(organizations.id, obligations.organization_id))
        .where(
          and(
            eq(obligations.studio_id, ctx.studioId),
            eq(organizations.studio_id, ctx.studioId),
            orgFilter(ctx, obligations.organization_id),
            input.organizacion_id ? eq(obligations.organization_id, input.organizacion_id) : undefined,
            input.estados?.length ? inArray(obligations.status, input.estados) : undefined,
            desde ? gte(obligations.due_date, desde) : undefined,
            input.hasta ? lte(obligations.due_date, input.hasta) : undefined,
          ),
        )
        .orderBy(asc(obligations.due_date))
        .limit(input.limite);
      return { total: rows.length, vencimientos: rows };
    },
  }),
  defineTool<CrearInput, unknown>({
    name: "crear_vencimiento",
    title: "Crear vencimiento",
    description:
      "Carga un vencimiento nuevo en una organización. Sin importe, link de pago ni aviso al cliente se confirma en el momento; con cualquiera de esos datos (fiscales o de pago) queda como propuesta para aprobar.",
    module: "vencimientos",
    input: crearInput,
    level: (i) => (i.importe != null || i.link_pago || i.avisar_al_cliente ? "sensible" : "escritura"),
    roles: ["admin", "contador"],
    async organizationOf(input) {
      return input.organizacion_id;
    },
    describe: (i) =>
      `Crear el vencimiento ${i.impuesto} ${i.periodo} con fecha ${i.vencimiento}${i.importe != null ? ` por $ ${i.importe.toLocaleString("es-AR")}` : ""}${i.avisar_al_cliente ? " y avisarle al cliente" : ""}`,
    async handler(input, ctx) {
      const org = await ctx.organization(input.organizacion_id);
      const db = getDb();
      let legalEntityId: string | null = null;
      if (input.cuit) {
        const digits = input.cuit.replace(/\D/g, "");
        const [le] = await db
          .select({ id: legal_entities.id })
          .from(legal_entities)
          .where(and(eq(legal_entities.organization_id, org.id), eq(legal_entities.cuit, digits)));
        if (!le) throw new ToolError("Esa organización no tiene una razón social con ese CUIT.", "entrada_invalida");
        legalEntityId = le.id;
      }
      const [row] = await db
        .insert(obligations)
        .values({
          studio_id: ctx.studioId,
          organization_id: org.id,
          legal_entity_id: legalEntityId,
          tax: input.impuesto,
          period: input.periodo,
          due_date: input.vencimiento,
          amount: input.importe != null ? String(input.importe) : null,
          payment_url: input.link_pago ?? null,
          notes: input.notas ?? null,
        })
        .returning({ id: obligations.id });
      await audit({
        studioId: ctx.studioId,
        organizationId: org.id,
        actor: ctx.actor,
        action: "vencimientos.crear",
        entityType: "vencimiento",
        entityId: row.id,
        metadata: { origen: ctx.origin, impuesto: input.impuesto, periodo: input.periodo },
      });
      if (input.avisar_al_cliente) {
        await notifyOrganization(ctx.studioId, org.id, {
          kind: "vencimientos",
          items: [{ tax: input.impuesto, period: input.periodo, dueDate: input.vencimiento }],
        });
      }
      return { id: row.id, organizacion: org.name, creado: true, aviso_enviado: input.avisar_al_cliente };
    },
  }),
];
