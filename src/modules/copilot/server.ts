import "server-only";
import { asksForCriteria, criteriaFootnote, professionalReply, SHIELD_PROMPT } from "@/modules/escudo/catalog";
import { professionalTaskIn, suggest } from "@/modules/escudo/server";
import { businessCategoryFor, categoryName as boxCategoryName } from "@/modules/cajas/catalog";
import { addBusinessEntry, deleteBoxEntry, openBusinessBox, CajaError } from "@/modules/cajas/server";
import { activeMembers, addSharedEntry, deleteSharedEntry, mySharedBoxes } from "@/modules/cajas/shared";
import { generateText, jsonSchema, stepCountIs, tool, type ModelMessage, type ToolSet } from "ai";
import { and, asc, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { getDb } from "@/db";
import { box_entries, copilot_messages, copilot_proposals, copilot_reminders, users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { getPrefs } from "@/lib/prefs";
import { monthOf } from "@/modules/bitacora/catalog";
import { BitacoraError, categoryByHint, createEntry, deleteEntry, listCategories, restoreEntry, spentInCategory, updateEntry } from "@/modules/bitacora/server";
import { CATEGORIES } from "@/modules/gastos/constants";
import { splitExpense, SplitError } from "@/modules/gastos/core/split";
import type { GastosActor } from "@/modules/gastos/server/actor";
import { archiveGroup, createExpense, createGroup, deleteExpense, GastosError, getGroupView, inviteMember, listGroups } from "@/modules/gastos/server/service";
import { parseBasic } from "./basic";
import { readCopilotFile } from "./files";
import { checkQuota, recordAlert, type Quota } from "./limits";
import { costUsd, getPlatformAi, isConfigured, platformModel, transcribeAudio } from "./platform";
import { consultarBitacora, consultarSaldos, isProposalTool, PROPOSAL_TOOLS, type ProposalTool } from "./tools";
import { formatDate, formatMoney, todayAR } from "@/lib/format";

// Vigía (docs/faro-producto.md §2.m). Todo opera como el usuario de la
// sesión: sus movimientos, sus grupos (memberOf en grupos de gastos) y su
// historial. La IA propone; lo que afecta a otras personas (un gasto de
// grupo) siempre pide confirmación. Cada registro guarda su mensaje de origen.

export class CopilotError extends Error {}

interface CopilotUser {
  id: string;
  name: string;
  email: string;
  studioId: string;
  role: string;
}

const UUID = /^[0-9a-f-]{36}$/i;
const db = () => getDb();
const actorOf = (u: CopilotUser): GastosActor => ({ kind: "user", studioId: u.studioId, userId: u.id, name: u.name, email: u.email, role: u.role as never });

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
const ME = new Set(["yo", "mi", "me", "vos"]);

function findMember<T extends { id: string; name: string }>(members: T[], wanted: string, meId: string): T | null {
  const w = norm(wanted);
  if (ME.has(w)) return members.find((m) => m.id === meId) ?? null;
  const exact = members.filter((m) => norm(m.name) === w);
  if (exact.length === 1) return exact[0];
  const first = members.filter((m) => norm(m.name).split(/\s+/)[0] === w || norm(m.name).startsWith(w));
  return first.length === 1 ? first[0] : null;
}

const daysLabel = (iso: string) => {
  const t = todayAR();
  if (iso === t) return "hoy";
  const y = new Date(`${t}T12:00:00Z`);
  y.setUTCDate(y.getUTCDate() - 1);
  if (iso === y.toISOString().slice(0, 10)) return "ayer";
  return formatDate(iso, "short");
};

// ── Historial ────────────────────────────────────────────────────────

export async function history(userId: string, limit = 60) {
  const msgs = (await db().select().from(copilot_messages).where(eq(copilot_messages.user_id, userId)).orderBy(desc(copilot_messages.created_at)).limit(limit)).reverse();
  const ids = msgs.map((m) => m.id);
  const props = ids.length ? await db().select().from(copilot_proposals).where(and(eq(copilot_proposals.user_id, userId), inArray(copilot_proposals.message_id, ids))).orderBy(asc(copilot_proposals.created_at)) : [];
  return msgs.map((m) => ({ ...m, proposals: props.filter((p) => p.message_id === m.id) }));
}

export async function ownMessage(userId: string, id: string) {
  if (!UUID.test(id)) return null;
  const [m] = await db().select().from(copilot_messages).where(and(eq(copilot_messages.id, id), eq(copilot_messages.user_id, userId)));
  return m ?? null;
}

/** Origen de un registro hecho por el Vigía (solo del propio usuario) */
export async function originOf(userId: string, resultType: string, resultId: string) {
  if (!UUID.test(resultId)) return null;
  const [p] = await db()
    .select({ source: copilot_proposals.source_message_id, auto: copilot_proposals.auto, decidedAt: copilot_proposals.decided_at })
    .from(copilot_proposals)
    .where(and(eq(copilot_proposals.user_id, userId), eq(copilot_proposals.result_type, resultType), eq(copilot_proposals.result_id, resultId)))
    .orderBy(desc(copilot_proposals.created_at))
    .limit(1);
  if (!p?.source) return null;
  const m = await ownMessage(userId, p.source);
  if (!m) return null;
  return { id: m.id, kind: m.kind, text: m.text, transcript: m.transcript, model: m.model, createdAt: m.created_at, hasFile: !!m.attachment_path, fileName: m.attachment_name, auto: p.auto, decidedAt: p.decidedAt };
}

// ── Contexto para el modelo ──────────────────────────────────────────

async function contextFor(u: CopilotUser) {
  const [cats, groups] = await Promise.all([listCategories(u.id), listGroups(actorOf(u)).catch(() => [])]);
  const withMembers = [];
  for (const g of groups.slice(0, 12)) {
    const v = await getGroupView(actorOf(u), g.id).catch(() => null);
    if (v) withMembers.push({ id: g.id, name: g.name, members: v.members.filter((m) => m.active && m.id !== v.me.id).map((m) => m.name) });
  }
  const shared = await mySharedBoxes(u.id).catch(() => []);
  return { cats, groups: withMembers, shared };
}

function systemPrompt(u: CopilotUser, ctx: Awaited<ReturnType<typeof contextFor>>) {
  const today = todayAR();
  const weekday = formatDate(new Date(), "weekdayName");
  return `Sos el Vigía de Faro de ${u.name}: un asistente de finanzas personales en un chat tipo WhatsApp. Hoy es ${weekday} ${today} (Argentina).

Qué hacés:
- Convertís lo que la persona te cuenta (texto, audio transcripto, foto de ticket o factura, captura de transferencia o de Mercado Pago, PDF) en registros, llamando a las herramientas. Puede haber varios en un mensaje: "ayer 5000 de nafta y 3200 en el chino" son DOS crear_movimiento.
- Si dice que lo pagó con su pareja, para sus padres o abuelos, con su familia o con sus socios y tiene una caja compartida para eso → registrar_en_caja_compartida (la tarjeta le deja elegir solo registrar o dividir).
- Gasto personal → crear_movimiento. Si es del trabajo, de su actividad, de su emprendimiento o de una changa o freelance → crear_movimiento con caja "negocio" (cada caja es un mundo aparte). Si menciona personas o un grupo ("con Juan", "en el viaje", "dividido") → crear_gasto_en_grupo.
- Montos argentinos: "3.500" = 3500; "5 lucas" = 5000; "2k" = 2000. "ayer" = el día anterior a hoy.
- Categorías de la persona: ${ctx.cats.map((c) => c.name).join(", ")}. Elegí la que mejor encaje.
- Cajas compartidas de la persona: ${ctx.shared.length ? ctx.shared.map((b) => b.name).join(", ") : "todavía ninguna"}.
- Grupos de la persona: ${ctx.groups.length ? ctx.groups.map((g) => `${g.name} (con ${g.members.join(", ") || "nadie más"})`).join("; ") : "todavía ninguno"}.
- Consultas ("¿cuánto gasté en delivery este mes?", "¿cuánto le debo a Juan?"): usá consultar_bitacora o consultar_saldos_grupo y respondé corto, con el dato y un enlace markdown a la pantalla ([Ver en Bitácora](/bitacora) o el que te devuelva la herramienta).
- Si algo es ambiguo (falta el monto, no sabés en qué grupo), NO llames herramientas: preguntá UNA sola cosa, corta.
- Nunca inventes montos, personas ni grupos.
- "¿Qué hizo mi contador?", "¿tengo contador?": usá consultar_contador y respondé con el dato y el enlace.
- Coach (si la persona pide consejos, cómo ahorrar o en qué le conviene poner la plata): usá coach_finanzas, que te da sus números reales (sobres, fijos, fugas y metas). Explicá y sugerí hábitos. Podés comparar alternativas generales de ahorro (plazo fijo, fondos formatMoney market, dólar MEP) solo con fines educativos y sin recomendar una en particular. Nunca des una recomendación de inversión personalizada: es una actividad regulada por la CNV. Si la persona quiere asesoramiento, derivala a un asesor matriculado de la Red Contable ([Buscar un asesor](/red-contable?servicio=asesoramiento_financiero)).
- Respondé en español rioplatense (voseo), muy breve: una línea como "Listo, te dejé 2 gastos para confirmar." Las tarjetas muestran el detalle.

${SHIELD_PROMPT}
- Para sumar un contador: [Buscar un contador en la Red](/red-contable).`;
}

// ── Propuestas: armar la tarjeta ────────────────────────────────────

type Preview = { title: string; lines: string[]; needsConfirm: boolean; data: Record<string, unknown> };

const PURPOSE_HINTS: [RegExp, string][] = [
  [/pareja|novi[oa]|espos[oa]|marido|mujer/, "pareja"],
  [/abuel|padre|viej|mama|papa/, "padres"],
  [/familia|hij[oa]s|chicos/, "familia"],
  [/amig/, "amigos"],
  [/socio|negocio|emprendimiento/, "negocio"],
];

async function previewFor(u: CopilotUser, tool: ProposalTool, raw: unknown): Promise<Preview | { question: string }> {
  if (tool === "registrar_en_caja_compartida") {
    const i = PROPOSAL_TOOLS.registrar_en_caja_compartida.schema.parse(raw);
    const boxesList = await mySharedBoxes(u.id);
    if (!boxesList.length) return { question: "Todavía no tenés cajas compartidas. Armá una en [Mis cajas](/cajas/nueva) (pareja, familia, amigos, padres y abuelos o negocio) y lo cargo ahí." };
    const n = norm(i.caja);
    const purpose = PURPOSE_HINTS.find(([re]) => re.test(n))?.[1];
    const hits = boxesList.filter((b) => (purpose && b.purpose === purpose) || norm(b.name).includes(n));
    if (hits.length !== 1) return { question: `¿En qué caja lo cargo? Tenés: ${boxesList.map((b) => b.name).join(", ")}.` };
    const box = hits[0];
    const amount = Math.round(i.monto * 100);
    const date = i.fecha ?? todayAR();
    const members = await activeMembers(box.id);
    const others = members.filter((m) => m.id !== u.id);
    const half = members.length > 1 ? Math.floor(amount / members.length) : amount;
    return {
      title: `${box.name} · ${formatMoney(amount, "ARS", { decimals: "auto" })}`,
      lines: [`${i.descripcion} · pagaste vos · ${daysLabel(date)}`, others.length ? `Solo registrar: queda que pusiste ${formatMoney(amount, "ARS", { decimals: "auto" })}. Dividir: ${others.map((m) => m.name).join(", ")} ${others.length === 1 ? "te debe" : "te deben"} ${formatMoney(half, "ARS", { decimals: "auto" })}${others.length === 1 ? "" : " cada uno"}.` : "Todavía estás solo en la caja: invitá a los demás para dividir."],
      needsConfirm: true,
      data: { boxId: box.id, boxName: box.name, amount, date, description: i.descripcion, category: i.categoria ?? null },
    };
  }
  if (tool === "crear_movimiento") {
    const i = PROPOSAL_TOOLS.crear_movimiento.schema.parse(raw);
    const date = i.fecha ?? todayAR();
    const amount = Math.round(i.monto * 100);
    // Caja de negocio (principios §10): lo del trabajo o de una changa va separado de lo personal
    if (i.caja === "negocio") {
      const changa = /changa|freelance|trabajito/i.test(`${i.descripcion} ${i.nota ?? ""} ${i.categoria ?? ""}`);
      const category = i.tipo === "ingreso" ? (changa ? "changa" : "ventas") : businessCategoryFor(`${i.descripcion} ${i.categoria ?? ""}`);
      return {
        title: `Negocio · ${i.tipo === "ingreso" ? "Ingreso" : "Gasto"} ${formatMoney(amount, i.moneda, { decimals: "auto" })}`,
        lines: [[i.descripcion, boxCategoryName("negocio", null, category), daysLabel(date)].filter(Boolean).join(" · "), "Caja de negocio"],
        needsConfirm: false,
        data: { box: "negocio", kind: i.tipo, amount, currency: i.moneda, date, category, description: i.descripcion, note: i.nota ?? null },
      };
    }
    const cat = await categoryByHint(u.id, i.categoria, i.tipo);
    return {
      title: `${i.tipo === "ingreso" ? "Ingreso" : "Gasto"} ${formatMoney(amount, i.moneda, { decimals: "auto" })}`,
      lines: [[i.descripcion, cat?.name, daysLabel(date)].filter(Boolean).join(" · "), ...(i.medio_pago ? [i.medio_pago.replace("_", " ")] : [])],
      needsConfirm: false,
      data: { kind: i.tipo, amount, currency: i.moneda, date, categoryId: cat?.id ?? null, description: i.descripcion, paymentMethod: i.medio_pago ?? null, note: i.nota ?? null },
    };
  }
  if (tool === "crear_gasto_en_grupo") {
    const i = PROPOSAL_TOOLS.crear_gasto_en_grupo.schema.parse(raw);
    const actor = actorOf(u);
    const groups = await listGroups(actor);
    if (!groups.length) return { question: "Todavía no tenés grupos de gastos. ¿Querés que cree uno? Decime el nombre y con quién." };
    const names = [...(i.dividir_entre ?? []), ...(i.pagado_por && !ME.has(norm(i.pagado_por)) ? [i.pagado_por] : [])];
    let groupId: string | null = null;
    if (i.grupo) {
      const hit = groups.filter((g) => norm(g.name).includes(norm(i.grupo!)));
      if (hit.length === 1) groupId = hit[0].id;
      else return { question: `¿En qué grupo lo cargo? Tenés: ${groups.map((g) => g.name).join(", ")}.` };
    } else if (groups.length === 1) groupId = groups[0].id;
    else {
      const fits = [];
      for (const g of groups) {
        const v = await getGroupView(actor, g.id);
        if (names.length && names.every((n) => findMember(v.members.filter((m) => m.active), n, v.me.id))) fits.push(g);
      }
      if (fits.length === 1) groupId = fits[0].id;
      else return { question: `¿En qué grupo lo cargo? Tenés: ${groups.map((g) => g.name).join(", ")}.` };
    }
    const v = await getGroupView(actor, groupId!);
    const active = v.members.filter((m) => m.active);
    const need = (n: string) => findMember(active, n, v.me.id);
    const payer = need(i.pagado_por);
    if (!payer) return { question: `¿Quién pagó? En ${v.group.name} están: ${active.map((m) => m.name).join(", ")}.` };
    const missing = (i.dividir_entre ?? []).filter((n) => !need(n));
    if (missing.length) return { question: `No encontré a ${missing.join(" ni a ")} en ${v.group.name}. ¿Lo sumo al grupo o lo divido entre ${active.map((m) => m.name).join(", ")}?` };
    let people = i.dividir_entre?.length ? i.dividir_entre.map((n) => need(n)!.id) : active.map((m) => m.id);
    if (i.dividir_entre?.length && i.incluirme) people = [...new Set([v.me.id, ...people])];
    const total = Math.round(i.monto * 100);
    const vals = (f: (x: number) => number) => Object.fromEntries(Object.entries(i.valores ?? {}).map(([k, x]) => [need(k)?.id ?? k, f(x)]));
    const split = i.metodo === "porcentaje" ? { method: "porcentaje" as const, percents: vals((x) => x) } : i.metodo === "montos" ? { method: "montos" as const, amounts: vals((x) => Math.round(x * 100)) } : { method: "iguales" as const, members: people };
    let shares: Record<string, number>;
    try {
      shares = splitExpense(total, split);
    } catch (e) {
      if (e instanceof SplitError) return { question: `${e.message} ¿Cómo lo divido?` };
      throw e;
    }
    const nameOf = (id: string) => active.find((m) => m.id === id)?.name ?? "—";
    const date = i.fecha ?? todayAR();
    const category = i.categoria && i.categoria in CATEGORIES ? i.categoria : "otros";
    return {
      title: `Gasto en ${v.group.name} · ${formatMoney(total, i.moneda)}`,
      lines: [`${i.descripcion} · pagó ${payer.id === v.me.id ? "vos" : payer.name} · ${daysLabel(date)}`, Object.entries(shares).map(([id, c]) => `${id === v.me.id ? "Vos" : nameOf(id)} ${formatMoney(c, i.moneda)}`).join(" · ")],
      needsConfirm: true,
      data: { groupId: v.group.id, groupName: v.group.name, description: i.descripcion, amount: total, currency: i.moneda, date, category, payers: { [payer.id]: total }, split, shares },
    };
  }
  if (tool === "crear_grupo") {
    const i = PROPOSAL_TOOLS.crear_grupo.schema.parse(raw);
    return { title: `Grupo nuevo: ${i.nombre}`, lines: [i.integrantes.length ? `Con ${i.integrantes.join(", ")}` : "Solo vos por ahora"], needsConfirm: true, data: { name: i.nombre, type: i.tipo, members: i.integrantes } };
  }
  const i = PROPOSAL_TOOLS.recordar.schema.parse(raw);
  const due = new Date(/[zZ]|[+-]\d\d:\d\d$/.test(i.cuando) ? i.cuando : `${i.cuando}${i.cuando.length <= 10 ? "T09:00" : ""}-03:00`);
  if (Number.isNaN(due.getTime())) return { question: "¿Para cuándo te lo recuerdo?" };
  return {
    title: "Recordatorio",
    lines: [i.texto, formatDate(due, "dateTime")],
    needsConfirm: false,
    data: { text: i.texto, due: due.toISOString() },
  };
}

// ── Aplicar, deshacer y editar ───────────────────────────────────────

async function ownProposal(userId: string, id: string) {
  if (!UUID.test(id)) throw new CopilotError("Tarjeta inválida.");
  const [p] = await db().select().from(copilot_proposals).where(and(eq(copilot_proposals.id, id), eq(copilot_proposals.user_id, userId)));
  if (!p) throw new CopilotError("Esa tarjeta no es tuya.");
  return p;
}

const wrapErr = async <T>(fn: () => Promise<T>) => {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof GastosError || e instanceof SplitError || e instanceof BitacoraError || e instanceof CajaError) throw new CopilotError(e.message);
    throw e;
  }
};

