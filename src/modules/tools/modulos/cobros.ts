import "server-only";
import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";
import { getDb } from "@/db";
import { fee_charges } from "@/db/schema";
import { accountStatement, listCharges, sendCharge } from "@/modules/billing/fees";
import { BillingError } from "@/modules/billing/mp";
import { defineTool, ToolError } from "../types";
import { limite, uuid } from "./helpers";

// Honorarios para el Vigía: consultar es lectura; mandar un cobro a un
// cliente es una comunicación de pago, así que va siempre a Aprobaciones.

const pesos = (c: number) => Math.round(c) / 100;

export const cobrosTools = [
  defineTool<{ organizacion_id: string }, unknown>({
    name: "estado_de_cuenta",
    title: "Estado de cuenta de una organización",
    description: "Honorarios de una organización con el estudio: total pendiente, vencido y pagado, y los cargos con su vencimiento y estado.",
    module: "cobros",
    level: "lectura",
    roles: ["dueno", "contador"],
    input: z.object({ organizacion_id: uuid("ID de la organización") }),
    async organizationOf(input) {
      return input.organizacion_id;
    },
    async handler(input, ctx) {
      const org = await ctx.organization(input.organizacion_id);
      const st = await accountStatement(ctx.studioId, org.id);
      return { organizacion: org.name, pendiente: pesos(st.pending), vencido: pesos(st.overdue), pagado: pesos(st.paid), cargos: st.rows.map((r) => ({ id: r.id, concepto: r.concept, importe: pesos(r.amount), vence: r.due_date, estado: r.status })) };
    },
  }),
  defineTool<{ limite: number }, unknown>({
    name: "cobros_pendientes",
    title: "Cobros pendientes",
    description: "Cargos de honorarios pendientes de todas las organizaciones, del más viejo al más nuevo, con los vencidos marcados.",
    module: "cobros",
    level: "lectura",
    roles: ["dueno", "contador"],
    input: z.object({ limite }),
    async handler(input, ctx) {
      const rows = (await listCharges(ctx.studioId, { status: "pendiente" })).filter((r) => !ctx.allowedOrganizations || ctx.allowedOrganizations.includes(r.c.organization_id));
      const today = new Date().toISOString().slice(0, 10);
      return { total: rows.length, cargos: rows.slice(0, input.limite).map(({ c, org }) => ({ id: c.id, organizacion: org, concepto: c.concept, importe: pesos(c.amount), vence: c.due_date, vencido: c.due_date < today, recordatorios: c.reminders_sent.length })), enlace: "/admin/honorarios" };
    },
  }),
  defineTool<{ cargo_id: string }, unknown>({
    name: "enviar_cobro",
    title: "Enviar un cobro al cliente",
    description: "Manda al cliente el cobro de un cargo de honorarios por mail y aviso en el portal, con el link de pago de Mercado Pago. Siempre queda en Aprobaciones hasta que una persona del estudio lo aprueba.",
    module: "cobros",
    level: "sensible",
    roles: ["dueno", "contador"],
    input: z.object({ cargo_id: uuid("ID del cargo") }),
    async organizationOf(input, ctx) {
      const [c] = await getDb().select({ org: fee_charges.organization_id }).from(fee_charges).where(and(eq(fee_charges.id, input.cargo_id), eq(fee_charges.studio_id, ctx.studioId)));
      if (!c) throw new ToolError("No encontramos ese cargo.", "no_encontrado");
      return c.org;
    },
    describe: () => "Enviar el cobro con el link de pago al cliente",
    async handler(input, ctx) {
      try {
        const r = await sendCharge(ctx.studioId, input.cargo_id, ctx.actor);
        return { enviado: true, destinatarios: r.sentTo, link: r.link };
      } catch (e) {
        if (e instanceof BillingError) throw new ToolError(e.message, "error");
        throw e;
      }
    },
  }),
];
