import "server-only";
import { and, desc, eq, gte, inArray, isNull, lte, notInArray } from "drizzle-orm";
import { getDb } from "@/db";
import { account_connections, directory_profiles, bitacora_entries, box_entries, connection_actions, connection_messages, connection_ratings, service_agreements, studios, users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { esc, sendMail } from "@/lib/email";
import { mailLayout } from "@/lib/notify";
import { getSiteUrl } from "@/lib/runtime-config";
import { monthRange } from "@/modules/bitacora/catalog";
import { BUSINESS_CATEGORIES } from "@/modules/cajas/catalog";
import { businessBoxOf, businessSummary, openBusinessBox } from "@/modules/cajas/server";
import { notify } from "@/modules/notifications/server";

// Conexión con un contador (principios §2 y §4 a §9). Conexión, no copia: el
// estudio accede con un permiso sobre la cuenta del usuario y trabaja sobre
// sus datos en vivo; nada se copia a su espacio. Alcances: la caja de negocio
// y lo fiscal, siempre; las cajas personales, solo si el usuario las activa.
// Perilla de autonomía: «delegar y mirar» (por defecto) o «proponer y
// aprobar». Todo lo que hace el contador queda en «Lo que hizo tu contador».
// La desconexión es un cierre ordenado: en cierre (solo lectura 30 días),
// checklist, constancia de los dos y, si hay diferencias, en disputa.

export class ConexionError extends Error {}

const UUID = /^[0-9a-f-]{36}$/i;
const DAY = 86400000;
const db = () => getDb();
export type Connection = typeof account_connections.$inferSelect;
type Person = { id: string; name: string; email: string; studioId: string; role: string; tenantKind: string; assisted?: unknown };
type Staff = { id: string; name: string; email: string; studioId: string; role: string; tenantKind: string };

/** Estados en los que la conexión todavía está viva (una por persona a la vez) */
export const OPEN_STATES = ["invitada", "admision", "acuerdo", "activa", "en_cierre", "en_disputa"] as const;
const FINAL_STATES = ["cerrada", "rechazada", "cancelada"];
export const STATUS_LABEL: Record<string, string> = {
  invitada: "Invitación del estudio",
  admision: "En admisión",
  acuerdo: "Acuerdo para firmar",
  activa: "Conectada",
  en_cierre: "En cierre",
  en_disputa: "En disputa",
  cerrada: "Cerrada",
  rechazada: "No aceptada",
  cancelada: "Cancelada",
};
export const AUTONOMY_LABEL = { delegar: "Delegar y mirar", proponer: "Proponer y aprobar" } as const;
export const READONLY_DAYS = 30;
export const AGREEMENT_VERSION = "conexion-2026-10";

const isTitular = (u: Person) => u.role === "titular" && u.tenantKind !== "studio" && !u.assisted;
const isStaff = (u: Staff) => u.tenantKind === "studio" && ["dueno", "contador", "colaborador"].includes(u.role);
const canDecide = (u: Staff) => isStaff(u) && (u.role === "dueno" || u.role === "contador");

async function studioName(studioId: string) {
  return (await db().select({ name: studios.name }).from(studios).where(eq(studios.id, studioId)))[0]?.name ?? "el estudio";
}
async function staffOf(studioId: string) {
  return db().select({ id: users.id, email: users.email }).from(users).where(and(eq(users.studioId, studioId), inArray(users.role, ["dueno", "contador"]), eq(users.active, true)));
}
async function tellStudio(studioId: string, title: string, href: string, refId: string) {
  const list = await staffOf(studioId);
  await notify(list.map((u) => u.id), { kind: "aviso", title, href, refId }).catch(() => undefined);
}
async function tellUser(userId: string, title: string, body: string | undefined, refId: string) {
  await notify([userId], { kind: "aviso", title, body, href: "/contador", refId }).catch(() => undefined);
  const [u] = await db().select({ email: users.email, name: users.name }).from(users).where(eq(users.id, userId));
  if (u) await sendMail({ to: u.email, subject: title, html: mailLayout(title, `<p>Hola, ${esc(u.name.split(" ")[0] ?? "")}:</p><p>${esc(body ?? title)}</p>`, { href: `${getSiteUrl()}/contador`, label: "Ver en Faro" }, "Faro") }).catch(() => undefined);
}

// ── Lado del usuario ─────────────────────────────────────────────────

/** La conexión viva de la persona (o null): define el modo (autogestión o gestión profesional) */
export async function currentConnection(userId: string) {
  const [c] = await db()
    .select({ c: account_connections, studio: studios.name, slug: studios.slug, email: directory_profiles.contact_email })
    .from(account_connections)
    .innerJoin(studios, eq(studios.id, account_connections.studio_id))
    .leftJoin(directory_profiles, eq(directory_profiles.studio_id, studios.id))
    .where(and(eq(account_connections.user_id, userId), inArray(account_connections.status, [...OPEN_STATES])))
    .orderBy(desc(account_connections.created_at))
    .limit(1);
  return c ? { ...c.c, studioName: c.studio, studioSlug: c.slug, studioEmail: c.email } : null;
}

/** Modo de responsabilidad (§2): solo con una conexión activa (o en cierre) es gestión profesional */
export async function responsibilityMode(userId: string) {
  const c = await currentConnection(userId);
  const pro = !!c && ["activa", "en_cierre", "en_disputa"].includes(c.status);
  return { mode: pro ? ("profesional" as const) : ("autogestion" as const), connection: c };
}

/** Historial: el registro del período de cada relación cerrada */
export async function connectionHistory(userId: string) {
  return db()
    .select({ id: account_connections.id, status: account_connections.status, studio: studios.name, started: account_connections.started_at, closed: account_connections.closed_at, created: account_connections.created_at })
    .from(account_connections)
    .innerJoin(studios, eq(studios.id, account_connections.studio_id))
    .where(and(eq(account_connections.user_id, userId), inArray(account_connections.status, FINAL_STATES)))
    .orderBy(desc(account_connections.created_at));
}

async function ownConnection(userId: string, id: string) {
  if (!UUID.test(id)) throw new ConexionError("Conexión inválida.");
  const [c] = await db().select().from(account_connections).where(and(eq(account_connections.id, id), eq(account_connections.user_id, userId)));
  if (!c) throw new ConexionError("No encontramos esa conexión.");
  return c;
}

/** Solicitud desde la Red: la persona elige el estudio, los alcances y la autonomía */
export async function requestConnection(me: Person, studioSlug: string, input: { message?: string; scopePersonal?: boolean; autonomy?: string }) {
  if (!isTitular(me)) throw new ConexionError("Conectar un contador es para cuentas de personas y autónomos.");
  const [st] = await db().select({ id: studios.id, kind: studios.kind, name: studios.name }).from(studios).where(eq(studios.slug, studioSlug));
  if (!st || st.kind !== "studio") throw new ConexionError("Ese estudio no está disponible.");
  if (await currentConnection(me.id)) throw new ConexionError("Ya tenés una conexión en curso con un estudio. Cerrala antes de pedir otra.");
  const [c] = await db()
    .insert(account_connections)
    .values({ user_id: me.id, user_studio_id: me.studioId, studio_id: st.id, status: "admision", initiated_by: "usuario", scope_personal: !!input.scopePersonal, autonomy: input.autonomy === "proponer" ? "proponer" : "delegar", message: input.message?.trim().slice(0, 2000) || null, source: "red" })
    .returning();
  await audit({ studioId: me.studioId, actor: me, action: "conexion.solicitud", entityType: "conexion", entityId: c.id, metadata: { estudio: st.id, personal: c.scope_personal, autonomia: c.autonomy } });
  await audit({ studioId: st.id, actorLabel: me.email, action: "conexion.solicitud_recibida", entityType: "conexion", entityId: c.id });
  await tellStudio(st.id, `${me.name} quiere conectar su cuenta con el estudio`, `/admin/comercial/conexiones/${c.id}`, c.id);
  return c;
}

/** La persona acepta la invitación del estudio (eligiendo alcances y autonomía): pasa a admisión */
export async function acceptInvitation(me: Person, id: string, input: { scopePersonal?: boolean; autonomy?: string }) {
  const c = await ownConnection(me.id, id);
  if (c.status !== "invitada") throw new ConexionError("Esa invitación ya no está pendiente.");
  await db().update(account_connections).set({ status: "admision", scope_personal: !!input.scopePersonal, autonomy: input.autonomy === "proponer" ? "proponer" : "delegar" }).where(eq(account_connections.id, c.id));
  await audit({ studioId: me.studioId, actor: me, action: "conexion.invitacion_aceptada", entityType: "conexion", entityId: c.id, metadata: { personal: !!input.scopePersonal } });
  await tellStudio(c.studio_id, `${me.name} aceptó conectar su cuenta`, `/admin/comercial/conexiones/${c.id}`, c.id);
}

export async function declineInvitation(me: Person, id: string) {
  const c = await ownConnection(me.id, id);
  if (!["invitada", "admision", "acuerdo"].includes(c.status)) throw new ConexionError("Eso ya no se puede cancelar: iniciá el cierre.");
  await db().update(account_connections).set({ status: "cancelada", decided_at: new Date() }).where(eq(account_connections.id, c.id));
  await audit({ studioId: me.studioId, actor: me, action: "conexion.cancelada", entityType: "conexion", entityId: c.id });
  await tellStudio(c.studio_id, `${me.name} canceló la conexión`, `/admin/comercial/conexiones/${c.id}`, c.id);
}

export async function answerInfo(me: Person, id: string, text: string) {
  const c = await ownConnection(me.id, id);
  if (c.status !== "admision" || !c.info_request) throw new ConexionError("El estudio no te pidió información.");
  const answer = text.trim().slice(0, 2000);
  if (answer.length < 2) throw new ConexionError("Escribí tu respuesta.");
  await db().update(account_connections).set({ info_response: answer }).where(eq(account_connections.id, c.id));
  await audit({ studioId: me.studioId, actor: me, action: "conexion.info_respondida", entityType: "conexion", entityId: c.id });
  await tellStudio(c.studio_id, `${me.name} respondió lo que le pediste`, `/admin/comercial/conexiones/${c.id}`, c.id);
}

/** La persona firma el acuerdo de servicio (el de Flotas) y acepta las políticas */
export async function signAsUser(me: Person, id: string, signedName: string, acceptPolicies: boolean) {
  const c = await ownConnection(me.id, id);
  if (c.status !== "acuerdo") throw new ConexionError("Todavía no hay un acuerdo para firmar.");
  if (!acceptPolicies) throw new ConexionError("Para conectar tenés que aceptar las políticas.");
  const norm = (s: string) => s.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");
  if (norm(signedName) !== norm(me.name)) throw new ConexionError(`Para firmar, escribí tu nombre tal como figura en tu cuenta: ${me.name}.`);
  await db().update(account_connections).set({ user_signed_name: signedName.trim(), user_signed_at: new Date(), policies_accepted_at: new Date() }).where(eq(account_connections.id, c.id));
  await audit({ studioId: me.studioId, actor: me, action: "conexion.firma_usuario", entityType: "conexion", entityId: c.id });
  await maybeActivate(c.id);
}

/** Con las dos firmas, la conexión se activa y queda el acuerdo de servicio */
async function maybeActivate(id: string) {
  const [c] = await db().select().from(account_connections).where(eq(account_connections.id, id));
  if (!c || c.status !== "acuerdo" || !c.user_signed_at || !c.studio_signed_at || !c.terms) return false;
  const [u] = await db().select({ name: users.name, email: users.email }).from(users).where(eq(users.id, c.user_id));
  const name = await studioName(c.studio_id);
  const [ag] = await db()
    .insert(service_agreements)
    .values({ studio_id: c.studio_id, user_id: c.user_id, member_name: u.name, member_email: u.email, profile: "conexion", monthly_price: Math.round(c.terms.monthlyPrice), terms: { includes: c.terms.services, minMembers: 1, noticeDays: c.terms.noticeDays, studioName: name, fleetName: "", version: c.terms.version }, status: "activo", signed_name: c.user_signed_name!, signed_at: c.user_signed_at })
    .returning({ id: service_agreements.id });
  await db().update(account_connections).set({ status: "activa", started_at: new Date(), agreement_id: ag.id }).where(eq(account_connections.id, c.id));
  await audit({ studioId: c.studio_id, actorLabel: "Faro", action: "conexion.activa", entityType: "conexion", entityId: c.id, metadata: { acuerdo: ag.id } });
  await audit({ studioId: c.user_studio_id, actorLabel: "Faro", action: "conexion.activa", entityType: "conexion", entityId: c.id, metadata: { estudio: c.studio_id } });
  await tellUser(c.user_id, `Ya estás conectado con ${name}`, "Desde ahora la gestión profesional queda a cargo de tu contador. Ves todo lo que hace en «Lo que hizo tu contador».", c.id);
  await tellStudio(c.studio_id, `${u.name} ya es una cuenta conectada`, `/admin/organizaciones/cuenta/${c.id}`, c.id);
  return true;
}

export async function setAutonomy(me: Person, id: string, autonomy: string) {
  const c = await ownConnection(me.id, id);
  if (!["admision", "acuerdo", "activa"].includes(c.status)) throw new ConexionError("Ahora no se puede cambiar.");
  const value = autonomy === "proponer" ? "proponer" : "delegar";
  await db().update(account_connections).set({ autonomy: value }).where(eq(account_connections.id, c.id));
  await audit({ studioId: me.studioId, actor: me, action: "conexion.autonomia", entityType: "conexion", entityId: c.id, metadata: { antes: c.autonomy, despues: value } });
  await tellStudio(c.studio_id, `${me.name} cambió cómo trabajan: ${AUTONOMY_LABEL[value]}`, `/admin/organizaciones/cuenta/${c.id}`, c.id);
}

export async function setScopes(me: Person, id: string, personal: boolean) {
  const c = await ownConnection(me.id, id);
  if (!OPEN_STATES.includes(c.status as never)) throw new ConexionError("Esa conexión ya terminó.");
  await db().update(account_connections).set({ scope_personal: personal }).where(eq(account_connections.id, c.id));
  await audit({ studioId: me.studioId, actor: me, action: "conexion.alcance", entityType: "conexion", entityId: c.id, metadata: { cajas_personales: personal } });
}

export async function setWeekly(me: Person, id: string, on: boolean) {
  const c = await ownConnection(me.id, id);
  await db().update(account_connections).set({ weekly_summary: on }).where(eq(account_connections.id, c.id));
}

// ── Lado del estudio ─────────────────────────────────────────────────

/** Invitación del estudio a una persona que ya usa Faro */
export async function inviteClient(staff: Staff, email: string, message?: string) {
  if (!canDecide(staff)) throw new ConexionError("Solo el dueño o un contador del estudio invita.");
  const e = email.trim().toLowerCase();
  const [u] = await db().select({ id: users.id, name: users.name, role: users.role, studioId: users.studioId, kind: studios.kind }).from(users).leftJoin(studios, eq(studios.id, users.studioId)).where(eq(users.email, e));
  if (!u || u.role !== "titular" || !u.kind || u.kind === "studio") throw new ConexionError("Esa persona todavía no tiene una cuenta personal en Faro. Pedile que la cree gratis en Faro y volvé a invitarla.");
  if (await currentConnection(u.id)) throw new ConexionError("Esa persona ya tiene una conexión en curso con un estudio.");
  const [c] = await db()
    .insert(account_connections)
    .values({ user_id: u.id, user_studio_id: u.studioId, studio_id: staff.studioId, status: "invitada", initiated_by: "estudio", message: message?.trim().slice(0, 2000) || null, source: "invitacion" })
    .returning();
  await audit({ studioId: staff.studioId, actor: staff, action: "conexion.invitacion", entityType: "conexion", entityId: c.id, metadata: { para: e } });
  await tellUser(u.id, `${await studioName(staff.studioId)} te invita a conectar tu cuenta`, "Elegís qué compartir: la caja de negocio y lo fiscal siempre; lo personal, solo si querés. Lo podés revocar cuando quieras.", c.id);
  return c;
}

export async function studioConnections(staff: Staff) {
  if (!isStaff(staff)) return [];
  return db()
    .select({ c: account_connections, name: users.name, email: users.email })
    .from(account_connections)
    .innerJoin(users, eq(users.id, account_connections.user_id))
    .where(eq(account_connections.studio_id, staff.studioId))
    .orderBy(desc(account_connections.updated_at));
}

export type AccessLevel = "admision" | "total" | "lectura";

/**
 * ¿Qué puede ver y hacer el estudio sobre esta cuenta? Solo su propio estudio:
 * en admisión ve el resumen de lo autorizado; conectada, todo lo autorizado;
 * en cierre o en disputa, solo lectura durante 30 días. Sin conexión o
 * cerrada: nada.
 */
export async function studioAccess(staff: Staff, id: string): Promise<{ conn: Connection; level: AccessLevel } | null> {
  if (!isStaff(staff) || !UUID.test(id)) return null;
  const [c] = await db().select().from(account_connections).where(and(eq(account_connections.id, id), eq(account_connections.studio_id, staff.studioId)));
  if (!c) return null;
  if (c.status === "admision" || c.status === "acuerdo") return { conn: c, level: "admision" };
  if (c.status === "activa") return { conn: c, level: "total" };
  if ((c.status === "en_cierre" || c.status === "en_disputa") && c.readonly_until && c.readonly_until > new Date()) return { conn: c, level: "lectura" };
  return null;
}

/** Para las pantallas del estudio: la ficha de la conexión aunque ya no haya acceso a los datos */
export async function studioConnection(staff: Staff, id: string) {
  if (!isStaff(staff) || !UUID.test(id)) return null;
  const [r] = await db()
    .select({ c: account_connections, name: users.name, email: users.email })
    .from(account_connections)
    .innerJoin(users, eq(users.id, account_connections.user_id))
    .where(and(eq(account_connections.id, id), eq(account_connections.studio_id, staff.studioId)));
  return r ?? null;
}

async function needStudio(staff: Staff, id: string, states: string[]) {
  if (!canDecide(staff)) throw new ConexionError("Solo el dueño o un contador del estudio.");
  const r = await studioConnection(staff, id);
  if (!r) throw new ConexionError("No encontramos esa conexión.");
  if (!states.includes(r.c.status)) throw new ConexionError("Eso no se puede hacer en este momento de la conexión.");
  return r;
}

export async function requestInterview(staff: Staff, id: string, note: string) {
  const { c, name } = await needStudio(staff, id, ["admision"]);
  await db().update(account_connections).set({ interview_requested_at: new Date(), interview_note: note.trim().slice(0, 1000) || null }).where(eq(account_connections.id, c.id));
  await audit({ studioId: staff.studioId, actor: staff, action: "conexion.entrevista", entityType: "conexion", entityId: c.id });
  await tellUser(c.user_id, `${await studioName(staff.studioId)} te pide una entrevista`, note || "Elegí un horario en su agenda.", c.id);
  return name;
}

export async function requestInfo(staff: Staff, id: string, text: string) {
  const { c } = await needStudio(staff, id, ["admision"]);
  const q = text.trim().slice(0, 2000);
  if (q.length < 3) throw new ConexionError("Escribí qué información necesitás.");
  await db().update(account_connections).set({ info_request: q, info_response: null }).where(eq(account_connections.id, c.id));
  await audit({ studioId: staff.studioId, actor: staff, action: "conexion.info_pedida", entityType: "conexion", entityId: c.id });
  await tellUser(c.user_id, `${await studioName(staff.studioId)} te pide más información`, q, c.id);
}

/** Aceptar (con las condiciones del acuerdo) o rechazar con motivo */
export async function decide(staff: Staff, id: string, input: { accept: boolean; reason: string; services?: string; monthlyPrice?: number; noticeDays?: number }) {
  const { c } = await needStudio(staff, id, ["admision"]);
  const reason = input.reason.trim().slice(0, 1000);
  if (!input.accept) {
    if (reason.length < 3) throw new ConexionError("Contale el motivo: lo ve la persona.");
    await db().update(account_connections).set({ status: "rechazada", decision_reason: reason, decided_by: staff.id, decided_at: new Date() }).where(eq(account_connections.id, c.id));
    await audit({ studioId: staff.studioId, actor: staff, action: "conexion.rechazada", entityType: "conexion", entityId: c.id, metadata: { motivo: reason } });
    await tellUser(c.user_id, `${await studioName(staff.studioId)} no puede tomar tu cuenta`, reason, c.id);
    return;
  }
  const services = (input.services ?? "").trim().slice(0, 2000);
  if (services.length < 5) throw new ConexionError("Detallá qué servicios incluye el acuerdo.");
  const price = Number(input.monthlyPrice);
  if (!(price >= 0) || price > 1e9) throw new ConexionError("Revisá los honorarios por mes.");
  const notice = Math.min(90, Math.max(0, Math.round(input.noticeDays ?? 30)));
  await db()
    .update(account_connections)
    .set({ status: "acuerdo", decision_reason: reason || null, decided_by: staff.id, decided_at: new Date(), terms: { services, monthlyPrice: Math.round(price), noticeDays: notice, version: AGREEMENT_VERSION } })
    .where(eq(account_connections.id, c.id));
  await audit({ studioId: staff.studioId, actor: staff, action: "conexion.aceptada", entityType: "conexion", entityId: c.id, metadata: { honorarios: price, preaviso: notice } });
  await tellUser(c.user_id, `${await studioName(staff.studioId)} aceptó: falta firmar el acuerdo`, "Revisá las condiciones, firmá y aceptá las políticas para conectarte.", c.id);
}

export async function signAsStudio(staff: Staff, id: string, signedName: string) {
  const { c } = await needStudio(staff, id, ["acuerdo"]);
  const n = signedName.trim();
  if (n.length < 3) throw new ConexionError("Escribí tu nombre para firmar.");
  await db().update(account_connections).set({ studio_signed_by: staff.id, studio_signed_name: n, studio_signed_at: new Date() }).where(eq(account_connections.id, c.id));
  await audit({ studioId: staff.studioId, actor: staff, action: "conexion.firma_estudio", entityType: "conexion", entityId: c.id });
  await maybeActivate(c.id);
}

// ── Datos en vivo (el mismo formato para cualquier estudio) ─────────

/** Lo que el estudio ve de la cuenta, según el permiso y los alcances. Nada más */
export async function liveView(staff: Staff, id: string, month: string) {
  const acc = await studioAccess(staff, id);
  if (!acc) return null;
  const c = acc.conn;
  const owner = { id: c.user_id };
  const [u] = await db().select({ name: users.name, email: users.email, studioId: users.studioId }).from(users).where(eq(users.id, c.user_id));
  const [tenant] = u?.studioId ? await db().select({ kind: studios.kind, cuit: studios.cuit, taxRegime: studios.tax_regime }).from(studios).where(eq(studios.id, u.studioId)) : [];
  const box = await businessBoxOf(c.user_id);
  const { from, to } = monthRange(month);
  const [summary, entries] = box
    ? await Promise.all([
        businessSummary(owner, box.id, month),
        db().select().from(box_entries).where(and(eq(box_entries.box_id, box.id), isNull(box_entries.deleted_at), gte(box_entries.date, from), lte(box_entries.date, to))).orderBy(desc(box_entries.date)),
      ])
    : [null, []];
  // Lo fiscal: el semáforo y la situación (autónomos)
  let fiscal: { semaforo: string | null; light: string | null; cuit: string | null; regime: string | null } = { semaforo: null, light: null, cuit: tenant?.cuit ?? null, regime: tenant?.taxRegime ?? null };
  if (tenant?.kind === "personal") {
    const { personalIssuer, semaforoFor } = await import("@/modules/arca/server");
    const scope = await personalIssuer({ id: c.user_id, role: "titular", studioId: u.studioId!, tenantKind: "personal" } as never).catch(() => null);
    const s = scope ? await semaforoFor(scope).catch(() => null) : null;
    if (s) fiscal = { ...fiscal, semaforo: s.message, light: s.light };
  }
  // Las cajas personales, solo con el alcance activado por el usuario
  const personal = c.scope_personal
    ? await db().select().from(bitacora_entries).where(and(eq(bitacora_entries.user_id, c.user_id), isNull(bitacora_entries.deleted_at), gte(bitacora_entries.date, from), lte(bitacora_entries.date, to))).orderBy(desc(bitacora_entries.date)).limit(200)
    : null;
  return { conn: c, level: acc.level, person: { name: u?.name ?? "", email: u?.email ?? "" }, tenantKind: tenant?.kind ?? null, box, summary, entries, fiscal, personal };
}

/** Resumen para la admisión: solo lo autorizado (caja de negocio y fiscal, y lo personal si lo activó) */
export const admissionSummary = liveView;

// ── Acciones del contador (delegar y mirar / proponer y aprobar) ─────

type BusinessOp =
  | { op: "crear_movimiento"; kind: "gasto" | "ingreso"; amount: number; date: string; category: string; description: string; invoiced?: boolean; deductible?: boolean }
  | { op: "editar_movimiento"; entryId: string; category?: string; deductible?: boolean; invoiced?: boolean };

const describeOp = (o: BusinessOp, before?: { description: string } | null) =>
  o.op === "crear_movimiento" ? `Cargó ${o.kind === "ingreso" ? "un ingreso" : "un gasto"} en la caja de negocio: ${o.description}` : `Cambió ${before?.description ?? "un movimiento"} de la caja de negocio`;

async function applyOp(c: Connection, actor: { id: string }, o: BusinessOp) {
  const box = (await businessBoxOf(c.user_id)) ?? (await openBusinessBox({ id: c.user_id }));
  if (o.op === "crear_movimiento") {
    if (!Number.isInteger(o.amount) || o.amount <= 0) throw new ConexionError("Revisá el monto.");
    const category = BUSINESS_CATEGORIES.some((x) => x.key === o.category) ? o.category : "otros";
    const [row] = await db()
      .insert(box_entries)
      .values({ box_id: box.id, created_by: actor.id, paid_by: c.user_id, kind: o.kind, amount: o.amount, date: o.date, category, description: o.description.trim().slice(0, 160) || "Movimiento", invoiced: o.kind === "ingreso" && !!o.invoiced, deductible: o.kind === "gasto" && !!o.deductible, source: "contador" })
      .returning();
    return { entityId: row.id, before: null, after: { monto: row.amount / 100, categoria: row.category, descripcion: row.description } };
  }
  if (!UUID.test(o.entryId)) throw new ConexionError("Movimiento inválido.");
  const [e] = await db().select().from(box_entries).where(and(eq(box_entries.id, o.entryId), eq(box_entries.box_id, box.id), isNull(box_entries.deleted_at)));
  if (!e) throw new ConexionError("Ese movimiento no es de la caja de negocio de esta cuenta.");
  const set = {
    ...(o.category && BUSINESS_CATEGORIES.some((x) => x.key === o.category) ? { category: o.category } : {}),
    ...(o.deductible !== undefined && e.kind === "gasto" ? { deductible: o.deductible } : {}),
    ...(o.invoiced !== undefined && e.kind === "ingreso" ? { invoiced: o.invoiced } : {}),
  };
  if (!Object.keys(set).length) throw new ConexionError("No hay nada para cambiar.");
  await db().update(box_entries).set(set).where(eq(box_entries.id, e.id));
  return { entityId: e.id, before: { categoria: e.category, deducible: e.deductible, facturado: e.invoiced, descripcion: e.description }, after: { categoria: set.category ?? e.category, deducible: set.deductible ?? e.deductible, facturado: set.invoiced ?? e.invoiced } };
}

/**
 * El contador opera sobre la caja de negocio de la cuenta. Con «delegar y
 * mirar» se aplica y queda a la vista; con «proponer y aprobar» queda para
 * que el usuario la apruebe. Siempre con quién, qué, cuándo, antes y después.
 */
export async function studioAct(staff: Staff, id: string, o: BusinessOp) {
  const acc = await studioAccess(staff, id);
  if (!acc) throw new ConexionError("Esta cuenta ya no está conectada con el estudio.");
  if (acc.level !== "total") throw new ConexionError(acc.level === "lectura" ? "La conexión está en cierre: solo lectura." : "Todavía no están conectados.");
  if (!canDecide(staff)) throw new ConexionError("Solo el dueño o un contador del estudio.");
  const c = acc.conn;
  let before: { description: string } | null = null;
  if (o.op === "editar_movimiento" && UUID.test(o.entryId)) [before] = await db().select({ description: box_entries.description }).from(box_entries).where(eq(box_entries.id, o.entryId));
  const summary = describeOp(o, before);
  if (c.autonomy === "proponer") {
    const [row] = await db().insert(connection_actions).values({ connection_id: c.id, actor_id: staff.id, actor_name: staff.name, action: o.op, summary, entity_type: "movimiento_negocio", entity_id: o.op === "editar_movimiento" ? o.entryId : null, payload: o, status: "propuesta" }).returning();
    await audit({ studioId: staff.studioId, actor: staff, action: "conexion.accion_propuesta", entityType: "conexion", entityId: c.id, metadata: { accion: o.op } });
    await tellUser(c.user_id, "Tu contador te propone un cambio", summary, row.id);
    return { status: "propuesta" as const, id: row.id };
  }
  const r = await applyOp(c, staff, o);
  const [row] = await db().insert(connection_actions).values({ connection_id: c.id, actor_id: staff.id, actor_name: staff.name, action: o.op, summary, entity_type: "movimiento_negocio", entity_id: r.entityId, before: r.before, after: r.after, status: "aplicada" }).returning();
  await audit({ studioId: staff.studioId, actor: staff, action: "conexion.accion", entityType: "conexion", entityId: c.id, metadata: { accion: o.op, movimiento: r.entityId } });
  return { status: "aplicada" as const, id: row.id };
}

/** El usuario aprueba o rechaza lo que propuso su contador */
export async function decideAction(me: Person, actionId: string, approve: boolean) {
  if (!UUID.test(actionId)) throw new ConexionError("Propuesta inválida.");
  const [a] = await db().select({ a: connection_actions, c: account_connections }).from(connection_actions).innerJoin(account_connections, eq(account_connections.id, connection_actions.connection_id)).where(and(eq(connection_actions.id, actionId), eq(account_connections.user_id, me.id)));
  if (!a) throw new ConexionError("No encontramos esa propuesta.");
  if (a.a.status !== "propuesta") throw new ConexionError("Esa propuesta ya se resolvió.");
  if (!approve) {
    await db().update(connection_actions).set({ status: "rechazada", decided_at: new Date() }).where(eq(connection_actions.id, a.a.id));
  } else {
    if (a.c.status !== "activa") throw new ConexionError("La conexión ya no está activa.");
    const r = await applyOp(a.c, { id: a.a.actor_id ?? me.id }, a.a.payload as BusinessOp);
    await db().update(connection_actions).set({ status: "aprobada", decided_at: new Date(), entity_id: r.entityId, before: r.before, after: r.after }).where(eq(connection_actions.id, a.a.id));
  }
  await audit({ studioId: me.studioId, actor: me, action: approve ? "conexion.propuesta_aprobada" : "conexion.propuesta_rechazada", entityType: "conexion", entityId: a.c.id, metadata: { propuesta: a.a.id } });
  await tellStudio(a.c.studio_id, `${me.name} ${approve ? "aprobó" : "rechazó"}: ${a.a.summary}`, `/admin/organizaciones/cuenta/${a.c.id}`, a.c.id);
}

/** «Lo que hizo tu contador», con filtros */
export async function actionsFor(userId: string, connId: string, f: { status?: string; from?: string; to?: string } = {}) {
  const c = await ownConnection(userId, connId);
  const conds = [eq(connection_actions.connection_id, c.id)];
  if (f.status && ["aplicada", "propuesta", "aprobada", "rechazada"].includes(f.status)) conds.push(eq(connection_actions.status, f.status));
  if (f.from && /^\d{4}-\d{2}-\d{2}$/.test(f.from)) conds.push(gte(connection_actions.created_at, new Date(`${f.from}T00:00:00-03:00`)));
  if (f.to && /^\d{4}-\d{2}-\d{2}$/.test(f.to)) conds.push(lte(connection_actions.created_at, new Date(`${f.to}T23:59:59-03:00`)));
  return db().select().from(connection_actions).where(and(...conds)).orderBy(desc(connection_actions.created_at)).limit(200);
}

export async function studioActions(staff: Staff, connId: string) {
  const r = await studioConnection(staff, connId);
  if (!r) return [];
  return db().select().from(connection_actions).where(eq(connection_actions.connection_id, r.c.id)).orderBy(desc(connection_actions.created_at)).limit(100);
}

// ── Desconexión con mediación ────────────────────────────────────────

type Side = "usuario" | "estudio";

async function sideConn(actor: Person | Staff, id: string, side: Side) {
  if (side === "usuario") return ownConnection(actor.id, id);
  const r = await studioConnection(actor as Staff, id);
  if (!r || !canDecide(actor as Staff)) throw new ConexionError("No encontramos esa conexión.");
  return r.c;
}

/** Cualquiera de las partes inicia el cierre, con motivo: solo lectura por 30 días */
export async function startClosing(actor: Person | Staff, side: Side, id: string, reason: string) {
  const c = await sideConn(actor, id, side);
  if (c.status !== "activa") throw new ConexionError("Solo se puede cerrar una conexión activa.");
  const r = reason.trim().slice(0, 1000);
  if (r.length < 3) throw new ConexionError("Contá el motivo del cierre.");
  await db().update(account_connections).set({ status: "en_cierre", closing_started_at: new Date(), closing_initiated_by: side, closing_reason: r, readonly_until: new Date(Date.now() + READONLY_DAYS * DAY) }).where(eq(account_connections.id, c.id));
  await audit({ studioId: actor.studioId, actor, action: "conexion.cierre_iniciado", entityType: "conexion", entityId: c.id, metadata: { quien: side, motivo: r } });
  if (side === "usuario") await tellStudio(c.studio_id, "Una cuenta conectada inició el cierre", `/admin/organizaciones/cuenta/${c.id}`, c.id);
  else await tellUser(c.user_id, `${await studioName(c.studio_id)} inició el cierre de la conexión`, r, c.id);
}

/** Checklist del cierre: honorarios en cero y pendientes entregados (estudio), y la constancia de los dos */
export async function closingCheck(actor: Person | Staff, side: Side, id: string, item: "honorarios" | "pendientes" | "constancia") {
  const c = await sideConn(actor, id, side);
  if (c.status !== "en_cierre") throw new ConexionError(c.status === "en_disputa" ? "Hay una disputa abierta: resuélvanla primero." : "La conexión no está en cierre.");
  const now = new Date();
  const set = item === "constancia" ? (side === "usuario" ? { user_clear_at: now } : { studio_clear_at: now }) : side !== "estudio" ? null : item === "honorarios" ? { fees_zero_at: now } : { pending_delivered_at: now };
  if (!set) throw new ConexionError("Eso lo confirma el estudio.");
  await db().update(account_connections).set(set).where(eq(account_connections.id, c.id));
  await audit({ studioId: actor.studioId, actor, action: "conexion.cierre_check", entityType: "conexion", entityId: c.id, metadata: { quien: side, item } });
  return maybeClose(c.id);
}

async function maybeClose(id: string) {
  const [c] = await db().select().from(account_connections).where(eq(account_connections.id, id));
  if (!c || c.status !== "en_cierre" || !c.fees_zero_at || !c.pending_delivered_at || !c.user_clear_at || !c.studio_clear_at) return false;
  await db().update(account_connections).set({ status: "cerrada", closed_at: new Date(), readonly_until: null }).where(eq(account_connections.id, c.id));
  if (c.agreement_id) await db().update(service_agreements).set({ status: "finalizado", ends_on: new Date().toISOString().slice(0, 10) }).where(eq(service_agreements.id, c.agreement_id));
  await audit({ studioId: c.studio_id, actorLabel: "Faro", action: "conexion.cerrada", entityType: "conexion", entityId: c.id, metadata: { desde: c.started_at, hasta: new Date() } });
  await audit({ studioId: c.user_studio_id, actorLabel: "Faro", action: "conexion.cerrada", entityType: "conexion", entityId: c.id });
  await tellUser(c.user_id, "La conexión con tu contador quedó cerrada", "Tus datos siguen en tu cuenta, donde siempre estuvieron. El estudio ya no tiene acceso. Contanos cómo fue.", c.id);
  await tellStudio(c.studio_id, "Se cerró una conexión", `/admin/comercial/conexiones/${c.id}`, c.id);
  return true;
}

/** Si hay diferencias: en disputa, con un canal de mensajes */
export async function openDispute(actor: Person | Staff, side: Side, id: string, message: string) {
  const c = await sideConn(actor, id, side);
  if (c.status !== "en_cierre") throw new ConexionError("Solo se abre una disputa durante el cierre.");
  const m = message.trim().slice(0, 2000);
  if (m.length < 3) throw new ConexionError("Contá cuál es la diferencia.");
  await db().update(account_connections).set({ status: "en_disputa", user_clear_at: null, studio_clear_at: null }).where(eq(account_connections.id, c.id));
  await db().insert(connection_messages).values({ connection_id: c.id, author_id: actor.id, side, body: m });
  await audit({ studioId: actor.studioId, actor, action: "conexion.disputa", entityType: "conexion", entityId: c.id, metadata: { quien: side } });
  if (side === "usuario") await tellStudio(c.studio_id, "Una cuenta conectada abrió una disputa en el cierre", `/admin/organizaciones/cuenta/${c.id}`, c.id);
  else await tellUser(c.user_id, "El estudio marcó una diferencia en el cierre", m, c.id);
}

export async function postDisputeMessage(actor: Person | Staff, side: Side, id: string, message: string) {
  const c = await sideConn(actor, id, side);
  if (c.status !== "en_disputa") throw new ConexionError("No hay una disputa abierta.");
  const m = message.trim().slice(0, 2000);
  if (!m) throw new ConexionError("Escribí el mensaje.");
  await db().insert(connection_messages).values({ connection_id: c.id, author_id: actor.id, side, body: m });
  if (side === "usuario") await tellStudio(c.studio_id, "Mensaje nuevo en la disputa de cierre", `/admin/organizaciones/cuenta/${c.id}`, c.id);
  else await tellUser(c.user_id, "Mensaje nuevo del estudio sobre el cierre", m, c.id);
}

export async function resolveDispute(actor: Person | Staff, side: Side, id: string) {
  const c = await sideConn(actor, id, side);
  if (c.status !== "en_disputa") throw new ConexionError("No hay una disputa abierta.");
  await db().update(account_connections).set({ status: "en_cierre" }).where(eq(account_connections.id, c.id));
  await db().insert(connection_messages).values({ connection_id: c.id, author_id: actor.id, side, body: "Damos por resuelta la diferencia. Seguimos con el cierre." });
  await audit({ studioId: actor.studioId, actor, action: "conexion.disputa_resuelta", entityType: "conexion", entityId: c.id, metadata: { quien: side } });
}

export async function disputeMessages(connId: string) {
  return db().select({ m: connection_messages, name: users.name }).from(connection_messages).leftJoin(users, eq(users.id, connection_messages.author_id)).where(eq(connection_messages.connection_id, connId)).orderBy(connection_messages.created_at);
}

// ── Calificaciones en dos momentos (§9): solo se guardan ────────────

/** ¿Hay una encuesta pendiente? A los 30 días de conectar y después cada 6 meses; y una al cerrar */
export async function surveyDue(userId: string): Promise<{ connId: string; kind: "periodica" | "cierre"; studio: string } | null> {
  const rows = await db()
    .select({ c: account_connections, studio: studios.name })
    .from(account_connections)
    .innerJoin(studios, eq(studios.id, account_connections.studio_id))
    .where(and(eq(account_connections.user_id, userId), inArray(account_connections.status, ["activa", "cerrada"])))
    .orderBy(desc(account_connections.created_at))
    .limit(5);
  for (const { c, studio } of rows) {
    const ratings = await db().select().from(connection_ratings).where(eq(connection_ratings.connection_id, c.id)).orderBy(desc(connection_ratings.created_at));
    if (c.status === "cerrada") {
      if (!ratings.some((r) => r.kind === "cierre")) return { connId: c.id, kind: "cierre", studio };
      continue;
    }
    if (!c.started_at) continue;
    const last = ratings.find((r) => r.kind === "periodica");
    const due = last ? last.created_at.getTime() + 182 * DAY : c.started_at.getTime() + 30 * DAY;
    if (Date.now() >= due) return { connId: c.id, kind: "periodica", studio };
  }
  return null;
}

export async function rate(me: Person, connId: string, kind: "periodica" | "cierre", input: { score?: number; comment?: string; skip?: boolean }) {
  const c = await ownConnection(me.id, connId);
  if (kind === "cierre" ? c.status !== "cerrada" : c.status !== "activa") throw new ConexionError("Esa encuesta no corresponde ahora.");
  const score = input.skip ? null : Math.round(Number(input.score));
  if (!input.skip && !(score! >= 1 && score! <= 5)) throw new ConexionError("Elegí de 1 a 5.");
  await db().insert(connection_ratings).values({ connection_id: c.id, kind, score, comment: input.skip ? null : input.comment?.trim().slice(0, 1000) || null, skipped: !!input.skip });
  await audit({ studioId: me.studioId, actor: me, action: input.skip ? "conexion.encuesta_salteada" : "conexion.calificacion", entityType: "conexion", entityId: c.id, metadata: { tipo: kind } });
}

/** El estudio ve sus calificaciones (privadas: no cambia lo que se muestra en público) */
export async function studioRatings(staff: Staff) {
  if (!isStaff(staff)) return [];
  return db()
    .select({ r: connection_ratings, name: users.name })
    .from(connection_ratings)
    .innerJoin(account_connections, eq(account_connections.id, connection_ratings.connection_id))
    .innerJoin(users, eq(users.id, account_connections.user_id))
    .where(and(eq(account_connections.studio_id, staff.studioId), eq(connection_ratings.skipped, false)))
    .orderBy(desc(connection_ratings.created_at));
}

// ── Resumen semanal opcional ─────────────────────────────────────────

export async function sendWeeklySummaries(now = new Date()) {
  const due = await db()
    .select()
    .from(account_connections)
    .where(and(eq(account_connections.weekly_summary, true), notInArray(account_connections.status, FINAL_STATES)));
  let n = 0;
  for (const c of due) {
    if (c.weekly_sent_at && now.getTime() - c.weekly_sent_at.getTime() < 6.5 * DAY) continue;
    const since = c.weekly_sent_at ?? new Date(now.getTime() - 7 * DAY);
    const list = await db().select().from(connection_actions).where(and(eq(connection_actions.connection_id, c.id), gte(connection_actions.created_at, since)));
    await db().update(account_connections).set({ weekly_sent_at: now }).where(eq(account_connections.id, c.id));
    if (!list.length) continue;
    await tellUser(c.user_id, `Tu contador hizo ${list.length} ${list.length === 1 ? "cosa" : "cosas"} esta semana`, list.slice(0, 8).map((a) => a.summary).join(" · "), c.id);
    n++;
  }
  return n;
}

/** Cierres que vencieron: pasados los 30 días de solo lectura, el estudio ya no ve nada (la conexión sigue esperando la constancia) */
export const isReadonlyExpired = (c: Pick<Connection, "status" | "readonly_until">) => (c.status === "en_cierre" || c.status === "en_disputa") && !!c.readonly_until && c.readonly_until <= new Date();