async function apply(u: CopilotUser, p: typeof copilot_proposals.$inferSelect, opts?: { final?: "registrar" | "dividir" }) {
  const d = p.preview.data as Record<string, never>;
  return wrapErr(async () => {
    if (p.tool === "registrar_en_caja_compartida") {
      const e = await addSharedEntry(u, d.boxId, { kind: "gasto", amount: d.amount, date: d.date, description: d.description, category: d.category ?? undefined, mode: opts?.final === "dividir" ? "dividir" : "registrar", alsoPersonal: true, source: "vigia", copilotMessageId: p.source_message_id });
      return { type: "movimiento_compartido", id: e.id };
    }
    if (p.tool === "crear_movimiento" && d.box === "negocio") {
      const box = await openBusinessBox(u);
      const e = await addBusinessEntry(u, box.id, { kind: d.kind, amount: d.amount, currency: d.currency, date: d.date, category: d.category, description: d.description, note: d.note, source: "vigia", copilotMessageId: p.source_message_id });
      return { type: "movimiento_caja", id: e.id };
    }
    if (p.tool === "crear_movimiento") {
      const e = await createEntry(u.id, { ...(d as object), source: "copiloto", copilotMessageId: p.source_message_id } as never);
      return { type: "movimiento", id: e.id };
    }
    if (p.tool === "crear_gasto_en_grupo") {
      const e = await createExpense(actorOf(u), d.groupId, { description: d.description, amount: d.amount, currency: d.currency, date: d.date, category: d.category, payers: d.payers, split: d.split }, { origin: "asistente" });
      return { type: "gasto_grupo", id: (e as { id: string }).id };
    }
    if (p.tool === "crear_grupo") {
      const g = await createGroup(actorOf(u), { name: d.name, type: d.type, baseCurrency: "ARS" });
      for (const name of (d.members as unknown as string[]) ?? []) await inviteMember(actorOf(u), g.id, { name }).catch(() => undefined);
      return { type: "grupo", id: g.id };
    }
    const [r] = await db().insert(copilot_reminders).values({ user_id: u.id, text: d.text, due_at: new Date(d.due), source_message_id: p.source_message_id }).returning({ id: copilot_reminders.id });
    return { type: "recordatorio", id: r.id };
  });
}

