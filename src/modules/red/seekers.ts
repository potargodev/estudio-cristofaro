import "server-only";
import { and, desc, eq, gt, inArray, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { fleet_members, fleets, memberships, seeker_contacts, seeker_profiles, studios, users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { INDUSTRY_NAMES } from "@/modules/industries/catalog";
import { notify } from "@/modules/notifications/server";
import { PROVINCES, RED_SERVICES } from "./catalog";
import { getProfile, visibilityIssue } from "./server";

// Red Contable de doble mano (principios §15). Las personas, los autónomos,
// las empresas y las Flotas se muestran solo si activan «Disponible, busco
// contador», con lo que eligen mostrar y sin nombre ni contacto. Los estudios
// los buscan y contactan; recién cuando la persona acepta se muestran sus
// datos y empieza la admisión. Sin comisión ni posiciones pagas.

export class SeekerError extends Error {}

const UUID = /^[0-9a-f-]{36}$/i;
const db = () => getDb();
type Person = { id: string; name: string; email: string; studioId: string; role: string; tenantKind: string; assisted?: unknown };
type Staff = { id: string; name: string; email: string; studioId: string; role: string; tenantKind: string };

export const SEEKER_KINDS = { persona: "Persona", autonomo: "Autónomo", empresa: "Empresa", flota: "Flota" } as const;
export const SEEKER_SIZES = [
  { key: "solo", label: "Solo yo" },
  { key: "2-5", label: "2 a 5 personas" },
  { key: "6-20", label: "6 a 20 personas" },
  { key: "21+", label: "Más de 20 personas" },
] as const;

/** Sin datos personales: se borran mails, teléfonos y CUIT del texto libre */
export function scrubNote(note: string) {
  return note
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "[sin datos de contacto]")
    .replace(/\b\d{2}-?\d{8}-?\d\b/g, "[sin CUIT]")
    .replace(/(\+?\d[\d\s-]{7,}\d)/g, "[sin teléfono]")
    .trim()
    .slice(0, 280);
}

export interface SeekerInput {
  kind: string;
  industry?: string | null;
  size?: string | null;
  province?: string | null;
  city?: string | null;
  needs?: string[];
  note?: string | null;
}

function clean(i: SeekerInput, fleet: boolean) {
  const kind = fleet ? "flota" : i.kind in SEEKER_KINDS && i.kind !== "flota" ? i.kind : "persona";
  return {
    kind,
    industry: i.industry && i.industry in INDUSTRY_NAMES ? i.industry : null,
    size: SEEKER_SIZES.some((s) => s.key === i.size) ? i.size! : null,
    province: PROVINCES.includes(i.province as never) ? i.province! : null,
    city: i.city?.trim().slice(0, 60) || null,
    needs: [...new Set((i.needs ?? []).filter((n) => RED_SERVICES.some((s) => s.key === n)))].slice(0, 8),
    note: i.note ? scrubNote(i.note) || null : null,
  };
}

/** Lo que muestra la persona en el listado (o null) */
export async function mySeeker(userId: string) {
  const [s] = await db().select().from(seeker_profiles).where(and(eq(seeker_profiles.user_id, userId), isNull(seeker_profiles.fleet_id)));
  return s ?? null;
}

/** Activar o apagar «Disponible, busco contador» (personas, autónomos y empresas) */
export async function setSeeker(me: Person, active: boolean, i: SeekerInput) {
  if (me.role !== "titular" || me.tenantKind === "studio" || me.assisted) throw new SeekerError("Esto es para cuentas de personas y autónomos.");
  const v = clean(i, false);
  const now = new Date();
  const existing = await mySeeker(me.id);
  const values = { ...v, active, activated_at: active ? (existing?.active ? existing.activated_at : now) : null };
  if (existing) await db().update(seeker_profiles).set(values).where(eq(seeker_profiles.id, existing.id));
  else await db().insert(seeker_profiles).values({ user_id: me.id, ...values });
  await audit({ studioId: me.studioId, actor: me, action: active ? "red.disponible" : "red.no_disponible", entityType: "red_busqueda", metadata: { tipo: v.kind, rubro: v.industry, zona: v.province, necesita: v.needs } });
}

/** Lo mismo para una Flota: lo decide el Capitán */
export async function setFleetSeeker(me: Person, fleetId: string, active: boolean, i: SeekerInput) {
  if (!UUID.test(fleetId)) throw new SeekerError("Flota inválida.");
  const [m] = await db().select({ role: fleet_members.role }).from(fleet_members).where(and(eq(fleet_members.fleet_id, fleetId), eq(fleet_members.user_id, me.id), eq(fleet_members.status, "activo")));
  if (m?.role !== "capitan") throw new SeekerError("Solo el Capitán de la Flota lo decide.");
  const v = clean(i, true);
  const [existing] = await db().select().from(seeker_profiles).where(eq(seeker_profiles.fleet_id, fleetId));
  const values = { ...v, active, activated_at: active ? (existing?.active ? existing.activated_at : new Date()) : null };
  if (existing) await db().update(seeker_profiles).set(values).where(eq(seeker_profiles.id, existing.id));
  else await db().insert(seeker_profiles).values({ user_id: me.id, fleet_id: fleetId, ...values });
  await audit({ studioId: me.studioId, actor: me, action: active ? "red.flota_disponible" : "red.flota_no_disponible", entityType: "flota", entityId: fleetId });
}

export async function fleetSeeker(fleetId: string) {
  if (!UUID.test(fleetId)) return null;
  const [s] = await db().select().from(seeker_profiles).where(eq(seeker_profiles.fleet_id, fleetId));
  return s ?? null;
}

async function studioCanSearch(staff: Staff) {
  if (staff.tenantKind !== "studio" || !["dueno", "contador", "colaborador"].includes(staff.role)) return "Solo para estudios.";
  return visibilityIssue(staff.studioId, await getProfile(staff.studioId));
}

/** «Buscar clientes»: listado anónimo con filtros (sin nombre ni contacto) */
export async function searchSeekers(staff: Staff, f: { tipo?: string; rubro?: string; provincia?: string; necesidad?: string }) {
  const issue = await studioCanSearch(staff);
  if (issue) return { issue, list: [] };
  const rows = await db().select().from(seeker_profiles).where(eq(seeker_profiles.active, true)).orderBy(desc(seeker_profiles.activated_at)).limit(300);
  const contacted = rows.length ? await db().select().from(seeker_contacts).where(and(eq(seeker_contacts.studio_id, staff.studioId), inArray(seeker_contacts.seeker_id, rows.map((r) => r.id)))) : [];
  const fleetIds = rows.map((r) => r.fleet_id).filter((x): x is string => !!x);
  const members = fleetIds.length ? await db().select({ fleet: fleet_members.fleet_id }).from(fleet_members).where(and(inArray(fleet_members.fleet_id, fleetIds), eq(fleet_members.status, "activo"))) : [];
  const profile = await getProfile(staff.studioId);
  const list = rows
    .filter((r) => r.user_id !== staff.id)
    .filter((r) => (!f.tipo || r.kind === f.tipo) && (!f.rubro || r.industry === f.rubro) && (!f.provincia || r.province === f.provincia) && (!f.necesidad || r.needs.includes(f.necesidad)))
    .map((r) => ({
      id: r.id,
      kind: r.kind,
      kindLabel: SEEKER_KINDS[r.kind as keyof typeof SEEKER_KINDS] ?? r.kind,
      industry: r.industry ? (INDUSTRY_NAMES[r.industry] ?? null) : null,
      size: r.kind === "flota" ? `${members.filter((m) => m.fleet === r.fleet_id).length} integrantes` : (SEEKER_SIZES.find((s) => s.key === r.size)?.label ?? null),
      zone: [r.city, r.province].filter(Boolean).join(", ") || null,
      needs: r.needs.map((n) => RED_SERVICES.find((s) => s.key === n)?.label ?? n),
      note: r.note,
      since: r.activated_at,
      contact: contacted.find((c) => c.seeker_id === r.id) ?? null,
      match: matchesProfile(r, profile),
    }))
    // Primero los que coinciden con el perfil del estudio (sin pagar nada: es el mismo orden para todos)
    .sort((a, b) => Number(b.match) - Number(a.match));
  return { issue: null, list };
}

/** El estudio contacta: le llega a la persona sin que el estudio sepa quién es */
export async function contactSeeker(staff: Staff, seekerId: string, message: string) {
  const issue = await studioCanSearch(staff);
  if (issue) throw new SeekerError(issue);
  if (!["dueno", "contador"].includes(staff.role)) throw new SeekerError("Contactan el dueño o un contador del estudio.");
  if (!UUID.test(seekerId)) throw new SeekerError("No encontramos a esa persona en el listado.");
  const [s] = await db().select().from(seeker_profiles).where(and(eq(seeker_profiles.id, seekerId), eq(seeker_profiles.active, true)));
  if (!s) throw new SeekerError("Ya no está disponible en el listado.");
  const [row] = await db()
    .insert(seeker_contacts)
    .values({ seeker_id: s.id, studio_id: staff.studioId, contacted_by: staff.id, message: message.trim().slice(0, 1000) || null })
    .onConflictDoNothing()
    .returning();
  if (!row) throw new SeekerError("Ya la contactaste: esperá su respuesta.");
  await audit({ studioId: staff.studioId, actor: staff, action: "red.contacto", entityType: "red_busqueda", entityId: row.id });
  const [st] = await db().select({ name: studios.name }).from(studios).where(eq(studios.id, staff.studioId));
  await notify([s.user_id], { kind: "aviso", title: `${st?.name ?? "Un estudio"} quiere ser tu contador`, body: "Mirá su ficha en la Red Contable y decidí. Hasta que aceptes, no ve tus datos.", href: s.fleet_id ? `/flotas/${s.fleet_id}` : "/contador", refId: row.id }).catch(() => undefined);
  return row;
}

/** Contactos que recibió la persona (o su Flota, si es Capitán) */
export async function myContacts(userId: string) {
  return db()
    .select({ c: seeker_contacts, studio: studios.name, slug: studios.slug, kind: seeker_profiles.kind, fleetId: seeker_profiles.fleet_id })
    .from(seeker_contacts)
    .innerJoin(seeker_profiles, eq(seeker_profiles.id, seeker_contacts.seeker_id))
    .innerJoin(studios, eq(studios.id, seeker_contacts.studio_id))
    .where(eq(seeker_profiles.user_id, userId))
    .orderBy(desc(seeker_contacts.created_at));
}

/**
 * La persona acepta o rechaza. Al aceptar, el estudio ve sus datos y empieza
 * la admisión (etapa de conexión). Para una Flota, el estudio ve su nombre y
 * el del Capitán y sigue con la propuesta grupal.
 */
export async function answerContact(me: Person, contactId: string, accept: boolean) {
  if (!UUID.test(contactId)) throw new SeekerError("Contacto inválido.");
  const [r] = await db().select({ c: seeker_contacts, s: seeker_profiles }).from(seeker_contacts).innerJoin(seeker_profiles, eq(seeker_profiles.id, seeker_contacts.seeker_id)).where(and(eq(seeker_contacts.id, contactId), eq(seeker_profiles.user_id, me.id)));
  if (!r) throw new SeekerError("No encontramos ese contacto.");
  if (r.c.status !== "pendiente") throw new SeekerError("Ya respondiste.");
  let connectionId: string | null = null;
  if (accept && !r.s.fleet_id) {
    const { currentConnection } = await import("@/modules/conexiones/server");
    if (await currentConnection(me.id)) throw new SeekerError("Ya tenés una conexión en curso con un estudio.");
    const { account_connections } = await import("@/db/schema");
    const [c] = await db().insert(account_connections).values({ user_id: me.id, user_studio_id: me.studioId, studio_id: r.c.studio_id, status: "admision", initiated_by: "estudio", message: r.c.message, source: "red_busqueda" }).returning({ id: account_connections.id });
    connectionId = c.id;
  }
  await db().update(seeker_contacts).set({ status: accept ? "aceptado" : "rechazado", decided_at: new Date(), connection_id: connectionId }).where(eq(seeker_contacts.id, r.c.id));
  await audit({ studioId: me.studioId, actor: me, action: accept ? "red.contacto_aceptado" : "red.contacto_rechazado", entityType: "red_busqueda", entityId: r.c.id, metadata: { conexion: connectionId } });
  const staff = await db().select({ id: users.id }).from(users).where(and(eq(users.studioId, r.c.studio_id), inArray(users.role, ["dueno", "contador"]), eq(users.active, true)));
  const title = accept ? (r.s.fleet_id ? "Una Flota aceptó tu contacto" : `${me.name} aceptó tu contacto: empezá la admisión`) : "Alguien del listado no aceptó tu contacto";
  await notify(staff.map((u) => u.id), { kind: "aviso", title, href: connectionId ? `/admin/comercial/conexiones/${connectionId}` : "/admin/comercial/buscar-clientes", refId: r.c.id }).catch(() => undefined);
  return connectionId;
}

/** Del lado del estudio: los que aceptaron (recién ahí con nombre y contacto) */
export async function acceptedContacts(staff: Staff) {
  const rows = await db()
    .select({ c: seeker_contacts, s: seeker_profiles, name: users.name, email: users.email, fleet: fleets.name })
    .from(seeker_contacts)
    .innerJoin(seeker_profiles, eq(seeker_profiles.id, seeker_contacts.seeker_id))
    .innerJoin(users, eq(users.id, seeker_profiles.user_id))
    .leftJoin(fleets, eq(fleets.id, seeker_profiles.fleet_id))
    .where(and(eq(seeker_contacts.studio_id, staff.studioId), eq(seeker_contacts.status, "aceptado")))
    .orderBy(desc(seeker_contacts.decided_at));
  return rows;
}

type Profile = Awaited<ReturnType<typeof getProfile>>;

/** ¿Coincide con lo que ofrece el estudio? (algún servicio, el rubro o la provincia) */
export function matchesProfile(r: { needs: string[]; industry: string | null; province: string | null }, p: Profile) {
  if (!p) return false;
  return r.needs.some((n) => p.services.includes(n)) || (!!r.industry && p.industries.includes(r.industry)) || (!!r.province && !!p.province && r.province === p.province && p.modality !== "remoto");
}

/**
 * Candidatos nuevos para el badge de Comercial: disponibles que coinciden con
 * el perfil del estudio, que el estudio todavía no contactó y que aparecieron
 * después de la última vez que miró el listado (o en los últimos 14 días).
 */
export async function newCandidates(staff: Staff, seenAt?: string | null) {
  if (staff.tenantKind !== "studio" || !["dueno", "contador"].includes(staff.role)) return 0;
  const profile = await getProfile(staff.studioId);
  if (await visibilityIssue(staff.studioId, profile)) return 0;
  const since = seenAt && !Number.isNaN(Date.parse(seenAt)) ? new Date(seenAt) : new Date(Date.now() - 14 * 86400_000);
  const rows = await db().select().from(seeker_profiles).where(and(eq(seeker_profiles.active, true), gt(seeker_profiles.activated_at, since))).limit(300);
  if (!rows.length) return 0;
  const contacted = await db().select({ id: seeker_contacts.seeker_id }).from(seeker_contacts).where(and(eq(seeker_contacts.studio_id, staff.studioId), inArray(seeker_contacts.seeker_id, rows.map((r) => r.id))));
  return rows.filter((r) => r.user_id !== staff.id && !contacted.some((c) => c.id === r.id) && matchesProfile(r, profile)).length;
}

/** Postulación de una organización (portal): la decide quien la administra */
async function orgAdmin(me: Person, organizationId: string) {
  if (me.role !== "cliente" || !UUID.test(organizationId)) throw new SeekerError("Esto es para quien administra la empresa.");
  const [m] = await db().select({ role: memberships.role }).from(memberships).where(and(eq(memberships.user_id, me.id), eq(memberships.organization_id, organizationId), eq(memberships.status, "activa")));
  if (!m || !["administrador", "direccion"].includes(m.role)) throw new SeekerError("Solo quien administra la empresa lo decide.");
}

export async function setOrgSeeker(me: Person, organizationId: string, active: boolean, i: SeekerInput) {
  await orgAdmin(me, organizationId);
  const v = { ...clean(i, false), kind: "empresa" };
  const existing = await mySeeker(me.id);
  const values = { ...v, active, activated_at: active ? (existing?.active ? existing.activated_at : new Date()) : null };
  if (existing) await db().update(seeker_profiles).set(values).where(eq(seeker_profiles.id, existing.id));
  else await db().insert(seeker_profiles).values({ user_id: me.id, ...values });
  await audit({ studioId: me.studioId, organizationId, actor: me, action: active ? "red.disponible" : "red.no_disponible", entityType: "red_busqueda", metadata: { tipo: "empresa", rubro: v.industry, zona: v.province, necesita: v.needs } });
}

/** La empresa acepta o rechaza un contacto: al aceptar, el estudio ve sus datos (no hay conexión de cuenta personal) */
export async function answerOrgContact(me: Person, organizationId: string, contactId: string, accept: boolean) {
  await orgAdmin(me, organizationId);
  if (!UUID.test(contactId)) throw new SeekerError("Contacto inválido.");
  const [r] = await db().select({ c: seeker_contacts }).from(seeker_contacts).innerJoin(seeker_profiles, eq(seeker_profiles.id, seeker_contacts.seeker_id)).where(and(eq(seeker_contacts.id, contactId), eq(seeker_profiles.user_id, me.id)));
  if (!r) throw new SeekerError("No encontramos ese contacto.");
  if (r.c.status !== "pendiente") throw new SeekerError("Ya respondiste.");
  await db().update(seeker_contacts).set({ status: accept ? "aceptado" : "rechazado", decided_at: new Date() }).where(eq(seeker_contacts.id, r.c.id));
  await audit({ studioId: me.studioId, organizationId, actor: me, action: accept ? "red.contacto_aceptado" : "red.contacto_rechazado", entityType: "red_busqueda", entityId: r.c.id });
  const staff = await db().select({ id: users.id }).from(users).where(and(eq(users.studioId, r.c.studio_id), inArray(users.role, ["dueno", "contador"]), eq(users.active, true)));
  await notify(staff.map((u) => u.id), { kind: "aviso", title: accept ? `${me.name} aceptó tu contacto` : "Una empresa del listado no aceptó tu contacto", href: "/admin/comercial/buscar-clientes", refId: r.c.id }).catch(() => undefined);
}
