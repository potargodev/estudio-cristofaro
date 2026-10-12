// Datos de demostración: lo que une a las personas entre sí y con los
// estudios. Cajas compartidas, grupos de gastos, conexiones con un contador
// en todos los estados, Red Contable de doble mano, Flotas y mensajes.

import type { Db } from "@/db";
import {
  account_connections,
  box_entries,
  box_entry_shares,
  box_goals,
  box_members,
  boxes,
  chat_messages,
  connection_actions,
  connection_messages,
  connection_ratings,
  conversation_members,
  conversations,
  expense_groups,
  expense_payers,
  expense_shares,
  expenses,
  fleet_events,
  fleet_members,
  fleet_proposals,
  fleet_votes,
  fleets,
  group_activity,
  group_members,
  seeker_contacts,
  seeker_profiles,
  service_agreements,
  settlements,
} from "@/db/schema";
import { splitExpense } from "@/modules/gastos/core/split";
import { ago, cents, dateIn, day, month, rng } from "./base";
import type { DemoPerson } from "./people";
import type { DemoStudio } from "./studios";

type R = ReturnType<typeof rng>;
const AGREEMENT_VERSION = "conexion-2026-10";

// ── Cajas compartidas ────────────────────────────────────────────────

async function sharedBox(db: Db, r: R, purpose: string, name: string, owner: DemoPerson, members: DemoPerson[], entries: { by: DemoPerson; paidBy?: DemoPerson; kind?: "gasto" | "ingreso" | "ahorro"; amount: number; desc: string; cat: string; mode: "registrar" | "dividir"; pending?: boolean; unpaid?: DemoPerson[]; daysAgo: number }[], goal?: { name: string; target: number }) {
  const [b] = await db.insert(boxes).values({ kind: "compartida", purpose, name, owner_id: owner.id }).returning({ id: boxes.id });
  const all = [owner, ...members];
  await db.insert(box_members).values(all.map((m, i) => ({ box_id: b.id, user_id: m.id, role: i === 0 ? "titular" : "integrante", joined_at: ago(150 - i * 7) })));
  let goalId: string | null = null;
  if (goal) {
    const [g] = await db.insert(box_goals).values({ box_id: b.id, name: goal.name, target: cents(goal.target), created_by: owner.id }).returning({ id: box_goals.id });
    goalId = g.id;
  }
  for (const e of entries) {
    const paidBy = e.paidBy ?? e.by;
    const kind = e.kind ?? "gasto";
    const [row] = await db
      .insert(box_entries)
      .values({ box_id: b.id, created_by: e.by.id, paid_by: paidBy.id, kind, amount: cents(e.amount), date: day(-e.daysAgo), category: e.cat, description: e.desc, mode: e.mode, status: e.pending ? "pendiente" : "confirmado", confirmed_at: e.pending ? null : ago(e.daysAgo), goal_id: kind === "ahorro" ? goalId : null })
      .returning({ id: box_entries.id });
    if (e.mode === "dividir") {
      const shares = splitExpense(cents(e.amount), { method: "iguales", members: all.map((m) => m.id) });
      await db.insert(box_entry_shares).values(Object.entries(shares).map(([userId, amount]) => ({ entry_id: row.id, user_id: userId, amount, paid_at: userId === paidBy.id || !(e.unpaid ?? []).some((u) => u.id === userId) ? ago(Math.max(0, e.daysAgo - 2)) : null })));
    }
  }
  void r;
  return b.id;
}

// ── Grupos de gastos ─────────────────────────────────────────────────