export async function confirmProposal(u: CopilotUser, id: string, opts?: { final?: "registrar" | "dividir" }) {
  const p = await ownProposal(u.id, id);
  if (p.status !== "propuesta") throw new CopilotError("Esa tarjeta ya se resolvió.");
  if (p.tool === "registrar_en_caja_compartida" && !opts?.final) throw new CopilotError("Elegí si solo lo registrás o si lo dividís.");
  const r = await apply(u, p, opts);
  await db().update(copilot_proposals).set({ status: "confirmada", result_type: r.type, result_id: r.id, decided_at: new Date() }).where(eq(copilot_proposals.id, p.id));
  await audit({ studioId: u.studioId, actor: { id: u.id, email: u.email }, action: "copiloto.confirmar", entityType: r.type, entityId: r.id, metadata: { herramienta: p.tool, ...(opts?.final ? { final: opts.final } : {}) } });
  return r;
}

export async function undoProposal(u: CopilotUser, id: string) {
  const p = await ownProposal(u.id, id);
  if (p.status === "propuesta") {
    await db().update(copilot_proposals).set({ status: "descartada", decided_at: new Date() }).where(eq(copilot_proposals.id, p.id));
    return;
  }
  if (p.status !== "confirmada" || !p.result_id) throw new CopilotError("No hay nada para deshacer.");
  await wrapErr(async () => {
    const d = p.preview.data as Record<string, string>;
    if (p.result_type === "movimiento") await deleteEntry(u.id, p.result_id!);
    else if (p.result_type === "movimiento_compartido") await deleteSharedEntry(u, d.boxId, p.result_id!);
    else if (p.result_type === "movimiento_caja") {
      const [be] = await db().select({ boxId: box_entries.box_id }).from(box_entries).where(eq(box_entries.id, p.result_id!));
      if (be) await deleteBoxEntry(u, be.boxId, p.result_id!);
    }
    else if (p.result_type === "gasto_grupo") await deleteExpense(actorOf(u), d.groupId, p.result_id!);
    else if (p.result_type === "grupo") await archiveGroup(actorOf(u), p.result_id!);
    else await db().delete(copilot_reminders).where(and(eq(copilot_reminders.id, p.result_id!), eq(copilot_reminders.user_id, u.id)));
  });
  await db().update(copilot_proposals).set({ status: "deshecha", decided_at: new Date() }).where(eq(copilot_proposals.id, p.id));
  await audit({ studioId: u.studioId, actor: { id: u.id, email: u.email }, action: "copiloto.deshacer", entityType: p.result_type ?? undefined, entityId: p.result_id, metadata: { herramienta: p.tool } });
}

