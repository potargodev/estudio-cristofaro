import "server-only";
import { z } from "zod/v4";
import { formatMoney, todayAR, CURRENCIES } from "@/modules/gastos/constants";
import { splitExpense, SplitError } from "@/modules/gastos/core/split";
import type { GastosActor } from "@/modules/gastos/server/actor";
import { GastosError, createExpense, getGroupView, listGroups, recordSettlement, type GroupSummary } from "@/modules/gastos/server/service";
import { defineTool, ToolError, type HandlerContext } from "../types";
import { uuid } from "./helpers";

// Grupos de gastos para el Asistente y MCP. Operan como la persona que
// pregunta (solo sus grupos). Crear y consultar no piden aprobación; un pago
// por Mercado Pago es sensible y va a Aprobaciones.

const ROLES = ["dueno", "contador", "colaborador", "titular"] as const;

const actorOf = (ctx: HandlerContext): GastosActor => ({ kind: "user", studioId: ctx.studioId, userId: ctx.actor.id, name: ctx.actor.name, email: ctx.actor.email, role: ctx.actor.role });

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

const ME = new Set(["yo", "mi", "me", "vos", "nosotros"]);

async function wrap<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof GastosError || e instanceof SplitError) throw new ToolError(e.message, "entrada_invalida");
    throw e;
  }
}

/** Integrante por nombre (completo, de pila o el comienzo), sin tildes ni mayúsculas */
function findMember<T extends { id: string; name: string }>(members: T[], wanted: string, meId: string): T | null {
  const w = norm(wanted);
  if (ME.has(w)) return members.find((m) => m.id === meId) ?? null;
  const exact = members.filter((m) => norm(m.name) === w);
  if (exact.length === 1) return exact[0];
  const first = members.filter((m) => norm(m.name).split(/\s+/)[0] === w || norm(m.name).startsWith(w));
  return first.length === 1 ? first[0] : null;
}

/** Grupo por id, por nombre o, si no se dice, el único grupo donde están todas las personas nombradas */
async function resolveGroup(actor: GastosActor, input: { grupo_id?: string; grupo?: string }, names: string[]) {
  const groups = await listGroups(actor);
  if (!groups.length) throw new ToolError("No tenés grupos de grupos de gastos. Creá uno en Grupos de gastos.", "entrada_invalida");
  if (input.grupo_id) return input.grupo_id;
  if (input.grupo) {
    const w = norm(input.grupo);
    const hit = groups.filter((g) => norm(g.name).includes(w));
    if (hit.length === 1) return hit[0].id;
    throw new ToolError(`No encontré un único grupo llamado "${input.grupo}". Tus grupos: ${groups.map((g) => g.name).join(", ")}.`, "entrada_invalida");
  }
  if (groups.length === 1) return groups[0].id;
  const fits: GroupSummary[] = [];
  for (const g of groups) {
    const v = await getGroupView(actor, g.id);
    if (names.every((n) => findMember(v.members, n, v.me.id))) fits.push(g);
  }
  if (fits.length === 1) return fits[0].id;
  throw new ToolError(`¿En qué grupo? Tus grupos: ${groups.map((g) => g.name).join(", ")}.`, "entrada_invalida");
}

const crearInput = z.object({
  descripcion: z.string().min(2).max(140).describe("En qué se gastó (ej. Cena)"),
  monto: z.number().positive().describe("Importe total en la moneda (ej. 48000 para $48.000)"),
  moneda: z.enum(CURRENCIES).default("ARS"),
  grupo_id: uuid("ID del grupo").optional(),
  grupo: z.string().max(80).optional().describe("Nombre del grupo, si no se sabe el ID"),
  pagado_por: z.string().max(80).default("yo").describe('Nombre de quien pagó; "yo" para quien pregunta'),
  dividir_entre: z.array(z.string().max(80)).max(50).optional().describe("Nombres de las personas entre las que se divide (sin contar a quien pregunta). Vacío: todo el grupo"),
  incluirme: z.boolean().default(true).describe("Si quien pregunta también participa del reparto"),
  metodo: z.enum(["iguales", "porcentaje", "partes", "montos"]).default("iguales"),
  valores: z.record(z.string(), z.number()).optional().describe("Para porcentaje, partes o montos: nombre → valor (montos en la moneda)"),
  categoria: z.string().max(30).optional(),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("YYYY-MM-DD; por defecto hoy"),
});