async function expenseGroup(db: Db, studioId: string, name: string, type: "viaje" | "oficina" | "personal", people: DemoPerson[], items: { desc: string; amount: number; payer: number; daysAgo: number; cat: string; currency?: string }[], pays: { from: number; to: number; amount: number; status: "informado" | "confirmado" }[]) {
  const [g] = await db.insert(expense_groups).values({ studio_id: studioId, name, type, created_by: people[0].id, color: type === "viaje" ? "#a57c6d" : "#1c2235", created_at: ago(60) }).returning({ id: expense_groups.id });
  const members = await db.insert(group_members).values(people.map((p, i) => ({ group_id: g.id, user_id: p.id, name: p.name, email: p.email, role: i === 0 ? ("admin" as const) : ("miembro" as const), payment_alias: `${p.name.split(" ")[0].toLowerCase()}.mp` }))).returning({ id: group_members.id });
  for (const it of items) {
    const [e] = await db.insert(expenses).values({ group_id: g.id, description: it.desc, amount: cents(it.amount), currency: it.currency ?? "ARS", fx_rate: it.currency === "USD" ? "1180" : null, fx_source: it.currency === "USD" ? "mep" : null, date: day(-it.daysAgo), category: it.cat, created_by: members[it.payer].id, created_at: ago(it.daysAgo) }).returning({ id: expenses.id });
    const base = it.currency === "USD" ? Math.round(cents(it.amount) * 1180) : cents(it.amount);
    await db.insert(expense_payers).values({ expense_id: e.id, member_id: members[it.payer].id, amount: base });
    const shares = splitExpense(base, { method: "iguales", members: members.map((m) => m.id) });
    await db.insert(expense_shares).values(Object.entries(shares).map(([member_id, amount]) => ({ expense_id: e.id, member_id, amount })));
    await db.insert(group_activity).values({ group_id: g.id, member_id: members[it.payer].id, kind: "gasto", text: `${people[it.payer].name.split(" ")[0]} cargó «${it.desc}»`, created_at: ago(it.daysAgo) });
  }
  for (const s of pays)
    await db.insert(settlements).values({ group_id: g.id, from_member: members[s.from].id, to_member: members[s.to].id, amount: cents(s.amount), method: "transferencia", status: s.status, confirmed_by_from: true, confirmed_by_to: s.status === "confirmado", confirmed_at: s.status === "confirmado" ? ago(3) : null, created_by: members[s.from].id });
  // Conversación del grupo
  const [c] = await db.insert(conversations).values({ kind: "gastos", expense_group_id: g.id, created_by: people[0].id, last_message_at: ago(1) }).returning({ id: conversations.id });
  await db.insert(conversation_members).values(people.map((p) => ({ conversation_id: c.id, user_id: p.id })));
  await db.insert(chat_messages).values([
    { conversation_id: c.id, author_id: people[1].id, body: "Ya cargué lo del supermercado 🙌", created_at: ago(2) },
    { conversation_id: c.id, author_id: people[0].id, body: "Genial. Cuando puedan, salden lo que les marca la app.", created_at: ago(1) },
  ]);
  return g.id;
}

// ── Conexiones con un contador ───────────────────────────────────────