/** Rehace lo deshecho (por si fue sin querer) */
export async function redoProposal(u: CopilotUser, id: string) {
  const p = await ownProposal(u.id, id);
  if (p.status !== "deshecha" || p.result_type !== "movimiento" || !p.result_id) throw new CopilotError("No se puede rehacer.");
  await wrapErr(() => restoreEntry(u.id, p.result_id!));
  await db().update(copilot_proposals).set({ status: "confirmada", decided_at: new Date() }).where(eq(copilot_proposals.id, p.id));
}

/** Editar un movimiento propuesto (o ya registrado) con el formulario rápido */
export async function editMovementProposal(u: CopilotUser, id: string, data: { kind: "gasto" | "ingreso"; amount: number; currency: string; date: string; categoryId: string | null; description: string; paymentMethod: string | null; note: string | null }) {
  const p = await ownProposal(u.id, id);
  if (p.tool !== "crear_movimiento") throw new CopilotError("Solo los movimientos se editan acá; los gastos de grupo, desde el grupo.");
  if ((p.preview.data as { box?: string }).box) throw new CopilotError("Los movimientos de una caja se editan desde Mis cajas.");
  const cats = await listCategories(u.id);
  const cat = cats.find((c) => c.id === data.categoryId);
  const preview = { ...p.preview, title: `${data.kind === "ingreso" ? "Ingreso" : "Gasto"} ${formatMoney(data.amount, data.currency, { decimals: "auto" })}`, lines: [[data.description, cat?.name, daysLabel(data.date)].filter(Boolean).join(" · ")], data: { ...data } };
  if (p.status === "confirmada" && p.result_id) await wrapErr(() => updateEntry(u.id, p.result_id!, data));
  await db().update(copilot_proposals).set({ preview }).where(eq(copilot_proposals.id, p.id));
  if (p.status === "propuesta") return confirmProposal(u, id);
}

