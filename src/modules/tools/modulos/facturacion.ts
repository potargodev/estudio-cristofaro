import "server-only";
import { NO_REEMPLAZA } from "@/modules/escudo/catalog";
import { z } from "zod/v4";
import { fullNumber } from "@/modules/arca/calc";
import { CBTE_TYPES } from "@/modules/arca/config";
import { ArcaError, createDraft, emitInvoice, issuerForTool, latestSituation, listInvoices, semaforoFor } from "@/modules/arca/server";
import { defineTool, ToolError } from "../types";
import { limite, uuid } from "./helpers";
import { formatAmount } from "@/lib/format";

// Facturación y ARCA para el Vigía, MCP y Flujos. Emitir es fiscal: la
// herramienta es "sensible" y nunca se ejecuta sola; crea una propuesta en
// Aprobaciones con el borrador completo. Al aprobarla se emite.

const wrap = async <T>(fn: () => Promise<T>) => {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ArcaError) throw new ToolError(e.message, "entrada_invalida");
    throw e;
  }
};

const facturaInput = z.object({
  organizacion_id: uuid("Organización del estudio que factura (en una cuenta personal no hace falta)").optional(),
  cliente: z.string().min(2).max(160).describe("Nombre o razón social del cliente"),
  documento: z.string().max(13).optional().describe("CUIT (11 números) o DNI del cliente; sin documento va como consumidor final"),
  condicion_iva: z.enum(["responsable_inscripto", "monotributo", "exento", "consumidor_final", "exterior"]).default("consumidor_final").describe("Condición frente al IVA del cliente"),
  mail: z.string().email().optional().describe("Mail del cliente para mandarle el comprobante"),
  descripcion: z.string().min(2).max(200).describe("Qué se factura (ej.: diseño de logo)"),
  importe: z.number().positive().describe("Importe total en pesos (en factura A o B, el neto sin IVA)"),
  alicuota_iva: z.number().optional().describe("Alícuota de IVA si corresponde (21, 10.5…). En monotributo no se usa"),
  punto_de_venta: z.number().int().min(1).default(1),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Fecha AAAA-MM-DD (hoy si no se indica)"),
});
type FacturaInput = z.infer<typeof facturaInput>;