type ConnStatus = "invitada" | "admision" | "acuerdo" | "activa" | "en_cierre" | "en_disputa" | "cerrada";
async function connection(db: Db, studio: DemoStudio, p: DemoPerson, status: ConnStatus, opts: { autonomy?: "delegar" | "proponer"; personal?: boolean; by?: "usuario" | "estudio"; message?: string; source?: string; weekly?: boolean; startedDaysAgo?: number } = {}) {
  const fee = p.kind === "autonomo" ? 85_000 : 45_000;
  const signed = ["activa", "en_cierre", "en_disputa", "cerrada"].includes(status);
  const terms = ["acuerdo", ...(signed ? [status] : [])].includes(status) ? { services: p.kind === "autonomo" ? "Monotributo, facturación y caja de negocio" : "Ganancias personales y orden de la Bitácora", monthlyPrice: fee, noticeDays: 30, version: AGREEMENT_VERSION } : null;
  const started = ago(opts.startedDaysAgo ?? 120);
  let agreementId: string | null = null;
  if (signed) {
    const [a] = await db
      .insert(service_agreements)
      .values({ studio_id: studio.studioId, user_id: p.id, member_name: p.name, member_email: p.email, profile: "conexion", monthly_price: fee, terms: { includes: terms!.services, minMembers: 1, noticeDays: 30, studioName: studio.name, fleetName: "", version: AGREEMENT_VERSION }, status: status === "cerrada" ? "finalizado" : status === "en_cierre" ? "baja_solicitada" : "activo", signed_name: p.name, signed_at: started, ends_on: status === "cerrada" ? day(-10) : null })
      .returning({ id: service_agreements.id });
    agreementId = a.id;
  }
  const [c] = await db
    .insert(account_connections)
    .values({
      user_id: p.id,
      user_studio_id: p.studioId,
      studio_id: studio.studioId,
      status,
      initiated_by: opts.by ?? "usuario",
      scope_personal: !!opts.personal,
      autonomy: opts.autonomy ?? "delegar",
      message: opts.message ?? (opts.by === "estudio" ? "Hola, te invitamos a conectar tu cuenta con el estudio." : "Hola, quisiera que me lleven el monotributo y la facturación."),
      interview_requested_at: status === "admision" ? ago(2) : null,
      info_request: status === "admision" && opts.by === "usuario" ? "¿Nos pasás tu última constancia de inscripción?" : null,
      decided_by: status !== "invitada" && status !== "admision" ? studio.owner.id : null,
      decided_at: status !== "invitada" && status !== "admision" ? ago(110) : null,
      terms,
      agreement_id: agreementId,
      studio_signed_by: terms ? studio.owner.id : null,
      studio_signed_name: terms ? studio.owner.name : null,
      studio_signed_at: terms ? ago(112) : null,
      user_signed_name: signed ? p.name : null,
      user_signed_at: signed ? started : null,
      policies_accepted_at: signed ? started : null,
      started_at: signed ? started : null,
      closing_started_at: ["en_cierre", "en_disputa", "cerrada"].includes(status) ? ago(status === "cerrada" ? 40 : 6) : null,
      closing_initiated_by: ["en_cierre", "en_disputa", "cerrada"].includes(status) ? "usuario" : null,
      closing_reason: ["en_cierre", "en_disputa", "cerrada"].includes(status) ? "Me mudo de provincia y voy a trabajar con un estudio de allá." : null,
      readonly_until: status === "en_cierre" || status === "en_disputa" ? new Date(Date.now() + 24 * 86400_000) : null,
      fees_zero_at: status === "cerrada" ? ago(12) : null,
      pending_delivered_at: status === "cerrada" ? ago(12) : null,
      user_clear_at: status === "cerrada" ? ago(11) : null,
      studio_clear_at: status === "cerrada" ? ago(10) : null,
      closed_at: status === "cerrada" ? ago(10) : null,
      weekly_summary: !!opts.weekly,
      source: opts.source ?? "red",
      created_at: ago((opts.startedDaysAgo ?? 120) + 8),
    })
    .returning({ id: account_connections.id });
  if (status === "activa" || status === "en_cierre") {
    const by = studio.staff[1] ?? studio.owner;
    await db.insert(connection_actions).values([
      { connection_id: c.id, actor_id: by.id, actor_name: by.name, action: "categoria", summary: "Corrigió la categoría de «Adobe Creative Cloud»: de Otros a Software y suscripciones", entity_type: "movimiento", before: { categoria: "otros" }, after: { categoria: "software" }, status: "aplicada", created_at: ago(9) },
      { connection_id: c.id, actor_id: by.id, actor_name: by.name, action: "comprobante", summary: "Adjuntó el comprobante de la factura C 0003-00000007", entity_type: "movimiento", status: "aplicada", created_at: ago(5) },
      ...(opts.autonomy === "proponer" ? [{ connection_id: c.id, actor_id: by.id, actor_name: by.name, action: "movimiento", summary: "Propone cargar el pago de Ingresos Brutos de octubre ($ 18.420,00)", entity_type: "movimiento", payload: { tipo: "gasto", monto: 1842000, categoria: "impuestos" }, status: "propuesta", created_at: ago(1) }] : []),
    ]);
    await db.insert(connection_ratings).values({ connection_id: c.id, kind: "periodica", score: 5, comment: "Responden rápido y me explican todo.", created_at: ago(60) });
  }
  if (status === "en_disputa") {
    await db.insert(connection_messages).values([
      { connection_id: c.id, author_id: p.id, side: "usuario", body: "Me cobraron el abono de este mes pero ya había pedido la baja.", created_at: ago(5) },
      { connection_id: c.id, author_id: studio.owner.id, side: "estudio", body: "El preaviso es de 30 días según el acuerdo. Si querés, lo revisamos juntos.", created_at: ago(4) },
      { connection_id: c.id, author_id: p.id, side: "usuario", body: "Prefiero que intervenga Faro para cerrarlo.", created_at: ago(3) },
    ]);
  }
  if (status === "cerrada")
    await db.insert(connection_ratings).values([
      { connection_id: c.id, kind: "periodica", score: 4, comment: "Bien, aunque a veces tardaban.", created_at: ago(70) },
      { connection_id: c.id, kind: "cierre", score: 4, comment: "Cerramos ordenado y me entregaron todo.", created_at: ago(9) },
    ]);
  return c.id;
}