/** Editar un gasto de grupo antes de confirmarlo: descripción, monto y fecha (el reparto se recalcula en proporción) */
export async function editGroupProposal(u: CopilotUser, id: string, data: { description: string; amount: number; date: string }) {
  const p = await ownProposal(u.id, id);
  if (p.tool !== "crear_gasto_en_grupo" || p.status !== "propuesta") throw new CopilotError("Ese gasto ya se resolvió: editalo desde el grupo.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date) || data.description.trim().length < 1) throw new CopilotError("Revisá la descripción y la fecha.");
  const d = p.preview.data as { groupId: string; groupName: string; currency: string; shares: Record<string, number>; amount: number; payers: Record<string, number>; split: Record<string, unknown> };
  const v = await wrapErr(() => getGroupView(actorOf(u), d.groupId));
  const weights = Object.fromEntries(Object.entries(d.shares).map(([k, c]) => [k, c]));
  const shares = await wrapErr(async () => splitExpense(data.amount, { method: "partes", parts: weights }));
  const payer = Object.keys(d.payers)[0];
  const name = (mid: string) => (mid === v.me.id ? "Vos" : (v.members.find((m) => m.id === mid)?.name ?? "—"));
  const preview = {
    ...p.preview,
    title: `Gasto en ${d.groupName} · ${formatMoney(data.amount, d.currency)}`,
    lines: [`${data.description} · pagó ${payer === v.me.id ? "vos" : name(payer)} · ${daysLabel(data.date)}`, Object.entries(shares).map(([mid, c]) => `${name(mid)} ${formatMoney(c, d.currency)}`).join(" · ")],
    data: { ...d, description: data.description.trim().slice(0, 140), amount: data.amount, date: data.date, payers: { [payer]: data.amount }, split: { method: "montos", amounts: shares }, shares },
  };
  await db().update(copilot_proposals).set({ preview }).where(eq(copilot_proposals.id, p.id));
}

// ── Consultas (se ejecutan) ──────────────────────────────────────────

function queryTools(u: CopilotUser): ToolSet {
  return {
    consultar_contador: tool({
      description: "En qué modo está la persona (autogestión o gestión profesional con un estudio), el estado de su conexión con un contador, lo último que hizo su contador y lo que tiene para aprobar.",
      inputSchema: jsonSchema({ type: "object", properties: {} } as never),
      execute: async () => {
        const { responsibilityMode, actionsFor, STATUS_LABEL } = await import("@/modules/conexiones/server");
        const { mode, connection: c } = await responsibilityMode(u.id);
        if (!c) return { modo: "autogestión", mensaje: "No tiene un contador conectado. Faro no da fe de nada: para eso hace falta un contador matriculado.", enlace: "/contador" };
        const acts = ["activa", "en_cierre", "en_disputa"].includes(c.status) ? await actionsFor(u.id, c.id) : [];
        return { modo: mode === "profesional" ? "gestión profesional" : "autogestión", estudio: c.studioName, estado: STATUS_LABEL[c.status], ultimas_acciones: acts.slice(0, 8).map((a) => ({ que: a.summary, quien: a.actor_name, cuando: a.created_at.toISOString().slice(0, 10), estado: a.status })), para_aprobar: acts.filter((a) => a.status === "propuesta").length, enlace: "/contador" };
      },
    }),
    consultar_bitacora: tool({
      description: "Cuánto gastó o ingresó la persona en un mes (y opcionalmente en una categoría), con sus datos reales de Bitácora.",
      inputSchema: jsonSchema(z.toJSONSchema(consultarBitacora) as never),
      execute: async (raw: unknown) => {
        const i = consultarBitacora.parse(raw ?? {});
        const r = await spentInCategory(u.id, i.mes ?? monthOf(), i.categoria);
        return { mes: i.mes ?? monthOf(), categoria: r.category ?? "todas", gastado: formatMoney(r.spent, "ARS", { decimals: "auto" }), ingresado: formatMoney(r.earned, "ARS", { decimals: "auto" }), movimientos: r.count, enlace: `/bitacora?mes=${i.mes ?? monthOf()}` };
      },
    }),
    coach_finanzas: tool({
      description: "Datos reales de la persona para aconsejar hábitos de ahorro: sobres del mes (presupuesto vs. gastado), gastos fijos y suscripciones, fugas detectadas y metas. También trae información general (educativa) sobre alternativas de ahorro.",
      inputSchema: jsonSchema({ type: "object", properties: { tema: { type: "string", description: "Sobre qué quiere consejo (opcional)" } } } as never),
      execute: async () => {
        const { bitacoraPlan } = await import("@/modules/bitacora/plus");
        if (!(await bitacoraPlan(u)).plus) return { plan: "gratis", mensaje: "El coach es de Bitácora Plus. Mientras tanto, podés mirar tus sobres y tus fijos en la Bitácora.", enlace: "/bitacora/presupuesto" };
        const { budgetView, listGoals } = await import("@/modules/bitacora/planning");
        const { listRecurring, listInsights } = await import("@/modules/bitacora/recurring");
        const [b, rec, ins, goals] = await Promise.all([budgetView(u.id), listRecurring(u.id), listInsights(u.id, 6), listGoals(u.id)]);
        return {
          sobres: b.list.filter((x) => x.budget).map((x) => ({ categoria: x.name, presupuesto: formatMoney(x.budget!, "ARS", { decimals: "auto" }), gastado: formatMoney(x.spent, "ARS", { decimals: "auto" }) })),
          fijos_y_suscripciones: rec.slice(0, 10).map((r) => ({ nombre: r.label, mensual: formatMoney(r.last_amount, "ARS", { decimals: "auto" }), aumento: r.price_change_pct ? `${r.price_change_pct}%` : null })),
          avisos: ins.map((i) => i.title),
          metas: goals.map((g) => ({ meta: g.name, avance: `${Math.round(g.progress * 100)}%`, ahorro_semanal_sugerido: formatMoney(g.weekly, "ARS", { decimals: "auto" }) })),
          alternativas_educativas: [
            "Plazo fijo: tasa fija por un plazo; la plata queda inmovilizada hasta el vencimiento.",
            "Fondos comunes formatMoney market: rescate en el día, rinden una tasa variable; no están garantizados.",
            "Dólar MEP: se compra con bonos en un broker o en el home banking; protege del tipo de cambio, no de la inflación en dólares.",
          ],
          aviso_legal: "Información general con fines educativos. No es una recomendación de inversión personalizada (actividad regulada por la CNV).",
          asesor: "/red-contable?servicio=asesoramiento_financiero",
          enlaces: { sobres: "/bitacora/presupuesto", fijos: "/bitacora/fijos", metas: "/bitacora/metas" },
        };
      },
    }),
    consultar_saldos_grupo: tool({
      description: "Cuánto le debe la persona a alguien (o le deben) en sus grupos de gastos, con los saldos reales.",
      inputSchema: jsonSchema(z.toJSONSchema(consultarSaldos) as never),
      execute: async (raw: unknown) => {
        const i = consultarSaldos.parse(raw ?? {});
        const actor = actorOf(u);
        const groups = (await listGroups(actor)).filter((g) => !i.grupo || norm(g.name).includes(norm(i.grupo)));
        const out = [];
        for (const g of groups.slice(0, 10)) {
          const v = await getGroupView(actor, g.id);
          const other = i.persona ? findMember(v.members, i.persona, v.me.id) : null;
          if (i.persona && !other) continue;
          const name = (id: string) => (id === v.me.id ? "vos" : (v.members.find((m) => m.id === id)?.name ?? "—"));
          const lines = Object.entries(v.transfers).flatMap(([cur, ts]) => ts.filter((t) => (t.from === v.me.id || t.to === v.me.id) && (!other || t.from === other.id || t.to === other.id)).map((t) => `${name(t.from)} le paga ${formatMoney(t.amount, cur)} a ${name(t.to)}`));
          out.push({ grupo: g.name, para_quedar_a_mano: lines.length ? lines : ["están a mano"], enlace: `/grupos/g/${g.id}` });
        }
        return out.length ? out : { resultado: i.persona ? `No encontré a ${i.persona} en tus grupos.` : "No tenés grupos de gastos." };
      },
    }),
  };
}

function proposalTools(): ToolSet {
  // Sin execute: el modelo las llama y el servidor las convierte en tarjetas
  return Object.fromEntries(Object.entries(PROPOSAL_TOOLS).map(([name, t]) => [name, tool({ description: t.description, inputSchema: jsonSchema(z.toJSONSchema(t.schema) as never) })]));
}

// ── Procesar un mensaje ──────────────────────────────────────────────

const TRANSIENT = (e: unknown) => {
  const x = e as { statusCode?: number; status?: number; message?: string; cause?: unknown; lastError?: unknown };
  const code = x.statusCode ?? x.status ?? (x.lastError as { statusCode?: number } | undefined)?.statusCode;
  return code === 429 || code === 503 || code === 500 || code === 502 || /quota|rate limit|resource.?exhausted|overloaded/i.test(String(x.message ?? ""));
};
const FREE_TIER_HINT = (e: unknown) => /free.?tier|FreeTier/i.test(String((e as { message?: string }).message ?? "") + JSON.stringify((e as { responseBody?: unknown }).responseBody ?? ""));

/** Reintento con espera exponencial (hasta 3 veces) ante 429 o cuota; después, a la cola */
async function withRetry<T>(fn: (attempt: number) => Promise<T>, waits = [1000, 3000, 9000]) {
  let last: unknown;
  for (let a = 0; a <= waits.length; a++) {
    try {
      return await fn(a);
    } catch (e) {
      last = e;
      if (!TRANSIENT(e) || a === waits.length) throw e;
      await new Promise((r) => setTimeout(r, waits[a]));
    }
  }
  throw last;
}

interface ProcessResult {
  status: "ok" | "pendiente" | "error" | "limite" | "sin_ia";
  replyId?: string;
}

async function reply(userId: string, replyTo: string, text: string, extra: Partial<typeof copilot_messages.$inferInsert> = {}) {
  const [m] = await db()
    .insert(copilot_messages)
    .values({ user_id: userId, role: "copiloto", text, reply_to: replyTo, status: "ok", ...extra })
    .returning({ id: copilot_messages.id });
  return m.id;
}

async function loadUser(userId: string): Promise<CopilotUser | null> {
  const [r] = await db().select({ id: users.id, name: users.name, email: users.email, studioId: users.studioId, role: users.role, active: users.active }).from(users).where(eq(users.id, userId));
  return r && r.active && r.studioId ? { id: r.id, name: r.name, email: r.email, studioId: r.studioId, role: r.role } : null;
}

/**
 * Procesa un mensaje del usuario: transcribe el audio, llama al modelo con
 * las herramientas y crea las tarjetas. Se usa al enviarlo y desde la cola.
 * Nunca pierde el mensaje: ante un error de cuota queda "pendiente".
 */
type Prepared = { prepared: { tool: ProposalTool; input: unknown; preview: Preview }[]; questions: string[] };

async function prepare(u: CopilotUser, calls: { toolName: string; input: unknown }[]): Promise<Prepared> {
  const prepared: Prepared["prepared"] = [];
  const questions: string[] = [];
  for (const c of calls.slice(0, 10)) {
    if (!isProposalTool(c.toolName)) continue;
    try {
      const pv = await previewFor(u, c.toolName, c.input);
      if ("question" in pv) questions.push(pv.question);
      else prepared.push({ tool: c.toolName, input: c.input, preview: pv });
    } catch {
      questions.push("No entendí bien un dato. ¿Me lo repetís con el monto?");
    }
  }
  return { prepared, questions };
}

async function saveProposals(u: CopilotUser, sourceId: string, replyId: string, { prepared }: Prepared) {
  const auto = (await getPrefs(u.id)).copilotAuto === true;
  for (const x of prepared) {
    const [row] = await db()
      .insert(copilot_proposals)
      .values({ user_id: u.id, message_id: replyId, source_message_id: sourceId, tool: x.tool, input: x.input as Record<string, unknown>, preview: x.preview as unknown as Record<string, unknown> })
      .returning();
    // Movimientos personales y recordatorios: se registran solos si la persona lo eligió (siempre con Deshacer)
    if (auto && !x.preview.needsConfirm) {
      const r = await apply(u, row).catch(() => null);
      if (r) await db().update(copilot_proposals).set({ status: "confirmada", auto: true, result_type: r.type, result_id: r.id, decided_at: new Date() }).where(eq(copilot_proposals.id, row.id));
    }
  }
}

/**
 * Escudo de responsabilidad (principios §1.a, §1.b y §1.c), antes del modelo:
 * si el mensaje toca una tarea que requiere un matriculado, el Vigía no la
 * acompaña (respuesta fija con la derivación); si pide criterio profesional
 * ("¿estoy bien con ARCA?"), el modelo responde con datos y se agrega el pie
 * del escudo. En los dos casos queda la sugerencia de sumar un contador.
 */
async function shieldFor(u: CopilotUser, m: typeof copilot_messages.$inferSelect, text: string, opts: { fromQueue?: boolean }): Promise<{ replyId: string } | { footnote: string } | null> {
  if (!text.trim()) return null;
  const task = await professionalTaskIn(text);
  if (task) {
    const sg = await suggest(u.id, "vigia_criterio", `Le preguntaste al Vigía por ${task.title.toLowerCase()}, que requiere un profesional matriculado.`, { tarea: task.key, mensaje: text.slice(0, 280) });
    await db().update(copilot_messages).set({ status: "ok", processed_at: new Date(), model: "escudo" }).where(eq(copilot_messages.id, m.id));
    await audit({ studioId: u.studioId, actor: u, action: "escudo.tarea_matriculado", entityType: "mensaje_vigia", entityId: m.id, metadata: { tarea: task.key } });
    return { replyId: await reply(u.id, m.id, professionalReply(task, sg ? `/red-contable?derivacion=${sg.id}` : "/red-contable"), { model: "escudo", unseen: !!opts.fromQueue }) };
  }
  if (asksForCriteria(text)) {
    const sg = await suggest(u.id, "vigia_criterio", "Le preguntaste al Vigía algo que necesita el criterio de un profesional.", { mensaje: text.slice(0, 280) });
    return { footnote: criteriaFootnote(sg ? `/red-contable?derivacion=${sg.id}` : "/red-contable") };
  }
  return null;
}

export async function processMessage(messageId: string, opts: { fromQueue?: boolean } = {}): Promise<ProcessResult> {
  const [m] = await db().select().from(copilot_messages).where(eq(copilot_messages.id, messageId));
  if (!m || m.role !== "usuario" || m.status === "ok") return { status: "ok" };
  const u = await loadUser(m.user_id);
  if (!u) return { status: "error" };
  let shield = await shieldFor(u, m, [m.text, m.transcript].filter(Boolean).join("\n"), opts);
  if (shield && "replyId" in shield) return { status: "ok", replyId: shield.replyId };
  const p = await getPlatformAi();
  if (!isConfigured(p)) {
    await db().update(copilot_messages).set({ status: "ok", processed_at: new Date(), model: "basico" }).where(eq(copilot_messages.id, m.id));
    // Modo básico: solo texto con frases simples (monto + en qué), sin IA
    const found = m.kind === "texto" && m.text ? parseBasic(m.text, todayAR()) : [];
    if (shield && "footnote" in shield) {
      const replyId = await reply(u.id, m.id, `No puedo decirte si tu situación está bien: Faro muestra datos según lo que cargaste ([Facturación](/facturacion) y [Bitácora](/bitacora)), no hace una revisión profesional.${shield.footnote}`);
      return { status: "sin_ia", replyId };
    }
    if (!found.length) {
      const replyId = await reply(u.id, m.id, m.kind === "texto" ? "La IA de Faro todavía no está configurada, así que por ahora entiendo frases simples como «5000 nafta y 3200 en el chino». Para lo demás, cargalo a mano en [Bitácora](/bitacora?cargar=1)." : "La IA de Faro todavía no está configurada: por ahora solo leo texto simple (monto y en qué). Cargá este gasto a mano en [Bitácora](/bitacora?cargar=1).");
      return { status: "sin_ia", replyId };
    }
    const replyId = await reply(u.id, m.id, `La IA todavía no está configurada; con el modo básico entendí ${found.length === 1 ? "esto" : `estos ${found.length} movimientos`}. Revisalo antes de confirmar:`, { model: "basico" });
    await saveProposals(u, m.id, replyId, await prepare(u, found.map((input) => ({ toolName: "crear_movimiento", input }))));
    return { status: "sin_ia", replyId };
  }
  const quota: Quota = await checkQuota(u, m.kind, p);
  if (!quota.ok) {
    await db().update(copilot_messages).set({ status: "ok", processed_at: new Date() }).where(eq(copilot_messages.id, m.id));
    const replyId = await reply(u.id, m.id, `${quota.message} Mientras tanto, podés cargarlo a mano en [Bitácora](/bitacora?cargar=1).`);
    return { status: "limite", replyId };
  }
  await db().update(copilot_messages).set({ status: "procesando", attempts: sql`${copilot_messages.attempts} + 1` }).where(eq(copilot_messages.id, m.id));
  let tokensIn = 0;
  let tokensOut = 0;
  let usedModel = p.model_primary;
  try {
    // 1. Audio: transcripción (queda guardada como origen)
    let userText = m.text ?? "";
    if (m.kind === "audio" && m.attachment_path && !m.transcript) {
      const audio = await readCopilotFile(m.attachment_path);
      const t = await withRetry((a) => transcribeAudio(p, a >= 2 && p.model_fallback ? p.model_fallback : p.model_primary, audio, m.attachment_mime ?? "audio/webm"));
      tokensIn += t.tokensIn;
      tokensOut += t.tokensOut;
      await db().update(copilot_messages).set({ transcript: t.text }).where(eq(copilot_messages.id, m.id));
      userText = [userText, t.text].filter(Boolean).join("\n");
      // El escudo también mira lo que se dijo en el audio
      const heard = await shieldFor(u, m, t.text, opts);
      if (heard && "replyId" in heard) return { status: "ok", replyId: heard.replyId };
      if (heard) shield = heard;
    } else if (m.transcript) userText = [userText, m.transcript].filter(Boolean).join("\n");

    // 2. Historial reciente (texto) y el mensaje actual (con imagen o PDF si hay)
    const prior = (await db().select().from(copilot_messages).where(and(eq(copilot_messages.user_id, u.id), lt(copilot_messages.created_at, m.created_at))).orderBy(desc(copilot_messages.created_at)).limit(12)).reverse();
    const messages: ModelMessage[] = prior
      .filter((x) => (x.text || x.transcript) && x.status !== "pendiente")
      .map((x) => (x.role === "usuario" ? { role: "user" as const, content: [x.text, x.transcript].filter(Boolean).join("\n") } : { role: "assistant" as const, content: x.text ?? "" }));
    const content: Exclude<ModelMessage, { role: "system" | "tool" | "assistant" }>["content"] = [];
    if (userText) (content as unknown[]).push({ type: "text", text: userText });
    if ((m.kind === "imagen" || m.kind === "pdf") && m.attachment_path) {
      const data = await readCopilotFile(m.attachment_path);
      if (m.kind === "imagen") (content as unknown[]).push({ type: "image", image: data, mediaType: m.attachment_mime ?? "image/jpeg" });
      else (content as unknown[]).push({ type: "file", data, mediaType: "application/pdf", filename: m.attachment_name ?? "archivo.pdf" });
      if (!userText) (content as unknown[]).unshift({ type: "text", text: "Interpretá este archivo (ticket, factura, transferencia o resumen) y registrá lo que corresponda." });
    }
    messages.push({ role: "user", content });

    const ctx = await contextFor(u);
    const result = await withRetry((a) => {
      usedModel = a >= 2 && p.model_fallback ? p.model_fallback : p.model_primary;
      return generateText({ model: platformModel(p, usedModel), system: systemPrompt(u, ctx), messages, tools: { ...queryTools(u), ...proposalTools() }, stopWhen: stepCountIs(4), maxRetries: 0 });
    });
    tokensIn += result.totalUsage.inputTokens ?? 0;
    tokensOut += result.totalUsage.outputTokens ?? 0;

    // 3. Tarjetas a partir de las tool calls de registro
    const calls = result.steps.flatMap((s) => s.toolCalls).filter((c) => isProposalTool(c.toolName));
    const { prepared, questions } = await prepare(u, calls);
    const base = questions.length ? questions[0] : result.text.trim() || (prepared.length ? (prepared.length === 1 ? "Te dejé esto para confirmar:" : `Te dejé ${prepared.length} registros para confirmar:`) : "No encontré nada para registrar. ¿Me contás qué gastaste o qué querés saber?");
    const text = shield && "footnote" in shield ? `${base}${shield.footnote}` : base;
    const cost = costUsd(p, tokensIn, tokensOut);
    await db()
      .update(copilot_messages)
      .set({ status: "ok", processed_at: new Date(), model: usedModel, tokens_in: tokensIn, tokens_out: tokensOut, cost_usd: cost.toFixed(6), error: null })
      .where(eq(copilot_messages.id, m.id));
    const replyId = await reply(u.id, m.id, text, { model: usedModel, unseen: !!opts.fromQueue });
    if (!questions.length) await saveProposals(u, m.id, replyId, { prepared, questions });
    return { status: "ok", replyId };
  } catch (e) {
    const cost = costUsd(p, tokensIn, tokensOut);
    if (FREE_TIER_HINT(e) && !p.free_tier) await recordAlert("free_tier", "El proveedor respondió con un error del plan gratis: la clave cargada es del plan gratis (no apta para datos reales de usuarios).").catch(() => undefined);
    if (TRANSIENT(e)) {
      await db().update(copilot_messages).set({ status: "pendiente", error: "cuota", tokens_in: tokensIn, tokens_out: tokensOut, cost_usd: cost.toFixed(6) }).where(eq(copilot_messages.id, m.id));
      return { status: "pendiente" };
    }
    console.error("[copiloto]", (e as Error).message);
    await db().update(copilot_messages).set({ status: "error", error: String((e as Error).message ?? e).slice(0, 300), processed_at: new Date() }).where(eq(copilot_messages.id, m.id));
    const replyId = await reply(u.id, m.id, "No pude procesar este mensaje. Probá de nuevo en un rato o cargalo a mano en [Bitácora](/bitacora?cargar=1).", { unseen: !!opts.fromQueue });
    return { status: "error", replyId };
  }
}

/** Cola: procesa los mensajes pendientes (cuando vuelve la cuota) y avisa en el chat */
export async function processQueue(max = 20) {
  const pending = await db()
    .select({ id: copilot_messages.id, user: copilot_messages.user_id })
    .from(copilot_messages)
    .where(and(eq(copilot_messages.status, "pendiente"), lt(copilot_messages.attempts, 12)))
    .orderBy(asc(copilot_messages.created_at))
    .limit(max);
  let done = 0;
  for (const m of pending) {
    const r = await processMessage(m.id, { fromQueue: true });
    if (r.status === "pendiente") break; // sigue sin cuota: probamos en la próxima vuelta
    done++;
  }
  return { pending: pending.length, done };
}

/** Recordatorios vencidos → mensaje del Vigía en el chat */
export async function deliverReminders(now = new Date()) {
  const due = await db()
    .select()
    .from(copilot_reminders)
    .where(and(sql`${copilot_reminders.sent_at} is null`, gte(sql`${now.toISOString()}::timestamptz`, copilot_reminders.due_at)))
    .limit(100);
  for (const r of due) {
    await db().insert(copilot_messages).values({ user_id: r.user_id, role: "copiloto", text: `Te recuerdo: ${r.text}`, status: "ok", unseen: true });
    await db().update(copilot_reminders).set({ sent_at: now }).where(eq(copilot_reminders.id, r.id));
  }
  return due.length;
}

export async function unseenCount(userId: string) {
  const [r] = await db().select({ n: sql<number>`count(*)::int` }).from(copilot_messages).where(and(eq(copilot_messages.user_id, userId), eq(copilot_messages.unseen, true)));
  return r?.n ?? 0;
}

export async function markSeen(userId: string) {
  await db().update(copilot_messages).set({ unseen: false }).where(and(eq(copilot_messages.user_id, userId), eq(copilot_messages.unseen, true)));
}

export async function welcomeIfEmpty(u: { id: string; name: string }) {
  const [any] = await db().select({ id: copilot_messages.id }).from(copilot_messages).where(eq(copilot_messages.user_id, u.id)).limit(1);
  if (any) return;
  const first = u.name.split(" ")[0];
  await db()
    .insert(copilot_messages)
    .values({
      user_id: u.id,
      role: "copiloto",
      status: "ok",
      text: `¡Hola, ${first}! Soy tu Vigía. Contame tus gastos como se los contarías a alguien y yo los anoto:\n\n- **Texto:** «ayer 5000 de nafta y 3200 en el chino»\n- **Audio:** mantené apretado el micrófono y hablá.\n- **Foto:** un ticket, una factura o la captura de una transferencia o de Mercado Pago.\n- **Grupos:** «pagué 48.000 de la cena con Juan y Ana».\n- **Preguntas:** «¿cuánto gasté en delivery este mes?» o «¿cuánto le debo a Juan?».\n\nCada cosa te la muestro en una tarjeta para que la confirmes, la edites o la deshagas.`,
    });
}

