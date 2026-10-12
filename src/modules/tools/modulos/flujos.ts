import "server-only";
import { and, count, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { getDb } from "@/db";
import { documents, fee_charges, flows, obligations, request_messages, requests, studios } from "@/db/schema";
import { audit } from "@/lib/audit";
import { esc, sendMail } from "@/lib/email";
import { mailLayout, memberEmails, notifyOrganization } from "@/lib/notify";
import { getSiteUrl } from "@/lib/runtime-config";
import { defineTool, ToolError } from "../types";
import { uuid } from "./helpers";
import { formatDate, formatMoney, formatPeriod } from "@/lib/format";

// El motor de flujos usa el registro de herramientas: se carga al usarlo (si no, la importación es circular)
const engine = () => import("@/modules/flows/engine");

// Flujos para el Vigía y acciones que usan las plantillas. Mandar algo a un
// cliente (recordatorio, pedido de documentación, resumen) es una
// comunicación: siempre va a Aprobaciones, también dentro de un flujo.

const prevMonth = () => {
  const d = new Date(Date.now() - 3 * 3600_000);
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7);
};

export const flujosTools = [
  defineTool<{ corrida_id: string; paso: string; motivo: string }, unknown>({
    name: "continuar_flujo",
    title: "Continuar un flujo",
    description: "Paso de aprobación dentro de un flujo: el flujo sigue cuando una persona lo aprueba en Aprobaciones.",
    module: "flujos",
    level: "sensible",
    roles: ["dueno", "contador"],
    input: z.object({ corrida_id: uuid("ID de la corrida"), paso: z.string().max(40), motivo: z.string().max(300) }),
    describe: (i) => i.motivo,
    async handler(input) {
      return { continuar: true, corrida: input.corrida_id };
    },
  }),
  defineTool<{ vencimiento_id: string }, unknown>({
    name: "recordar_vencimiento",
    title: "Recordar un vencimiento al cliente",
    description: "Le manda a la organización el recordatorio de un vencimiento (impuesto, período, fecha e importe). Va a Aprobaciones.",
    module: "flujos",
    level: "sensible",
    roles: ["dueno", "contador"],
    input: z.object({ vencimiento_id: uuid("ID del vencimiento") }),
    async organizationOf(input, ctx) {
      const [o] = await getDb().select({ org: obligations.organization_id }).from(obligations).where(and(eq(obligations.id, input.vencimiento_id), eq(obligations.studio_id, ctx.studioId)));
      if (!o?.org) throw new ToolError("No encontramos ese vencimiento.", "no_encontrado");
      return o.org;
    },
    describe: () => "Recordarle el vencimiento a la organización",
    async handler(input, ctx) {
      const [o] = await getDb().select().from(obligations).where(and(eq(obligations.id, input.vencimiento_id), eq(obligations.studio_id, ctx.studioId)));
      if (!o?.organization_id) throw new ToolError("No encontramos ese vencimiento.", "no_encontrado");
      await ctx.organization(o.organization_id);
      await notifyOrganization(ctx.studioId, o.organization_id, { kind: "vencimientos", items: [{ tax: o.tax, period: o.period, dueDate: o.due_date }] });
      return { recordado: true, impuesto: o.tax, vence: o.due_date };
    },
  }),
  defineTool<{ organizacion_id: string; periodo?: string }, unknown>({
    name: "pedir_documentacion",
    title: "Pedir documentación faltante",
    description: "Si la organización todavía no subió comprobantes del período (por defecto, el mes anterior), le abre una solicitud pidiéndolos. Va a Aprobaciones.",
    module: "flujos",
    level: "sensible",
    roles: ["dueno", "contador"],
    input: z.object({ organizacion_id: uuid("ID de la organización"), periodo: z.string().regex(/^\d{4}-\d{2}$/).optional() }),
    async organizationOf(input) {
      return input.organizacion_id;
    },
    describe: (i) => `Pedir los comprobantes de ${formatPeriod(i.periodo ?? prevMonth())}`,
    async handler(input, ctx) {
      const org = await ctx.organization(input.organizacion_id);
      const periodo = input.periodo ?? prevMonth();
      const [{ n }] = await getDb().select({ n: count() }).from(documents).where(and(eq(documents.organization_id, org.id), eq(documents.studio_id, ctx.studioId), eq(documents.period, periodo)));
      if (n > 0) return { pedido: false, motivo: "Ya subió documentación del período." };
      const subject = `Documentación de ${formatPeriod(periodo)}`;
      const [r] = await getDb().insert(requests).values({ studio_id: ctx.studioId, organization_id: org.id, type: "consulta", subject, created_by: ctx.actor.id }).returning({ id: requests.id });
      await getDb().insert(request_messages).values({ request_id: r.id, author_id: ctx.actor.id, from_client: false, body: `Hola, todavía no recibimos los comprobantes de ${formatPeriod(periodo)} (facturas de compras y ventas, extractos y gastos). ¿Nos los subís en Documentos? Gracias.` });
      await notifyOrganization(ctx.studioId, org.id, { kind: "respuesta", subject });
      await audit({ studioId: ctx.studioId, organizationId: org.id, actor: ctx.actor, action: "flujo.pedido_documentacion", entityType: "solicitud", entityId: r.id, metadata: { periodo, origen: ctx.origin } });
      return { pedido: true, solicitud: r.id };
    },
  }),
  defineTool<{ organizacion_id: string }, unknown>({
    name: "enviar_resumen_mensual",
    title: "Resumen mensual al cliente",
    description: "Manda a la organización el resumen del mes anterior: vencimientos cumplidos y pendientes, próximos, documentos recibidos, solicitudes abiertas y honorarios pendientes. Va a Aprobaciones.",
    module: "flujos",
    level: "sensible",
    roles: ["dueno", "contador"],
    input: z.object({ organizacion_id: uuid("ID de la organización") }),
    async organizationOf(input) {
      return input.organizacion_id;
    },
    describe: () => "Mandar el resumen del mes a la organización",
    async handler(input, ctx) {
      const org = await ctx.organization(input.organizacion_id);
      const p = prevMonth();
      const from = `${p}-01`;
      const to = new Date(Date.UTC(Number(p.slice(0, 4)), Number(p.slice(5)), 0)).toISOString().slice(0, 10);
      const next = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
      const db = getDb();
      const [obl, upcoming, [docs], [open], [fees], [st]] = await Promise.all([
        db.select({ status: obligations.status, n: sql<number>`count(*)::int` }).from(obligations).where(and(eq(obligations.organization_id, org.id), eq(obligations.studio_id, ctx.studioId), gte(obligations.due_date, from), lte(obligations.due_date, to))).groupBy(obligations.status),
        db.select({ tax: obligations.tax, due: obligations.due_date }).from(obligations).where(and(eq(obligations.organization_id, org.id), eq(obligations.studio_id, ctx.studioId), gte(obligations.due_date, new Date().toISOString().slice(0, 10)), lte(obligations.due_date, next))).limit(10),
        db.select({ n: count() }).from(documents).where(and(eq(documents.organization_id, org.id), eq(documents.studio_id, ctx.studioId), eq(documents.period, p))),
        db.select({ n: count() }).from(requests).where(and(eq(requests.organization_id, org.id), eq(requests.studio_id, ctx.studioId), inArray(requests.status, ["abierta", "en_curso"]))),
        db.select({ total: sql<string>`coalesce(sum(${fee_charges.amount}), 0)` }).from(fee_charges).where(and(eq(fee_charges.organization_id, org.id), eq(fee_charges.studio_id, ctx.studioId), eq(fee_charges.status, "pendiente"))),
        db.select({ name: studios.name }).from(studios).where(eq(studios.id, ctx.studioId)),
      ]);
      const done = obl.filter((o) => o.status !== "pendiente").reduce((s, o) => s + o.n, 0);
      const pend = obl.filter((o) => o.status === "pendiente").reduce((s, o) => s + o.n, 0);
      const html = `<p>Este es el resumen de <strong>${esc(formatPeriod(p))}</strong> de ${esc(org.name)}:</p><ul><li>Vencimientos del mes: ${done} cumplidos${pend ? `, ${pend} pendientes` : ""}.</li><li>Documentos recibidos: ${docs.n}.</li><li>Solicitudes abiertas: ${open.n}.</li>${Number(fees.total) ? `<li>Honorarios pendientes: ${formatMoney(Number(fees.total), "ARS", { decimals: "auto" })}.</li>` : ""}</ul>${upcoming.length ? `<p>Próximos vencimientos:</p><ul>${upcoming.map((u) => `<li>${esc(u.tax)} · ${formatDate(u.due, "numeric")}</li>`).join("")}</ul>` : ""}`;
      const toList = await memberEmails(ctx.studioId, org.id, "inicio.ver");
      for (const e of toList) await sendMail({ to: e, subject: `Resumen de ${formatPeriod(p)} · ${org.name}`, html: mailLayout(`Resumen de ${formatPeriod(p)}`, html, { href: `${getSiteUrl()}/portal`, label: "Abrir el portal" }, st?.name ?? "Faro") });
      await audit({ studioId: ctx.studioId, organizationId: org.id, actor: ctx.actor, action: "flujo.resumen_mensual", entityType: "organizacion", entityId: org.id, metadata: { periodo: p, destinatarios: toList.length, origen: ctx.origin } });
      return { enviado: toList.length > 0, destinatarios: toList.length, periodo: p };
    },
  }),
  defineTool<{ limite?: number }, unknown>({
    name: "listar_flujos",
    title: "Flujos del estudio",
    description: "Los flujos (automatizaciones) del estudio con su disparador, estado y última corrida.",
    module: "flujos",
    level: "lectura",
    roles: ["dueno", "contador", "colaborador"],
    input: z.object({ limite: z.number().int().min(1).max(50).optional() }),
    async handler(_input, ctx) {
      const rows = await getDb().select().from(flows).where(eq(flows.studio_id, ctx.studioId)).limit(50);
      return { flujos: rows.map((f) => ({ id: f.id, nombre: f.name, estado: f.status, disparador: f.trigger_type, evento: f.trigger_event, ultima: f.last_run_at, enlace: `/admin/vigia/flujos/${f.id}` })) };
    },
  }),
  defineTool<{ flujo_id: string; datos?: Record<string, unknown> }, unknown>({
    name: "ejecutar_flujo",
    title: "Ejecutar un flujo",
    description: "Corre ahora un flujo activo cuyo disparador es «mensaje al Vigía», con datos opcionales. Lo sensible del flujo igual pasa por Aprobaciones.",
    module: "flujos",
    level: "escritura",
    roles: ["dueno", "contador"],
    input: z.object({ flujo_id: uuid("ID del flujo"), datos: z.record(z.string(), z.unknown()).optional() }),
    describe: () => "Ejecutar el flujo ahora",
    async handler(input, ctx) {
      const [f] = await getDb().select().from(flows).where(and(eq(flows.id, input.flujo_id), eq(flows.studio_id, ctx.studioId)));
      if (!f) throw new ToolError("No encontramos ese flujo.", "no_encontrado");
      if (f.trigger_type !== "vigia") throw new ToolError("Ese flujo no se dispara desde el Vigía.", "entrada_invalida");
      const { FlowError, triggerManual } = await engine();
      try {
        const r = await triggerManual(ctx.studioId, ctx.actor, f.id, input.datos ?? {}, "vigia");
        return { corrida: r.id, enlace: `/admin/vigia/flujos/${f.id}` };
      } catch (e) {
        if (e instanceof FlowError) throw new ToolError(e.message, "error");
        throw e;
      }
    },
  }),
  defineTool<{ frase: string }, unknown>({
    name: "proponer_flujo",
    title: "Proponer un flujo",
    description: "Arma un flujo en borrador a partir de una frase («cada vez que entre una factura de proveedor, avisale a administración»). Queda para revisar y activar en Automatizaciones.",
    module: "flujos",
    level: "escritura",
    roles: ["dueno", "contador"],
    input: z.object({ frase: z.string().min(8).max(300) }),
    describe: (i) => `Armar un borrador: «${i.frase}»`,
    async handler(input, ctx) {
      const { createFromPhrase, FlowError } = await engine();
      try {
        const r = await createFromPhrase(ctx.studioId, ctx.actor, input.frase);
        return { borrador: r.flow.id, nombre: r.flow.name, explicacion: r.explicacion, enlace: `/admin/vigia/flujos/${r.flow.id}` };
      } catch (e) {
        if (e instanceof FlowError) throw new ToolError(e.message, "error");
        throw e;
      }
    },
  }),
];