// ── Flotas ───────────────────────────────────────────────────────────

async function fleet(db: Db, name: string, captain: DemoPerson, crew: DemoPerson[], studios: DemoStudio[], published: boolean) {
  const [f] = await db.insert(fleets).values({ name, description: "Nos juntamos para conseguir mejor precio con un estudio.", request_status: published ? "publicado" : "borrador", request_zone: "CABA y GBA", request_services: ["monotributo", "facturacion"], request_message: "Somos monotributistas de servicios. Buscamos un estudio que nos lleve monotributo y facturación.", request_published_at: published ? ago(12) : null, created_by: captain.id, is_demo: true }).returning({ id: fleets.id });
  const all = [captain, ...crew];
  const mem = await db.insert(fleet_members).values(all.map((p, i) => ({ fleet_id: f.id, user_id: p.id, email: p.email, name: p.name, profile: "monotributista", role: i === 0 ? ("capitan" as const) : ("tripulante" as const), status: i === all.length - 1 && published ? ("invitado" as const) : ("activo" as const), informal_ack_at: ago(20), joined_at: ago(20 - i) }))).returning({ id: fleet_members.id });
  await db.insert(fleet_events).values([
    { fleet_id: f.id, kind: "evento", actor_label: captain.name, body: `${captain.name} armó la Flota.`, created_at: ago(20) },
    { fleet_id: f.id, kind: "mensaje", actor_id: crew[0].id, actor_label: crew[0].name, body: "¿Pedimos propuestas esta semana?", created_at: ago(14) },
    ...(published ? [{ fleet_id: f.id, kind: "evento", actor_label: captain.name, body: "Publicaron el pedido de propuesta en la Red Contable.", created_at: ago(12) }] : []),
  ]);
  if (published)
    for (const [i, s] of studios.entries()) {
      const [prop] = await db.insert(fleet_proposals).values({ fleet_id: f.id, studio_id: s.studioId, prices: { monotributista: 38_000 + i * 6_000, responsable_inscripto: null }, includes: "Monotributo, facturación electrónica y recategorizaciones.", min_members: 3, created_by: s.owner.id, created_at: ago(8 - i) }).returning({ id: fleet_proposals.id });
      if (i === 0) await db.insert(fleet_votes).values(mem.slice(0, 2).map((m) => ({ fleet_id: f.id, member_id: m.id, proposal_id: prop.id })));
    }
  // Conversación de la Flota
  const [c] = await db.insert(conversations).values({ kind: "flota", fleet_id: f.id, created_by: captain.id, last_message_at: ago(1) }).returning({ id: conversations.id });
  await db.insert(conversation_members).values(all.map((p) => ({ conversation_id: c.id, user_id: p.id })));
  await db.insert(chat_messages).values({ conversation_id: c.id, author_id: captain.id, body: "Llegaron dos propuestas. ¡Voten!", created_at: ago(1) });
  return f.id;
}

