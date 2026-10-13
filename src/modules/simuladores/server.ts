import "server-only";
import { and, desc, eq, inArray, isNull, like, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { guide_checks, organizations, service_modes, simulator_events, simulator_state, studios, users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { isUuid } from "@/lib/ids";
import { isMode, isService, markFor, modeAllowed, resolveMode, SERVICES, type Mode, type Service } from "./core";

// Parte C · Modos de servicio por estudio u organización (Faro Manager →
// Plataforma → Integraciones) y el estado y la bitácora de los simuladores.

const db = () => getDb();
export class ModeError extends Error {}
type Actor = { id: string; email: string };
export const simulatorsAllowed = () => process.env.ALLOW_SIMULATORS === "true";

async function isDemo(studioId: string) {
  const [s] = await db().select({ demo: studios.is_demo }).from(studios).where(eq(studios.id, studioId));
  return !!s?.demo;
}

/** Modo de un servicio para un estudio (y, si se pasa, una organización) */
export async function modeOf(studioId: string | null | undefined, organizationId: string | null | undefined, service: Service): Promise<Mode> {
  if (!studioId || !isUuid(studioId)) return "real";
  const rows = await db().select().from(service_modes).where(and(eq(service_modes.studio_id, studioId), eq(service_modes.service, service)));
  const studio = rows.find((r) => r.organization_id === null)?.mode;
  const org = organizationId ? rows.find((r) => r.organization_id === organizationId)?.mode : null;
  return resolveMode({ org, studio, demo: await isDemo(studioId) });
}

/** Marca de la pantalla (Parte C · C6): «simulador» si algún servicio del espacio (o de la organización) está simulado, «prueba» si alguno usa su ambiente de prueba */
export async function markOf(studioId: string, organizationId: string | null = null) {
  if (!isUuid(studioId)) return null;
  const [rows, demo] = await Promise.all([db().select({ org: service_modes.organization_id, mode: service_modes.mode }).from(service_modes).where(eq(service_modes.studio_id, studioId)), isDemo(studioId)]);
  const mine = rows.filter((r) => !organizationId || !r.org || r.org === organizationId);
  const studioLevel = rows.filter((r) => !r.org);
  // Los servicios sin modo elegido siguen el de siempre: simulador en la demo
  const modes = mine.map((r) => resolveMode({ studio: r.mode, demo })).concat(studioLevel.length < Object.keys(SERVICES).length ? [resolveMode({ demo })] : []);
  return markFor(modes);
}

/** Cambia el modo (lo hace el owner de Faro): validado y auditado */
export async function setMode(actor: Actor, studioId: string, organizationId: string | null, service: string, mode: string) {
  if (!isUuid(studioId) || !isService(service)) throw new ModeError("Servicio o espacio inválido.");
  const [s] = await db().select({ id: studios.id, demo: studios.is_demo, name: studios.name }).from(studios).where(eq(studios.id, studioId));
  if (!s) throw new ModeError("No encontramos ese espacio.");
  if (organizationId) {
    const [o] = isUuid(organizationId) ? await db().select({ id: organizations.id }).from(organizations).where(and(eq(organizations.id, organizationId), eq(organizations.studio_id, studioId))) : [];
    if (!o) throw new ModeError("Esa organización no es de ese espacio.");
  }
  if (mode === "heredar") {
    await db().delete(service_modes).where(and(eq(service_modes.studio_id, studioId), eq(service_modes.service, service), organizationId ? eq(service_modes.organization_id, organizationId) : isNull(service_modes.organization_id)));
  } else {
    if (!isMode(mode)) throw new ModeError("Modo inválido.");
    const bad = modeAllowed(mode, { demo: !!s.demo, simulatorsAllowed: simulatorsAllowed() });
    if (bad) throw new ModeError(bad);
    const where = and(eq(service_modes.studio_id, studioId), eq(service_modes.service, service), organizationId ? eq(service_modes.organization_id, organizationId) : isNull(service_modes.organization_id));
    const [prev] = await db().select({ id: service_modes.id }).from(service_modes).where(where);
    if (prev) await db().update(service_modes).set({ mode, set_by: actor.id }).where(eq(service_modes.id, prev.id));
    else await db().insert(service_modes).values({ studio_id: studioId, organization_id: organizationId, service, mode, set_by: actor.id });
  }
  await audit({ studioId, organizationId, actor, action: "servicios.modo", entityType: "servicio", entityId: service, metadata: { servicio: SERVICES[service].label, modo: mode, espacio: s.name } });
}

/** Tabla del Faro Manager: cada espacio con el modo de cada servicio y sus excepciones por organización */
export async function modesOverview() {
  const [list, rows, orgs] = await Promise.all([
    db().select({ id: studios.id, name: studios.name, kind: studios.kind, demo: studios.is_demo }).from(studios).orderBy(desc(studios.is_demo), studios.name).limit(300),
    db().select().from(service_modes),
    db().select({ id: organizations.id, name: organizations.name, studio: organizations.studio_id }).from(organizations),
  ]);
  return list.map((s) => ({
    ...s,
    modes: Object.fromEntries((Object.keys(SERVICES) as Service[]).map((k) => [k, resolveMode({ studio: rows.find((r) => r.studio_id === s.id && !r.organization_id && r.service === k)?.mode, demo: !!s.demo })])) as Record<Service, Mode>,
    explicit: Object.fromEntries(rows.filter((r) => r.studio_id === s.id && !r.organization_id).map((r) => [r.service, r.mode])) as Record<string, string>,
    orgOverrides: rows.filter((r) => r.studio_id === s.id && r.organization_id).map((r) => ({ service: r.service, mode: r.mode, organizationId: r.organization_id!, organization: orgs.find((o) => o.id === r.organization_id)?.name ?? "" })),
    orgs: orgs.filter((o) => o.studio === s.id).map((o) => ({ id: o.id, name: o.name })),
  }));
}

// ───────────── Estado y bitácora de los simuladores ─────────────

export async function simGet<T>(service: string, key: string): Promise<T | null> {
  const [r] = await db().select({ data: simulator_state.data }).from(simulator_state).where(and(eq(simulator_state.service, service), eq(simulator_state.key, key)));
  return (r?.data as T) ?? null;
}

export async function simSet(service: string, key: string, data: unknown, studioId: string | null = null) {
  await db()
    .insert(simulator_state)
    .values({ service, key, data: data as object, studio_id: studioId })
    .onConflictDoUpdate({ target: [simulator_state.service, simulator_state.key], set: { data: data as object, updated_at: new Date() } });
}

/** Estados de un servicio de un espacio (por prefijo de clave) */
export async function simList<T>(service: string, studioId: string, prefix: string) {
  const rows = await db()
    .select({ key: simulator_state.key, data: simulator_state.data, updated: simulator_state.updated_at })
    .from(simulator_state)
    .where(and(eq(simulator_state.service, service), eq(simulator_state.studio_id, studioId), like(simulator_state.key, `${prefix}%`)))
    .orderBy(desc(simulator_state.updated_at))
    .limit(100);
  return rows.map((r) => ({ key: r.key, data: r.data as T, updated: r.updated }));
}

export async function simLog(service: string, kind: string, summary: string, data: unknown = null, studioId: string | null = null) {
  await db().insert(simulator_events).values({ service, kind, summary: summary.slice(0, 300), data: data as object, studio_id: studioId });
}

/** Un mail que no salió, en la bandeja del espacio de quien lo iba a recibir */
export async function simLogMail(to: string[], kind: string, subject: string, data: unknown) {
  const emails = to.map((t) => t.toLowerCase().trim()).filter(Boolean);
  const [u] = emails.length ? await db().select({ s: users.studioId }).from(users).where(inArray(sql`lower(${users.email})`, emails)).limit(1) : [];
  await simLog("mail", kind, `${subject} → ${emails.join(", ")}`, data, u?.s ?? null);
}

export async function simEvents(service: string | null, studioId: string | null, limit = 50) {
  return db()
    .select()
    .from(simulator_events)
    .where(and(service ? eq(simulator_events.service, service) : undefined, studioId ? eq(simulator_events.studio_id, studioId) : undefined))
    .orderBy(desc(simulator_events.created_at))
    .limit(limit);
}

// ───────────── Guía de prueba (C7) ─────────────

export async function guideChecks() {
  return db().select().from(guide_checks);
}

/** Guarda el estado y el comentario de una prueba de la guía (equipo de Faro), auditado */
export async function saveGuideCheck(actor: Actor, key: string, status: string, comment: string) {
  const { GUIDE, isGuideStatus } = await import("./guia");
  if (!GUIDE.some((g) => g.key === key) || !isGuideStatus(status)) throw new ModeError("Prueba o estado inválido.");
  const values = { status, comment: comment.trim().slice(0, 2000) || null, updated_by: actor.id };
  await db().insert(guide_checks).values({ item_key: key, ...values }).onConflictDoUpdate({ target: guide_checks.item_key, set: { ...values, updated_at: new Date() } });
  await audit({ studioId: null, actor, action: "guia.prueba", entityType: "guia", entityId: key, metadata: { estado: status, comentario: !!values.comment } });
}
