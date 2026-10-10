import "server-only";
import { and, asc, count, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { agreement_payments, fleet_events, fleet_members, fleet_proposals, fleet_votes, fleets, organizations, service_agreements, studios, users } from "@/db/schema";
import { esc, sendMail } from "@/lib/email";
import { hasModule } from "@/lib/faro/entitlements";
import { mailLayout } from "@/lib/notify";
import { getSiteUrl } from "@/lib/runtime-config";
import { getProfile, visibilityIssue } from "@/modules/red/server";
import { AGREEMENT_VERSION, BELOW_MIN_NOTICE_DAYS, FLEET_MAX, FLEET_MIN, fleetNameIssue, isProfile, MAX_NOTICE_DAYS, PROFILES, profileLabel } from "./catalog";

// Flotas (docs/faro-producto.md §2.j). Toda operación recibe al usuario de la
// sesión y valida acá que pertenezca a la Flota (y su rol): ningún id del
// navegador alcanza para ver o tocar una Flota ajena. Los integrantes ven
// nombre, perfil y estado frente a la propuesta de cada uno; nunca finanzas.

export class FleetError extends Error {}

export interface Me {
  id: string;
  name: string;
  email: string;
}

const UUID = /^[0-9a-f-]{36}$/i;
const db = () => getDb();

async function event(fleetId: string, body: string, actor?: Me | null, kind: "evento" | "mensaje" = "evento") {
  await db()
    .insert(fleet_events)
    .values({ fleet_id: fleetId, kind, body: body.slice(0, 2000), actor_id: actor?.id ?? null, actor_label: actor?.name ?? null });
}

async function mailMembers(fleetId: string, subject: string, html: string, exceptUserId?: string) {
  const list = await db()
    .select({ email: fleet_members.email, user: fleet_members.user_id })
    .from(fleet_members)
    .where(and(eq(fleet_members.fleet_id, fleetId), eq(fleet_members.status, "activo")));
  const to = list.filter((m) => m.user !== exceptUserId).map((m) => m.email);
  if (to.length) await sendMail({ to, subject, html: mailLayout(subject, html, { href: `${getSiteUrl()}/flotas/${fleetId}`, label: "Abrir la Flota" }, "Faro") }).catch(() => undefined);
}

/** Integrante activo de la Flota (o error). Base de todo el aislamiento */
export async function membership(fleetId: string, me: Me) {
  if (!UUID.test(fleetId)) throw new FleetError("Esa Flota no existe.");
  const [m] = await db()
    .select({ m: fleet_members, f: fleets })
    .from(fleet_members)
    .innerJoin(fleets, eq(fleets.id, fleet_members.fleet_id))
    .where(and(eq(fleet_members.fleet_id, fleetId), eq(fleet_members.user_id, me.id), eq(fleet_members.status, "activo")));
  if (!m || m.f.status !== "activa") throw new FleetError("Esa Flota no existe o no sos parte de ella.");
  return m;
}

async function captain(fleetId: string, me: Me) {
  const m = await membership(fleetId, me);
  if (m.m.role !== "capitan") throw new FleetError("Eso lo hace el Capitán de la Flota.");
  return m;
}

async function activeCount(fleetId: string) {
  const [r] = await db()
    .select({ n: count() })
    .from(fleet_members)
    .where(and(eq(fleet_members.fleet_id, fleetId), inArray(fleet_members.status, ["activo", "invitado"])));
  return r?.n ?? 0;
}

// ── Crear, invitar, unirse ────────────────────────────────────────────

export async function createFleet(me: Me, input: { name: string; description: string; profile: string; informalAck: boolean }) {
  const issue = fleetNameIssue(input.name);
  if (issue) throw new FleetError(issue);
  if (!input.informalAck) throw new FleetError("Para crear la Flota tenés que leer y aceptar que es un grupo informal.");
  if (!isProfile(input.profile)) throw new FleetError("Elegí tu perfil.");
  const [f] = await db()
    .insert(fleets)
    .values({ name: input.name.trim(), description: input.description.trim().slice(0, 500) || null, created_by: me.id })
    .returning({ id: fleets.id });
  await db()
    .insert(fleet_members)
    .values({ fleet_id: f.id, user_id: me.id, email: me.email.toLowerCase(), name: me.name, profile: input.profile, role: "capitan", status: "activo", informal_ack_at: new Date(), joined_at: new Date(), invited_by: me.id });
  await event(f.id, `${me.name} creó la Flota.`, me);
  return f.id;
}

export async function inviteMember(me: Me, fleetId: string, email: string, name: string) {
  const { f } = await captain(fleetId, me);
  const e = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new FleetError("Revisá el email.");
  if ((await activeCount(fleetId)) >= FLEET_MAX) throw new FleetError(`Una Flota puede tener hasta ${FLEET_MAX} integrantes.`);
  const [prev] = await db().select().from(fleet_members).where(and(eq(fleet_members.fleet_id, fleetId), eq(fleet_members.email, e)));
  if (prev && (prev.status === "activo" || prev.status === "invitado")) throw new FleetError("Esa persona ya está en la Flota o invitada.");
  const [u] = await db().select({ id: users.id }).from(users).where(eq(users.email, e));
  if (prev) await db().update(fleet_members).set({ status: "invitado", name: name.trim() || prev.name, invited_by: me.id, left_at: null, user_id: u?.id ?? prev.user_id }).where(eq(fleet_members.id, prev.id));
  else await db().insert(fleet_members).values({ fleet_id: fleetId, email: e, name: name.trim().slice(0, 120) || e.split("@")[0], user_id: u?.id ?? null, invited_by: me.id });
  await event(fleetId, `${me.name} invitó a ${name.trim() || e}.`, me);
  await sendMail({
    to: e,
    subject: `${me.name} te invitó a la Flota «${f.name}»`,
    html: mailLayout(
      "Te invitaron a una Flota",
      `<p><strong>${esc(me.name)}</strong> te invitó a <strong>${esc(f.name)}</strong>, una Flota de Faro: un grupo informal que pide junto una propuesta a un estudio contable. Cada integrante firma su propio acuerdo y paga solo lo suyo.</p><p>Entrá a Faro (o creá tu cuenta gratis con este mail) y aceptá la invitación en <strong>Flotas</strong>.</p>`,
      { href: `${getSiteUrl()}/flotas`, label: "Ver la invitación" },
      "Faro",
    ),
  }).catch(() => undefined);
}

/** Invitaciones pendientes para el email de la sesión */
export async function myInvitations(me: Me) {
  return db()
    .select({ id: fleet_members.id, fleetId: fleets.id, name: fleets.name, description: fleets.description })
    .from(fleet_members)
    .innerJoin(fleets, eq(fleets.id, fleet_members.fleet_id))
    .where(and(eq(fleet_members.email, me.email.toLowerCase()), eq(fleet_members.status, "invitado"), eq(fleets.status, "activa")));
}

export async function answerInvitation(me: Me, memberId: string, accept: boolean, profile: string, informalAck: boolean) {
  if (!UUID.test(memberId)) throw new FleetError("Esa invitación no existe.");
  const [m] = await db()
    .select()
    .from(fleet_members)
    .where(and(eq(fleet_members.id, memberId), eq(fleet_members.email, me.email.toLowerCase()), eq(fleet_members.status, "invitado")));
  if (!m) throw new FleetError("Esa invitación no existe o ya la respondiste.");
  if (accept) {
    if (!informalAck) throw new FleetError("Para unirte tenés que aceptar que la Flota es un grupo informal.");
    if (!isProfile(profile)) throw new FleetError("Elegí tu perfil.");
    await db().update(fleet_members).set({ status: "activo", user_id: me.id, profile, informal_ack_at: new Date(), joined_at: new Date(), name: me.name }).where(eq(fleet_members.id, m.id));
    await event(m.fleet_id, `${me.name} se sumó a la Flota.`, me);
  } else {
    await db().update(fleet_members).set({ status: "rechazo", user_id: me.id }).where(eq(fleet_members.id, m.id));
    await event(m.fleet_id, `${m.name} no aceptó la invitación.`, me);
  }
  return m.fleet_id;
}

export async function updateFleet(me: Me, fleetId: string, name: string, description: string) {
  await captain(fleetId, me);
  const issue = fleetNameIssue(name);
  if (issue) throw new FleetError(issue);
  await db().update(fleets).set({ name: name.trim(), description: description.trim().slice(0, 500) || null }).where(eq(fleets.id, fleetId));
  await event(fleetId, `${me.name} actualizó el nombre y la descripción.`, me);
}

export async function setMyProfile(me: Me, fleetId: string, profile: string) {
  const { m } = await membership(fleetId, me);
  if (!isProfile(profile)) throw new FleetError("Elegí tu perfil.");
  await db().update(fleet_members).set({ profile }).where(eq(fleet_members.id, m.id));
}

export async function removeMember(me: Me, fleetId: string, memberId: string) {
  await captain(fleetId, me);
  if (!UUID.test(memberId)) throw new FleetError("Integrante inválido.");
  const [m] = await db().select().from(fleet_members).where(and(eq(fleet_members.id, memberId), eq(fleet_members.fleet_id, fleetId)));
  if (!m || m.user_id === me.id) throw new FleetError("No podés quitar a esa persona.");
  await db().update(fleet_members).set({ status: "salio", left_at: new Date() }).where(eq(fleet_members.id, m.id));
  await event(fleetId, `${me.name} quitó a ${m.name} de la Flota. Su acuerdo con el estudio, si tenía, sigue vigente.`, me);
  await checkMinimums(fleetId);
}

export async function transferCaptain(me: Me, fleetId: string, memberId: string) {
  const { m: mine } = await captain(fleetId, me);
  if (!UUID.test(memberId)) throw new FleetError("Integrante inválido.");
  const [to] = await db().select().from(fleet_members).where(and(eq(fleet_members.id, memberId), eq(fleet_members.fleet_id, fleetId), eq(fleet_members.status, "activo")));
  if (!to || to.id === mine.id) throw new FleetError("Elegí a otro integrante activo.");
  await db().update(fleet_members).set({ role: "tripulante" }).where(eq(fleet_members.id, mine.id));
  await db().update(fleet_members).set({ role: "capitan" }).where(eq(fleet_members.id, to.id));
  await event(fleetId, `${me.name} le pasó el rol de Capitán a ${to.name}.`, me);
}

/** Salir de la Flota: no rescinde el acuerdo con el estudio. Si se va el Capitán, el rol pasa al integrante más antiguo */
export async function leaveFleet(me: Me, fleetId: string) {
  const { m } = await membership(fleetId, me);
  await db().update(fleet_members).set({ status: "salio", left_at: new Date(), role: "tripulante" }).where(eq(fleet_members.id, m.id));
  await event(fleetId, `${me.name} salió de la Flota.`, me);
  if (m.role === "capitan") {
    const [next] = await db()
      .select()
      .from(fleet_members)
      .where(and(eq(fleet_members.fleet_id, fleetId), eq(fleet_members.status, "activo")))
      .orderBy(asc(fleet_members.joined_at))
      .limit(1);
    if (next) {
      await db().update(fleet_members).set({ role: "capitan" }).where(eq(fleet_members.id, next.id));
      await event(fleetId, `${next.name} ahora es Capitán (era el integrante más antiguo).`);
    } else await db().update(fleets).set({ status: "cerrada" }).where(eq(fleets.id, fleetId));
  }
  await checkMinimums(fleetId);
}

export async function postMessage(me: Me, fleetId: string, body: string) {
  await membership(fleetId, me);
  const t = body.trim();
  if (!t) throw new FleetError("Escribí un mensaje.");
  await event(fleetId, t.slice(0, 1000), me, "mensaje");
}

// ── Pedido y propuestas ───────────────────────────────────────────────

export async function publishRequest(me: Me, fleetId: string, zone: string, services: string[], message: string) {
  await captain(fleetId, me);
  const [{ n }] = await db()
    .select({ n: count() })
    .from(fleet_members)
    .where(and(eq(fleet_members.fleet_id, fleetId), eq(fleet_members.status, "activo")));
  if (n < FLEET_MIN) throw new FleetError(`Para publicar el pedido la Flota necesita al menos ${FLEET_MIN} integrantes activos.`);
  await db()
    .update(fleets)
    .set({ request_status: "publicado", request_zone: zone.trim().slice(0, 80) || null, request_services: services.slice(0, 10), request_message: message.trim().slice(0, 1000) || null, request_published_at: new Date() })
    .where(eq(fleets.id, fleetId));
  await event(fleetId, `${me.name} publicó el pedido de propuesta en la Red de estudios.`, me);
}

export async function closeRequest(me: Me, fleetId: string) {
  await captain(fleetId, me);
  await db().update(fleets).set({ request_status: "cerrado" }).where(eq(fleets.id, fleetId));
  await event(fleetId, `${me.name} cerró el pedido de propuesta.`, me);
}

/** Composición anónima de la Flota: cuántos integrantes por perfil (lo que ve un estudio) */
export async function composition(fleetId: string) {
  const rows = await db()
    .select({ profile: fleet_members.profile, n: count() })
    .from(fleet_members)
    .where(and(eq(fleet_members.fleet_id, fleetId), eq(fleet_members.status, "activo")))
    .groupBy(fleet_members.profile);
  return Object.fromEntries(PROFILES.map((p) => [p.key, rows.find((r) => r.profile === p.key)?.n ?? 0])) as Record<string, number>;
}

/** Pedidos publicados para un estudio de la Red: sin datos personales */
export async function openRequestsForStudio(studioId: string) {
  if (await visibilityIssue(studioId, await getProfile(studioId))) return [];
  const list = await db().select().from(fleets).where(and(eq(fleets.request_status, "publicado"), eq(fleets.status, "activa"))).orderBy(desc(fleets.request_published_at));
  const mine = await db().select().from(fleet_proposals).where(eq(fleet_proposals.studio_id, studioId));
  return Promise.all(list.map(async (f) => ({ id: f.id, name: f.name, zone: f.request_zone, services: f.request_services, message: f.request_message, publishedAt: f.request_published_at, composition: await composition(f.id), proposal: mine.find((p) => p.fleet_id === f.id) ?? null })));
}

export async function submitProposal(studio: { id: string; userId: string }, fleetId: string, input: { prices: Record<string, number | null>; includes: string; minMembers: number; noticeDays: number }) {
  if (!UUID.test(fleetId)) throw new FleetError("Pedido inválido.");
  if (!(await hasModule(studio.id, "red_estudios")) || (await visibilityIssue(studio.id, await getProfile(studio.id)))) throw new FleetError("Para proponer, tu estudio tiene que estar visible en la Red.");
  const [f] = await db().select().from(fleets).where(eq(fleets.id, fleetId));
  if (!f || f.request_status !== "publicado" || f.status !== "activa") throw new FleetError("Ese pedido ya no recibe propuestas.");
  const prices = Object.fromEntries(PROFILES.map((p) => [p.key, input.prices[p.key] != null && Number.isFinite(input.prices[p.key]) && input.prices[p.key]! > 0 ? Math.round(input.prices[p.key]!) : null]));
  if (!Object.values(prices).some((v) => v != null)) throw new FleetError("Poné el precio de al menos un perfil.");
  if (input.includes.trim().length < 10) throw new FleetError("Contá qué incluye la propuesta.");
  const minMembers = Math.min(FLEET_MAX, Math.max(FLEET_MIN, Math.round(input.minMembers) || FLEET_MIN));
  const noticeDays = Math.min(MAX_NOTICE_DAYS, Math.max(0, Math.round(input.noticeDays) || 0));
  const values = { prices, includes: input.includes.trim().slice(0, 2000), min_members: minMembers, notice_days: noticeDays, status: "enviada", created_by: studio.userId };
  await db()
    .insert(fleet_proposals)
    .values({ fleet_id: fleetId, studio_id: studio.id, ...values })
    .onConflictDoUpdate({ target: [fleet_proposals.fleet_id, fleet_proposals.studio_id], set: values });
  const [st] = await db().select({ name: studios.name }).from(studios).where(eq(studios.id, studio.id));
  await event(fleetId, `${st?.name ?? "Un estudio"} envió una propuesta.`);
  await mailMembers(fleetId, `Nueva propuesta para «${f.name}»`, `<p><strong>${esc(st?.name ?? "Un estudio")}</strong> le mandó una propuesta a tu Flota. Comparala con las otras en Faro.</p>`);
}

export async function vote(me: Me, fleetId: string, proposalId: string) {
  const { m } = await membership(fleetId, me);
  if (!UUID.test(proposalId)) throw new FleetError("Propuesta inválida.");
  const [p] = await db().select().from(fleet_proposals).where(and(eq(fleet_proposals.id, proposalId), eq(fleet_proposals.fleet_id, fleetId), eq(fleet_proposals.status, "enviada")));
  if (!p) throw new FleetError("Esa propuesta no es de esta Flota.");
  await db()
    .insert(fleet_votes)
    .values({ fleet_id: fleetId, member_id: m.id, proposal_id: p.id })
    .onConflictDoUpdate({ target: [fleet_votes.fleet_id, fleet_votes.member_id], set: { proposal_id: p.id, created_at: new Date() } });
}

/** Todo lo que ve un integrante de su Flota (sin finanzas de nadie) */
export async function fleetSpace(me: Me, fleetId: string) {
  const { m: mine, f } = await membership(fleetId, me);
  const [members, proposals, votes, events, agreements] = await Promise.all([
    db().select().from(fleet_members).where(and(eq(fleet_members.fleet_id, fleetId), ne(fleet_members.status, "rechazo"))).orderBy(asc(fleet_members.created_at)),
    db()
      .select({ p: fleet_proposals, studio: studios.name, slug: studios.slug })
      .from(fleet_proposals)
      .innerJoin(studios, eq(studios.id, fleet_proposals.studio_id))
      .where(and(eq(fleet_proposals.fleet_id, fleetId), eq(fleet_proposals.status, "enviada")))
      .orderBy(asc(fleet_proposals.created_at)),
    db().select({ proposal: fleet_votes.proposal_id, member: fleet_votes.member_id }).from(fleet_votes).where(eq(fleet_votes.fleet_id, fleetId)),
    db().select().from(fleet_events).where(eq(fleet_events.fleet_id, fleetId)).orderBy(desc(fleet_events.created_at)).limit(80),
    // Solo el estado (aceptó o no), nunca importes ni pagos de otros
    db().select({ user: service_agreements.user_id, status: service_agreements.status, proposal: service_agreements.proposal_id }).from(service_agreements).where(eq(service_agreements.fleet_id, fleetId)),
  ]);
  return {
    fleet: f,
    me: mine,
    members: members
      .filter((x) => x.status !== "salio")
      .map((x) => ({ id: x.id, name: x.name, profile: x.profile, role: x.role, status: x.status, accepted: agreements.some((a) => a.user === x.user_id && a.status !== "finalizado"), isMe: x.id === mine.id })),
    proposals: proposals.map((x) => ({ ...x, votes: votes.filter((v) => v.proposal === x.p.id).length, myVote: votes.some((v) => v.proposal === x.p.id && v.member === mine.id), accepted: agreements.filter((a) => a.proposal === x.p.id && a.status !== "finalizado").length })),
    events,
    myAgreement: agreements.find((a) => a.user === me.id && a.status !== "finalizado") ?? null,
  };
}

// ── Acuerdo individual ────────────────────────────────────────────────

export async function proposalForMember(me: Me, proposalId: string) {
  if (!UUID.test(proposalId)) throw new FleetError("Propuesta inválida.");
  const [p] = await db()
    .select({ p: fleet_proposals, studio: studios.name, slug: studios.slug })
    .from(fleet_proposals)
    .innerJoin(studios, eq(studios.id, fleet_proposals.studio_id))
    .where(and(eq(fleet_proposals.id, proposalId), eq(fleet_proposals.status, "enviada")));
  if (!p) throw new FleetError("Esa propuesta no existe.");
  const { m, f } = await membership(p.p.fleet_id, me);
  const price = m.profile ? p.p.prices[m.profile] : null;
  return { ...p, member: m, fleet: f, price };
}

/**
 * Firma del Acuerdo de servicio: entre el integrante y el estudio, con la
 * tarifa grupal de su perfil. Crea la organización en el estudio (con su
 * consentimiento explícito). Cada uno paga solo su abono.
 */
export async function signAgreement(me: Me, proposalId: string, signedName: string, consent: boolean, ip: string | null) {
  const x = await proposalForMember(me, proposalId);
  if (!consent) throw new FleetError("Para firmar tenés que aceptar compartir tus datos con el estudio.");
  if (x.price == null) throw new FleetError(x.member.profile ? "Esta propuesta no incluye tu perfil." : "Primero declará tu perfil en la Flota.");
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  if (norm(signedName).length < 4 || norm(signedName) !== norm(me.name)) throw new FleetError(`Para firmar escribí tu nombre completo tal como figura en tu cuenta: ${me.name}.`);
  const [dup] = await db()
    .select({ id: service_agreements.id })
    .from(service_agreements)
    .where(and(eq(service_agreements.user_id, me.id), eq(service_agreements.fleet_id, x.fleet.id), ne(service_agreements.status, "finalizado")));
  if (dup) throw new FleetError("Ya tenés un acuerdo vigente por esta Flota.");
  const [org] = await db()
    .insert(organizations)
    .values({ studio_id: x.p.studio_id, name: me.name, status: "onboarding", contact_name: me.name, email: me.email, notes: `Llegó por la Flota «${x.fleet.name}» (Red de estudios), con su consentimiento.` })
    .returning({ id: organizations.id });
  const [a] = await db()
    .insert(service_agreements)
    .values({
      studio_id: x.p.studio_id,
      user_id: me.id,
      fleet_id: x.fleet.id,
      proposal_id: x.p.id,
      organization_id: org.id,
      member_name: me.name,
      member_email: me.email,
      profile: x.member.profile!,
      monthly_price: x.price,
      terms: { includes: x.p.includes, minMembers: x.p.min_members, noticeDays: x.p.notice_days, studioName: x.studio, fleetName: x.fleet.name, version: AGREEMENT_VERSION },
      signed_name: signedName.trim(),
      signed_at: new Date(),
      signed_ip: ip,
    })
    .returning({ id: service_agreements.id });
  await event(x.fleet.id, `${me.name} aceptó la propuesta de ${x.studio} y firmó su acuerdo individual.`, me);
  const owners = await db().select({ email: users.email }).from(users).where(and(eq(users.studioId, x.p.studio_id), eq(users.role, "dueno"), eq(users.active, true)));
  if (owners.length)
    await sendMail({
      to: owners.map((o) => o.email),
      subject: `${me.name} firmó un acuerdo por la Flota «${x.fleet.name}»`,
      html: mailLayout("Nuevo acuerdo de servicio", `<p><strong>${esc(me.name)}</strong> (${esc(me.email)}) aceptó tu propuesta para la Flota <strong>${esc(x.fleet.name)}</strong> como ${esc(profileLabel(x.member.profile))}. Ya está en tus organizaciones.</p>`, { href: `${getSiteUrl()}/admin/red/flotas`, label: "Ver acuerdos" }, "Faro"),
    }).catch(() => undefined);
  return { agreementId: a.id, organizationId: org.id, studioId: x.p.studio_id };
}

const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

/** Períodos (AAAA-MM) desde la firma hasta una fecha, inclusive */
function periodsBetween(from: Date, to: Date) {
  const out: string[] = [];
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
  while (d <= to && out.length < 240) {
    out.push(monthKey(d));
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return out;
}

/** Estado de cuenta de un acuerdo: pagado, pendiente y próximo vencimiento (pago mensual por adelantado) */
export async function accountState(a: typeof service_agreements.$inferSelect, until = new Date()) {
  const pays = await db().select().from(agreement_payments).where(eq(agreement_payments.agreement_id, a.id)).orderBy(asc(agreement_payments.period));
  const end = a.ends_on ? new Date(`${a.ends_on}T12:00:00Z`) : null;
  const due = periodsBetween(a.signed_at, end && end < until ? end : until);
  const paid = new Set(pays.map((p) => p.period));
  const pending = due.filter((p) => !paid.has(p));
  const next = new Date(Date.UTC(until.getUTCFullYear(), until.getUTCMonth() + 1, 1));
  return {
    payments: pays,
    paidPeriods: due.filter((p) => paid.has(p)),
    pendingPeriods: pending,
    pendingAmount: pending.length * a.monthly_price,
    nextDue: end && end < next ? null : next.toISOString().slice(0, 10),
    state: pending.length ? ("pendiente" as const) : ("al_dia" as const),
  };
}

export async function myAgreements(me: Me) {
  await finishDueAgreements();
  const rows = await db().select().from(service_agreements).where(eq(service_agreements.user_id, me.id)).orderBy(desc(service_agreements.created_at));
  return Promise.all(rows.map(async (a) => ({ a, account: await accountState(a) })));
}

async function ownAgreement(me: Me, id: string) {
  if (!UUID.test(id)) throw new FleetError("Acuerdo inválido.");
  const [a] = await db().select().from(service_agreements).where(and(eq(service_agreements.id, id), eq(service_agreements.user_id, me.id)));
  if (!a) throw new FleetError("Ese acuerdo no es tuyo.");
  return a;
}

/** Liquidación final si se da de baja hoy: fin con el preaviso, períodos pagados y saldo pendiente */
export async function finalSettlement(me: Me, id: string) {
  const a = await ownAgreement(me, id);
  if (a.status === "finalizado") throw new FleetError("Ese acuerdo ya terminó.");
  const endsOn = a.ends_on ? new Date(`${a.ends_on}T12:00:00Z`) : new Date(Date.now() + a.terms.noticeDays * 86400000);
  const st = await accountState({ ...a, ends_on: endsOn.toISOString().slice(0, 10) }, endsOn);
  return { agreement: a, endsOn: endsOn.toISOString().slice(0, 10), ...st };
}

export async function requestEnd(me: Me, id: string) {
  const s = await finalSettlement(me, id);
  if (s.agreement.status !== "activo") throw new FleetError("La baja ya está pedida.");
  await db().update(service_agreements).set({ status: "baja_solicitada", end_requested_at: new Date(), ends_on: s.endsOn }).where(eq(service_agreements.id, s.agreement.id));
  if (s.agreement.fleet_id) await event(s.agreement.fleet_id, `${me.name} dio de baja su acuerdo con el estudio (termina el ${s.endsOn}).`, me);
  await checkMinimums(s.agreement.fleet_id);
  return s;
}

/** Si una propuesta queda con menos acuerdos que su mínimo: aviso de 30 días antes de la tarifa normal */
export async function checkMinimums(fleetId: string | null) {
  if (!fleetId) return;
  const props = await db().select().from(fleet_proposals).where(eq(fleet_proposals.fleet_id, fleetId));
  for (const p of props) {
    const [{ n }] = await db()
      .select({ n: count() })
      .from(service_agreements)
      .where(and(eq(service_agreements.proposal_id, p.id), eq(service_agreements.status, "activo")));
    const [{ total }] = await db().select({ total: count() }).from(service_agreements).where(eq(service_agreements.proposal_id, p.id));
    if (total === 0) continue;
    if (n < p.min_members && !p.below_min_since) {
      const until = new Date(Date.now() + BELOW_MIN_NOTICE_DAYS * 86400000).toISOString().slice(0, 10);
      await db().update(fleet_proposals).set({ below_min_since: new Date() }).where(eq(fleet_proposals.id, p.id));
      await db()
        .update(service_agreements)
        .set({ group_price_until: until })
        .where(and(eq(service_agreements.proposal_id, p.id), eq(service_agreements.status, "activo")));
      await event(fleetId, `La Flota quedó con menos de ${p.min_members} acuerdos activos con el estudio. El precio grupal se mantiene hasta el ${until} (30 días de aviso); después rige la tarifa normal del estudio, salvo que vuelvan a ser ${p.min_members}.`);
      await mailMembers(fleetId, "Aviso: la Flota quedó debajo del mínimo", `<p>La Flota quedó con menos de ${p.min_members} acuerdos activos. El precio grupal se mantiene hasta el <strong>${until}</strong>. Podés seguir, invitar a más personas o dar de baja tu acuerdo desde «Mis servicios».</p>`);
    } else if (n >= p.min_members && p.below_min_since) {
      await db().update(fleet_proposals).set({ below_min_since: null }).where(eq(fleet_proposals.id, p.id));
      await db().update(service_agreements).set({ group_price_until: null }).where(eq(service_agreements.proposal_id, p.id));
      await event(fleetId, "La Flota volvió a cumplir el mínimo: sigue el precio grupal.");
    }
  }
}

// ── Lado del estudio ─────────────────────────────────────────────────

export async function studioAgreements(studioId: string) {
  await finishDueAgreements();
  const rows = await db()
    .select({ a: service_agreements })
    .from(service_agreements)
    .where(eq(service_agreements.studio_id, studioId))
    .orderBy(desc(service_agreements.created_at));
  return Promise.all(rows.map(async ({ a }) => ({ a, account: await accountState(a) })));
}

/** El estudio registra un pago de un período (solo de sus acuerdos) */
export async function registerPayment(studio: { id: string; userId: string }, agreementId: string, period: string, method: string) {
  if (!UUID.test(agreementId) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new FleetError("Dato inválido.");
  const [a] = await db().select().from(service_agreements).where(and(eq(service_agreements.id, agreementId), eq(service_agreements.studio_id, studio.id)));
  if (!a) throw new FleetError("Ese acuerdo no es de tu estudio.");
  await db()
    .insert(agreement_payments)
    .values({ agreement_id: a.id, period, amount: a.monthly_price, method: method.slice(0, 60) || null, registered_by: studio.userId })
    .onConflictDoNothing();
  return a;
}

/** Cierra los acuerdos con baja cuya fecha de fin ya pasó */
export async function finishDueAgreements() {
  await db()
    .update(service_agreements)
    .set({ status: "finalizado" })
    .where(and(eq(service_agreements.status, "baja_solicitada"), sql`${service_agreements.ends_on} < current_date`));
}