// ── Mensajes directos ────────────────────────────────────────────────

async function direct(db: Db, a: DemoPerson, b: DemoPerson, lines: [0 | 1, string][]) {
  const [x, y] = [a.id, b.id].sort();
  const [c] = await db.insert(conversations).values({ kind: "directo", direct_key: `${x}:${y}`, created_by: a.id, last_message_at: ago(0) }).returning({ id: conversations.id });
  await db.insert(conversation_members).values([{ conversation_id: c.id, user_id: a.id, last_read_at: ago(0) }, { conversation_id: c.id, user_id: b.id }]);
  await db.insert(chat_messages).values(lines.map(([who, body], i) => ({ conversation_id: c.id, author_id: who === 0 ? a.id : b.id, body, created_at: new Date(Date.now() - (lines.length - i) * 3600_000) })));
}

export async function seedNetwork(db: Db, people: DemoPerson[], st: { big: DemoStudio; small: DemoStudio; indie: DemoStudio }) {
  const r = rng(47);
  const P = Object.fromEntries(people.map((p) => [p.email.split("@")[0], p])) as Record<string, DemoPerson>;
  const { persona: martina, autonomo: julian } = P;
  const tomas = P["tomas.castro"], sofia = P["sofia.medina"], lucas = P["lucas.romero"], valentina = P["valentina.herrera"], camila = P["camila.ortiz"];
  const nicolas = P["nicolas.sosa"], florencia = P["florencia.diaz"], mateo = P["mateo.pereyra"], elena = P["elena.vazquez"], ramon = P["ramon.vazquez"];
  const paula = P["paula.gimenez"], diego = P["diego.luna"], agustina = P["agustina.ferraro"];

  // Cajas compartidas: pareja, familia, amigos, negocio, y padres y abuelos
  await sharedBox(db, r, "pareja", "Casa de Martina y Tomás", martina, [tomas], [
    { by: martina, amount: 560_000, desc: "Alquiler de octubre", cat: "alquiler", mode: "dividir", daysAgo: 9 },
    { by: tomas, amount: 186_400, desc: "Compra grande del mes", cat: "super", mode: "dividir", unpaid: [martina], daysAgo: 6 },
    { by: tomas, paidBy: martina, amount: 32_800, desc: "Luz", cat: "servicios", mode: "registrar", pending: true, daysAgo: 2 },
    { by: martina, amount: 48_500, desc: "Veterinaria de Ñoqui", cat: "mascota", mode: "registrar", daysAgo: 15 },
    { by: martina, kind: "ahorro", amount: 250_000, desc: "Ahorro para las vacaciones", cat: "ahorro", mode: "registrar", daysAgo: 20 },
    { by: tomas, kind: "ahorro", amount: 250_000, desc: "Ahorro para las vacaciones", cat: "ahorro", mode: "registrar", daysAgo: 19 },
  ], { name: "Vacaciones en Brasil", target: 2_400_000 });
  await sharedBox(db, r, "familia", "Familia Gómez Castro", martina, [tomas, elena], [
    { by: elena, amount: 94_000, desc: "Cuota del colegio de Lola", cat: "colegio", mode: "dividir", unpaid: [tomas], daysAgo: 4 },
    { by: martina, amount: 38_700, desc: "Farmacia", cat: "salud", mode: "registrar", daysAgo: 11 },
  ]);
  await sharedBox(db, r, "amigos", "Asado de los jueves", lucas, [martina, sofia, diego], [
    { by: lucas, amount: 112_000, desc: "Carne y carbón", cat: "comidas", mode: "dividir", unpaid: [sofia, diego], daysAgo: 3 },
    { by: diego, amount: 36_000, desc: "Bebidas", cat: "comidas", mode: "dividir", daysAgo: 3 },
    { by: sofia, amount: 25_000, desc: "Regalo de cumple de Martina", cat: "regalos", mode: "dividir", unpaid: [lucas], daysAgo: 17 },
  ]);
  await sharedBox(db, r, "negocio", "Estudio de diseño Ríos & Giménez", julian, [paula], [
    { by: julian, kind: "ingreso", amount: 500_000, desc: "Aporte inicial de Julián", cat: "aportes", mode: "registrar", daysAgo: 60 },
    { by: paula, kind: "ingreso", amount: 500_000, desc: "Aporte inicial de Paula", cat: "aportes", mode: "registrar", daysAgo: 58 },
    { by: julian, amount: 289_000, desc: "Monitor para la oficina", cat: "insumos", mode: "registrar", daysAgo: 30 },
    { by: paula, kind: "ingreso", amount: 1_350_000, desc: "Cobro proyecto Café de la Esquina", cat: "ventas", mode: "registrar", daysAgo: 12 },
  ]);
  await sharedBox(db, r, "padres", "Para la abuela Ana", elena, [ramon, agustina, diego], [
    { by: elena, amount: 420_000, desc: "Cuidadora de octubre", cat: "cuidadora", mode: "dividir", unpaid: [ramon, diego], daysAgo: 7 },
    { by: ramon, amount: 64_300, desc: "Remedios del mes", cat: "remedios", mode: "dividir", daysAgo: 10 },
    { by: agustina, amount: 23_000, desc: "Supermercado de la semana", cat: "super", mode: "registrar", daysAgo: 2 },
  ]);

  // Grupos de gastos con deudas y pagos
  await expenseGroup(db, martina.studioId, "Viaje a Bariloche", "viaje", [martina, sofia, lucas, valentina], [
    { desc: "Cabaña 4 noches", amount: 980_000, payer: 0, daysAgo: 40, cat: "alojamiento" },
    { desc: "Alquiler de esquíes", amount: 340_000, payer: 1, daysAgo: 38, cat: "actividades" },
    { desc: "Cena en el centro", amount: 156_000, payer: 2, daysAgo: 37, cat: "comida" },
    { desc: "Pasajes de avión", amount: 420, payer: 3, daysAgo: 60, cat: "transporte", currency: "USD" },
  ], [
    { from: 1, to: 0, amount: 120_000, status: "confirmado" },
    { from: 2, to: 0, amount: 90_000, status: "informado" },
  ]);
  await expenseGroup(db, julian.studioId, "Cowork de Palermo", "oficina", [julian, paula, nicolas], [
    { desc: "Alquiler del cowork", amount: 450_000, payer: 0, daysAgo: 12, cat: "alquiler" },
    { desc: "Internet y café", amount: 38_000, payer: 2, daysAgo: 8, cat: "servicios" },
  ], []);

  // Conexiones con un contador, en todos los estados
  await connection(db, st.big, julian, "activa", { autonomy: "delegar", weekly: true, startedDaysAgo: 150 });
  await connection(db, st.big, florencia, "activa", { autonomy: "proponer", startedDaysAgo: 90 });
  await connection(db, st.big, martina, "activa", { autonomy: "delegar", personal: true, startedDaysAgo: 60 });
  await connection(db, st.small, nicolas, "admision", { by: "usuario", message: "Hola, soy electricista monotributista. ¿Me pueden llevar el monotributo?" });
  await connection(db, st.small, paula, "acuerdo", { by: "usuario" });
  await connection(db, st.indie, camila, "invitada", { by: "estudio", source: "invitacion" });
  await connection(db, st.big, sofia, "en_cierre", { startedDaysAgo: 200 });
  await connection(db, st.small, lucas, "en_disputa", { startedDaysAgo: 180 });
  await connection(db, st.indie, agustina, "cerrada", { startedDaysAgo: 220 });

  // Red Contable de doble mano: «Disponible, busco contador» y contactos
  const seeker = async (p: DemoPerson, kind: "persona" | "autonomo" | "empresa" | "flota", v: { industry?: string; size?: string; province: string; city: string; needs: string[]; note: string }, fleetId?: string) => {
    const [s] = await db.insert(seeker_profiles).values({ kind, user_id: p.id, fleet_id: fleetId ?? null, active: true, industry: v.industry ?? null, size: v.size ?? null, province: v.province, city: v.city, needs: v.needs, note: v.note, activated_at: ago(r.int(1, 15)) }).returning({ id: seeker_profiles.id });
    return s.id;
  };
  const sDiego = await seeker(diego, "persona", { province: "CABA", city: "Caballito", needs: ["ganancias_personas"], note: "Vendí un auto y alquilo un departamento. Necesito ordenar Ganancias y Bienes Personales." });
  const sMateo = await seeker(mateo, "autonomo", { industry: "gastronomia", size: "solo", province: "Buenos Aires", city: "La Plata", needs: ["monotributo", "facturacion"], note: "Tengo un food truck. Facturo con Faro y quiero que alguien me revise la categoría." });
  const sValen = await seeker(valentina, "empresa", { industry: "comercio_minorista", size: "6-20", province: "Mendoza", city: "Mendoza", needs: ["responsable_inscripto", "sueldos", "sociedades"], note: "Somos una tienda de ropa con 8 empleados y queremos pasar a SRL." });
  await seeker(ramon, "persona", { province: "Córdoba", city: "Villa Carlos Paz", needs: ["asesoramiento_financiero"], note: "Me jubilé y quiero entender mis ingresos y gastos." });
  await seeker(elena, "autonomo", { industry: "servicios_profesionales", size: "solo", province: "Santa Fe", city: "Rosario", needs: ["monotributo"], note: "Doy clases particulares y empiezo a facturar." });
  const diegoConn = await connection(db, st.big, diego, "admision", { by: "estudio", source: "red", message: "Vimos tu pedido en la Red Contable. Te podemos ayudar con Ganancias." });
  await db.insert(seeker_contacts).values([
    { seeker_id: sDiego, studio_id: st.big.studioId, contacted_by: st.big.owner.id, message: "Hola, te podemos ayudar con Ganancias y Bienes Personales.", status: "aceptado", decided_at: ago(2), connection_id: diegoConn, created_at: ago(4) },
    { seeker_id: sMateo, studio_id: st.small.studioId, contacted_by: st.small.owner.id, message: "Trabajamos con muchos gastronómicos. ¿Charlamos?", status: "rechazado", decided_at: ago(3), created_at: ago(6) },
    { seeker_id: sValen, studio_id: st.indie.studioId, contacted_by: st.indie.owner.id, message: "Te acompaño en el paso a SRL.", status: "pendiente", created_at: ago(1) },
  ]);

  // Flotas: una con el pedido publicado y propuestas, otra armándose
  const f1 = await fleet(db, "Diseñadores independientes de CABA", julian, [nicolas, mateo, paula], [st.big, st.small], true);
  await seeker(julian, "flota", { province: "CABA", city: "Palermo", needs: ["monotributo", "facturacion"], note: "Somos 4 monotributistas de servicios creativos." }, f1);
  await fleet(db, "Monotributistas de Rosario", elena, [ramon, agustina], [], false);

  // Mensajes directos
  await direct(db, martina, tomas, [
    [0, "¿Cargaste lo del súper en la caja de la casa?"],
    [1, "Sí, y lo dividí. Te quedó pendiente tu parte."],
    [0, "Dale, te la paso hoy 👍"],
  ]);
  await direct(db, julian, paula, [[1, "Llegó el pago del Café de la Esquina. Lo anoté en la caja del estudio."], [0, "¡Genial! Mañana compramos la impresora."]]);
  void dateIn;
  void month;
}