export const facturacionTools = [
  defineTool<FacturaInput, unknown>({
    name: "preparar_factura",
    title: "Emitir factura en ARCA",
    description:
      "Prepara una factura electrónica (A, B, C o E según las condiciones frente al IVA) y la manda a Aprobaciones: se emite en ARCA recién cuando una persona la aprueba. Usala cuando te pidan «facturale 150.000 a Juan Pérez por diseño».",
    module: "facturacion",
    level: "sensible",
    roles: ["dueno", "contador", "titular"],
    input: facturaInput,
    async organizationOf(input, ctx) {
      if (ctx.actor.role === "titular") return (await wrap(() => issuerForTool(ctx.studioId, "titular"))).organizationId;
      if (!input.organizacion_id) throw new ToolError("Indicá la organización que factura.", "entrada_invalida");
      return input.organizacion_id;
    },
    describe: (i) => `Factura a ${i.cliente} por ${formatAmount(i.importe)} · ${i.descripcion}`,
    async handler(input, ctx) {
      const scope = await wrap(() => issuerForTool(ctx.studioId, ctx.actor.role, input.organizacion_id));
      if (input.organizacion_id) await ctx.organization(input.organizacion_id);
      const doc = (input.documento ?? "").replace(/\D/g, "");
      const docType = doc.length === 11 ? 80 : doc.length >= 7 ? 96 : 99;
      const draft = await wrap(() =>
        createDraft(
          scope,
          {
            pointOfSale: input.punto_de_venta,
            issueDate: input.fecha ?? new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10),
            concept: 2,
            customer: { docType, docNumber: doc || "0", name: input.cliente, ivaCondition: input.condicion_iva, email: input.mail ?? null },
            saveCustomer: true,
            items: [{ description: input.descripcion, quantity: 1, unitPrice: input.importe, ivaRate: input.alicuota_iva ?? 21 }],
          },
          ctx.actor,
          "aprobacion",
        ),
      );
      const inv = await wrap(() => emitInvoice({ ...scope, canEmit: true }, draft.id, ctx.actor, "aprobacion"));
      return inv.status === "autorizada"
        ? { estado: "autorizada", comprobante: `${CBTE_TYPES[inv.cbte_type].label} ${fullNumber(inv.point_of_sale, inv.number)}`, cae: inv.cae, total: Number(inv.total), link: `${scope.base}/${inv.id}` }
        : { estado: inv.status, error: inv.error, link: `${scope.base}/${inv.id}` };
    },
  }),
  defineTool({
    name: "listar_comprobantes",
    title: "Listar comprobantes",
    description: "Comprobantes electrónicos emitidos o en borrador, con cliente, número, total y estado.",
    module: "facturacion",
    level: "lectura",
    roles: ["dueno", "contador", "colaborador", "titular"],
    input: z.object({ organizacion_id: uuid("Organización (en una cuenta personal no hace falta)").optional(), estado: z.enum(["borrador", "autorizada", "rechazada", "error"]).optional(), limite }),
    async organizationOf(input) {
      return input.organizacion_id ?? null;
    },
    async handler(input, ctx) {
      if (input.organizacion_id) await ctx.organization(input.organizacion_id);
      const scope = await wrap(() => issuerForTool(ctx.studioId, ctx.actor.role, input.organizacion_id));
      const list = await listInvoices(scope, { status: input.estado ?? null, limit: input.limite });
      return {
        total: list.length,
        comprobantes: list.map((i) => ({ id: i.id, tipo: CBTE_TYPES[i.cbte_type].label, numero: fullNumber(i.point_of_sale, i.number), fecha: i.issue_date, cliente: i.customer_name, total: Number(i.total), estado: i.status, cae: i.cae })),
      };
    },
  }),
  defineTool({
    name: "situacion_monotributo",
    title: "Semáforo de monotributo",
    description: "Facturación de los últimos 12 meses contra el tope de la categoría: cuánto falta, la categoría que corresponde y la próxima recategorización.",
    module: "facturacion",
    level: "lectura",
    roles: ["dueno", "contador", "colaborador", "titular"],
    input: z.object({ organizacion_id: uuid("Organización (en una cuenta personal no hace falta)").optional() }),
    async organizationOf(input) {
      return input.organizacion_id ?? null;
    },
    async handler(input, ctx) {
      if (input.organizacion_id) await ctx.organization(input.organizacion_id);
      const scope = await wrap(() => issuerForTool(ctx.studioId, ctx.actor.role, input.organizacion_id));
      const s = await semaforoFor(scope);
      return { semaforo: s.light, mensaje: s.message, facturado_12_meses: s.income12m, categoria: s.category, tope: s.cap, falta: s.remaining, categoria_sugerida: s.suggested, proxima_recategorizacion: s.nextRecategorization, escala: s.scale.status === "validada" ? "validada" : "a validar", aviso: `Datos según lo cargado, no una revisión profesional. ${NO_REEMPLAZA}` };
    },
  }),
  defineTool({
    name: "situacion_arca",
    title: "Situación en ARCA",
    description: "Última constancia de inscripción consultada en ARCA (régimen, categoría, actividades e impuestos), con su fecha.",
    module: "facturacion",
    level: "lectura",
    roles: ["dueno", "contador", "colaborador", "titular"],
    input: z.object({ organizacion_id: uuid("Organización (en una cuenta personal no hace falta)").optional() }),
    async organizationOf(input) {
      return input.organizacion_id ?? null;
    },
    async handler(input, ctx) {
      if (input.organizacion_id) await ctx.organization(input.organizacion_id);
      const scope = await wrap(() => issuerForTool(ctx.studioId, ctx.actor.role, input.organizacion_id));
      const s = await latestSituation(scope);
      if (!s) return { consultada: false, mensaje: "Todavía no se consultó ARCA. Se hace desde Facturación → Mi situación (o la pestaña ARCA de la organización)." };
      return { consultada: true, fecha: s.fetched_at, estado: s.validation, datos: s.data, error: s.error };
    },
  }),
];