const pagoInput = z.object({
  grupo_id: uuid("ID del grupo").optional(),
  grupo: z.string().max(80).optional(),
  paga: z.string().max(80).default("yo").describe('Quien paga; "yo" para quien pregunta'),
  cobra: z.string().max(80).describe("Quien cobra"),
  monto: z.number().positive().describe("Importe en la moneda"),
  moneda: z.enum(CURRENCIES).default("ARS"),
  medio: z.enum(["efectivo", "transferencia", "mercado_pago"]).default("transferencia"),
});

export const gastosTools = [
  defineTool({
    name: "listar_grupos_gastos",
    title: "Ver mis grupos de gastos",
    description: "Grupos de grupos de gastos de quien pregunta, con su saldo en cada uno (positivo: le deben).",
    module: "gastos",
    level: "lectura",
    roles: ROLES,
    input: z.object({}),
    async handler(_input, ctx) {
      const groups = await listGroups(actorOf(ctx));
      return groups.map((g) => ({ id: g.id, grupo: g.name, personas: g.members, saldo: Object.entries(g.mine).map(([c, v]) => (v > 0 ? `te deben ${formatMoney(v, c)}` : `debés ${formatMoney(-v, c)}`)).join(", ") || "al día" }));
    },
  }),
  defineTool({
    name: "consultar_saldos",
    title: "Consultar saldos",
    description: "Saldos de un grupo de grupos de gastos (o de todos) y las transferencias para quedar a mano.",
    module: "gastos",
    level: "lectura",
    roles: ROLES,
    input: z.object({ grupo_id: uuid("ID del grupo").optional(), grupo: z.string().max(80).optional() }),
    async handler(input, ctx) {
      const actor = actorOf(ctx);
      return wrap(async () => {
        const ids = input.grupo_id || input.grupo ? [await resolveGroup(actor, input, [])] : (await listGroups(actor)).map((g) => g.id);
        const out = [];
        for (const id of ids.slice(0, 10)) {
          const v = await getGroupView(actor, id);
          const name = (mid: string) => v.members.find((m) => m.id === mid)?.name ?? "—";
          out.push({
            grupo: v.group.name,
            saldos: Object.entries(v.balances).flatMap(([cur, per]) => v.members.map((m) => ({ persona: m.name, moneda: cur, saldo: (per[m.id] ?? 0) / 100 }))),
            para_quedar_a_mano: Object.entries(v.transfers).flatMap(([cur, ts]) => ts.map((t) => `${name(t.from)} le paga ${formatMoney(t.amount, cur)} a ${name(t.to)}`)),
          });
        }
        return out;
      });
    },
  }),
  defineTool({
    name: "dividir_gasto",
    title: "Simular un reparto",
    description: "Calcula cuánto le toca a cada persona de un gasto sin guardarlo (centavos exactos, el resto se asigna de forma determinística).",
    module: "gastos",
    level: "lectura",
    roles: ROLES,
    input: z.object({
      monto: z.number().positive(),
      personas: z.array(z.string().max(80)).min(1).max(50),
      metodo: z.enum(["iguales", "porcentaje", "partes"]).default("iguales"),
      valores: z.record(z.string(), z.number()).optional().describe("Porcentajes o partes por persona"),
    }),
    async handler(input) {
      return wrap(async () => {
        const total = Math.round(input.monto * 100);
        const spec =
          input.metodo === "iguales"
            ? { method: "iguales" as const, members: input.personas }
            : input.metodo === "porcentaje"
              ? { method: "porcentaje" as const, percents: Object.fromEntries(input.personas.map((p) => [p, input.valores?.[p] ?? 0])) }
              : { method: "partes" as const, parts: Object.fromEntries(input.personas.map((p) => [p, input.valores?.[p] ?? 1])) };
        const shares = splitExpense(total, spec);
        return Object.entries(shares).map(([persona, c]) => ({ persona, le_toca: formatMoney(c) }));
      });
    },
  }),
  defineTool({
    name: "crear_gasto",
    title: "Cargar un gasto compartido",
    description:
      'Carga un gasto en un grupo de grupos de gastos y lo divide. Ej.: "pagué $48.000 de la cena con Juan y Ana, dividido igual" → descripcion "Cena", monto 48000, dividir_entre ["Juan","Ana"]. No pide aprobación.',
    module: "gastos",
    level: "escritura",
    autoRun: true,
    roles: ROLES,
    input: crearInput,
    describe: (i) => `Cargar ${i.descripcion} por ${formatMoney(Math.round(i.monto * 100), i.moneda)}`,
    async handler(input, ctx) {
      const actor = actorOf(ctx);
      return wrap(async () => {
        const names = [...(input.dividir_entre ?? []), ...(input.pagado_por && !ME.has(norm(input.pagado_por)) ? [input.pagado_por] : [])];
        const groupId = await resolveGroup(actor, input, names);
        const v = await getGroupView(actor, groupId);
        const need = (n: string) => {
          const m = findMember(v.members, n, v.me.id);
          if (!m) throw new ToolError(`No encontré a "${n}" en ${v.group.name}. Integrantes: ${v.members.map((x) => x.name).join(", ")}.`, "entrada_invalida");
          return m.id;
        };
        const total = Math.round(input.monto * 100);
        const payer = need(input.pagado_por);
        let people = input.dividir_entre?.length ? input.dividir_entre.map(need) : v.members.map((m) => m.id);
        if (input.dividir_entre?.length && input.incluirme) people = [...new Set([v.me.id, ...people])];
        const vals = (f: (x: number) => number) => Object.fromEntries(Object.entries(input.valores ?? {}).map(([k, x]) => [need(k), f(x)]));
        const split =
          input.metodo === "iguales"
            ? { method: "iguales" as const, members: people }
            : input.metodo === "porcentaje"
              ? { method: "porcentaje" as const, percents: vals((x) => x) }
              : input.metodo === "partes"
                ? { method: "partes" as const, parts: vals((x) => Math.round(x)) }
                : { method: "montos" as const, amounts: vals((x) => Math.round(x * 100)) };
        const e = await createExpense(
          actor,
          groupId,
          { description: input.descripcion, amount: total, currency: input.moneda, date: input.fecha ?? todayAR(), category: input.categoria ?? "otros", payers: { [payer]: total }, split },
          { origin: "asistente" },
        );
        const fresh = await getGroupView(actor, groupId);
        const exp = fresh.expenses.find((x) => x.id === e.id)!;
        const name = (mid: string) => fresh.members.find((m) => m.id === mid)?.name ?? "—";
        return {
          listo: `Cargué ${e.description} por ${formatMoney(total, e.currency)} en ${fresh.group.name}`,
          pago: name(payer),
          partes: Object.entries(exp.shares).map(([m, c]) => `${name(m)}: ${formatMoney(c, e.currency)}`),
          link: `/grupos/g/${groupId}/gasto/${e.id}`,
        };
      });
    },
  }),
  defineTool({
    name: "registrar_pago",
    title: "Registrar un pago entre personas",
    description: "Registra que alguien le pagó a otra persona de un grupo de grupos de gastos. Con Mercado Pago es sensible y pasa por Aprobaciones.",
    module: "gastos",
    level: (i: z.infer<typeof pagoInput>) => (i.medio === "mercado_pago" ? "sensible" : "escritura"),
    roles: ROLES,
    input: pagoInput,
    describe: (i) => `Registrar pago de ${i.paga} a ${i.cobra} por ${formatMoney(Math.round(i.monto * 100), i.moneda)} (${i.medio.replace("_", " ")})`,
    async handler(input, ctx) {
      const actor = actorOf(ctx);
      return wrap(async () => {
        const groupId = await resolveGroup(actor, input, [input.cobra, ...(ME.has(norm(input.paga)) ? [] : [input.paga])]);
        const v = await getGroupView(actor, groupId);
        const from = findMember(v.members, input.paga, v.me.id);
        const to = findMember(v.members, input.cobra, v.me.id);
        if (!from || !to) throw new ToolError(`No encontré a esas personas en ${v.group.name}.`, "entrada_invalida");
        const s = await recordSettlement(actor, groupId, { from: from.id, to: to.id, amount: Math.round(input.monto * 100), currency: input.moneda, method: input.medio });
        return { listo: `Registré que ${from.name} le pagó ${formatMoney(s.amount, s.currency)} a ${to.name}. Falta que la otra persona lo confirme.`, link_de_pago: s.payment_link };
      });
    },
  }),
];
