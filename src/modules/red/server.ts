import "server-only";
import { and, count, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { directory_profiles, directory_reviews, leads, memberships, organizations, studios, users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { hasModule } from "@/lib/faro/entitlements";
import { esc, sendMail } from "@/lib/email";
import { mailLayout } from "@/lib/notify";
import { getSiteUrl } from "@/lib/runtime-config";
import { INDUSTRY_NAMES } from "@/modules/industries/catalog";
import { MODALITIES, RED_SERVICES, TEAM_SIZES } from "./catalog";

// Red de estudios (docs/faro-producto.md §2.i). Directorio neutral: solo
// estudios que se sumaron (opt-in), con la matrícula verificada por Faro y el
// módulo red_estudios en su plan. El orden sale de criterios objetivos y nunca
// de un pago. Las reseñas son de clientes reales (≥ 30 días en Faro), una por
// organización, moderadas por Faro y con derecho a respuesta.

export class RedError extends Error {}

export const MIN_REVIEW_DAYS = 30;

export type Profile = typeof directory_profiles.$inferSelect;

export async function getProfile(studioId: string) {
  const [p] = await getDb().select().from(directory_profiles).where(eq(directory_profiles.studio_id, studioId));
  return p ?? null;
}

/** ¿Por qué no está visible? (null = visible en la Red) */
export async function visibilityIssue(studioId: string, p: Profile | null): Promise<string | null> {
  if (!(await hasModule(studioId, "red_estudios"))) return "La Red de estudios está incluida en los planes Profesional y Avanzado.";
  if (!p || !p.published) return "Todavía no publicaste la ficha.";
  if (p.license_status !== "verificada") return p.license_status === "rechazada" ? "La matrícula no pudo verificarse: revisá los datos y volvé a enviarla." : "Falta que Faro verifique la matrícula.";
  return null;
}

const clean = (v: string[] | undefined, allowed: readonly string[], max = 20) => [...new Set((v ?? []).filter((x) => allowed.includes(x)))].slice(0, max);

export interface ProfileInput {
  headline: string;
  description: string;
  province: string;
  city: string;
  modality: string;
  services: string[];
  industries: string[];
  languages: string[];
  teamSize: string;
  feeRange: string;
  contactEmail: string;
  acceptingClients: boolean;
  licenseBody: string;
  licenseNumber: string;
  licenseHolder: string;
}

/** Guarda la ficha. Si cambian los datos de la matrícula, vuelve a "pendiente" (Faro la verifica de nuevo) */
export async function saveProfile(studioId: string, input: ProfileInput) {
  const db = getDb();
  const current = await getProfile(studioId);
  const licenseChanged =
    !current || current.license_body !== (input.licenseBody || null) || current.license_number !== (input.licenseNumber || null) || current.license_holder !== (input.licenseHolder || null);
  const hasLicense = !!input.licenseBody && !!input.licenseNumber && !!input.licenseHolder;
  const values = {
    headline: input.headline.slice(0, 120) || null,
    description: input.description.slice(0, 2000) || null,
    province: input.province.slice(0, 60) || null,
    city: input.city.slice(0, 80) || null,
    modality: MODALITIES.some((m) => m.key === input.modality) ? input.modality : "ambas",
    services: clean(input.services, RED_SERVICES.map((s) => s.key)),
    industries: clean(input.industries, Object.keys(INDUSTRY_NAMES), 12),
    languages: [...new Set(input.languages.map((l) => l.trim().toLowerCase()).filter(Boolean))].slice(0, 6),
    team_size: TEAM_SIZES.some((t) => t.key === input.teamSize) ? input.teamSize : null,
    fee_range: input.feeRange.slice(0, 80) || null,
    contact_email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.contactEmail) ? input.contactEmail.toLowerCase() : null,
    accepting_clients: input.acceptingClients,
    license_body: input.licenseBody.slice(0, 120) || null,
    license_number: input.licenseNumber.slice(0, 40) || null,
    license_holder: input.licenseHolder.slice(0, 120) || null,
    ...(licenseChanged ? { license_status: hasLicense ? ("pendiente" as const) : ("sin_cargar" as const), license_note: null, license_reviewed_at: null, license_reviewed_by: null } : {}),
  };
  await db
    .insert(directory_profiles)
    .values({ studio_id: studioId, ...values })
    .onConflictDoUpdate({ target: directory_profiles.studio_id, set: values });
  return { licenseChanged: licenseChanged && hasLicense };
}

export async function setPublished(studioId: string, published: boolean) {
  const p = await getProfile(studioId);
  if (!p) throw new RedError("Primero completá la ficha.");
  if (published && !(await hasModule(studioId, "red_estudios"))) throw new RedError("La Red de estudios está incluida en los planes Profesional y Avanzado.");
  if (published && (!p.city || !p.services.length)) throw new RedError("Completá al menos la localidad y un servicio antes de publicar.");
  await getDb()
    .update(directory_profiles)
    .set({ published, published_at: published ? (p.published_at ?? new Date()) : p.published_at })
    .where(eq(directory_profiles.studio_id, studioId));
}

// ── Métricas objetivas ────────────────────────────────────────────────

/** Horas promedio hasta la primera respuesta del estudio en solicitudes (últimos 90 días), medido en Faro */
async function responseHours(studioIds: string[]) {
  if (!studioIds.length) return new Map<string, number>();
  const rows = await getDb().execute<{ studio_id: string; hours: number | null }>(sql`
    select r.studio_id, avg(extract(epoch from (fm.first_at - r.created_at)) / 3600)::float as hours
    from requests r
    join lateral (
      select min(m.created_at) as first_at from request_messages m where m.request_id = r.id and m.from_client = false
    ) fm on fm.first_at is not null
    where r.studio_id in ${studioIds}
      and r.created_at > now() - interval '90 days'
    group by r.studio_id`);
  return new Map(rows.map((r) => [r.studio_id, Number(r.hours)]));
}

async function ratings(studioIds: string[]) {
  if (!studioIds.length) return new Map<string, { n: number; avg: number }>();
  const rows = await getDb()
    .select({ studio: directory_reviews.studio_id, n: count(), avg: sql<number>`avg(${directory_reviews.rating})::float` })
    .from(directory_reviews)
    .where(and(inArray(directory_reviews.studio_id, studioIds), eq(directory_reviews.status, "publicada")))
    .groupBy(directory_reviews.studio_id);
  return new Map(rows.map((r) => [r.studio, { n: r.n, avg: Number(r.avg) }]));
}

/**
 * Puntaje neutral (0 a 100), igual para todos los estudios:
 * - reseñas: promedio bayesiano (40) y cantidad (10)
 * - tiempo de primera respuesta medido en Faro (25)
 * - acepta clientes nuevos (10)
 * - coincidencia con el rubro y la zona que se buscan (15)
 * Nunca entra un pago. A igual puntaje, orden alfabético.
 */
export function neutralScore(x: { rating: { n: number; avg: number } | undefined; hours: number | undefined; accepting: boolean; matchIndustry: boolean; matchZone: boolean }) {
  const n = x.rating?.n ?? 0;
  const bayes = (3 * 4 + (x.rating ? x.rating.avg * n : 0)) / (3 + n);
  const rating = ((bayes - 1) / 4) * 40 + (Math.min(n, 20) / 20) * 10;
  const h = x.hours;
  const speed = h == null ? 10 : h <= 4 ? 25 : h <= 24 ? 18 : h <= 72 ? 8 : 0;
  return Math.round(rating + speed + (x.accepting ? 10 : 0) + (x.matchIndustry ? 8 : 0) + (x.matchZone ? 7 : 0));
}

export interface DirectoryFilters {
  zona?: string;
  rubro?: string;
  servicio?: string;
  modalidad?: string;
  tamano?: string;
}

const norm = (s: string | null | undefined) =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/** Estudios visibles en la Red con su puntaje neutral, filtrados y ordenados */
export async function publicDirectory(f: DirectoryFilters = {}) {
  const db = getDb();
  const rows = await db
    .select({ p: directory_profiles, name: studios.name, slug: studios.slug, status: studios.status })
    .from(directory_profiles)
    .innerJoin(studios, eq(studios.id, directory_profiles.studio_id))
    .where(and(eq(directory_profiles.published, true), eq(directory_profiles.license_status, "verificada"), eq(studios.kind, "studio"), ne(studios.status, "suspendido")));
  const visible = [];
  for (const r of rows) if (await hasModule(r.p.studio_id, "red_estudios")) visible.push(r);
  const ids = visible.map((r) => r.p.studio_id);
  const [rate, hours] = await Promise.all([ratings(ids), responseHours(ids)]);
  const zona = norm(f.zona);
  return visible
    .filter((r) => !f.rubro || r.p.industries.includes(f.rubro))
    .filter((r) => !f.servicio || r.p.services.includes(f.servicio))
    .filter((r) => !f.modalidad || r.p.modality === f.modalidad || r.p.modality === "ambas")
    .filter((r) => !f.tamano || r.p.team_size === f.tamano)
    .filter((r) => !zona || r.p.modality !== "presencial" || norm(r.p.city).includes(zona) || norm(r.p.province).includes(zona))
    .map((r) => {
      const rating = rate.get(r.p.studio_id);
      const h = hours.get(r.p.studio_id);
      const matchZone = !!zona && (norm(r.p.city).includes(zona) || norm(r.p.province).includes(zona));
      return {
        studioId: r.p.studio_id,
        slug: r.slug,
        name: r.name,
        profile: r.p,
        rating,
        responseHours: h ?? null,
        score: neutralScore({ rating, hours: h, accepting: r.p.accepting_clients, matchIndustry: !!f.rubro, matchZone }),
      };
    })
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "es"));
}

export async function publicProfile(slug: string) {
  const [r] = await getDb()
    .select({ p: directory_profiles, name: studios.name, slug: studios.slug, studioId: studios.id, status: studios.status, kind: studios.kind })
    .from(directory_profiles)
    .innerJoin(studios, eq(studios.id, directory_profiles.studio_id))
    .where(eq(studios.slug, slug));
  if (!r || r.kind !== "studio" || r.status === "suspendido" || (await visibilityIssue(r.studioId, r.p))) return null;
  const [rate, hours, reviews] = await Promise.all([ratings([r.studioId]), responseHours([r.studioId]), publishedReviews(r.studioId)]);
  return { ...r, rating: rate.get(r.studioId), responseHours: hours.get(r.studioId) ?? null, reviews };
}

export function publishedReviews(studioId: string) {
  return getDb()
    .select()
    .from(directory_reviews)
    .where(and(eq(directory_reviews.studio_id, studioId), eq(directory_reviews.status, "publicada")))
    .orderBy(desc(directory_reviews.created_at));
}

// ── Reseñas ───────────────────────────────────────────────────────────

/**
 * ¿Puede reseñar? Miembro con rol administrador o dirección de una
 * organización del estudio, con al menos 30 días en Faro, y sin reseña previa
 * de esa organización. El estudio y la organización salen de la sesión.
 */
export async function reviewEligibility(user: { id: string; studioId: string }, organizationId: string, orgRole: string) {
  const db = getDb();
  if (orgRole !== "administrador" && orgRole !== "direccion") return { ok: false as const, reason: "Solo quien administra o dirige la organización puede dejar la reseña." };
  const [o] = await db
    .select({ created: organizations.created_at, studio: organizations.studio_id })
    .from(organizations)
    .innerJoin(memberships, and(eq(memberships.organization_id, organizations.id), eq(memberships.user_id, user.id), eq(memberships.status, "activa")))
    .where(and(eq(organizations.id, organizationId), eq(organizations.studio_id, user.studioId)));
  if (!o) return { ok: false as const, reason: "No encontramos tu organización." };
  const days = Math.floor((Date.now() - o.created.getTime()) / 86400000);
  if (days < MIN_REVIEW_DAYS) return { ok: false as const, reason: `Podés reseñar al estudio cuando cumplas ${MIN_REVIEW_DAYS} días trabajando con él en Faro (te faltan ${MIN_REVIEW_DAYS - days}).` };
  const [prev] = await db.select().from(directory_reviews).where(and(eq(directory_reviews.studio_id, user.studioId), eq(directory_reviews.organization_id, organizationId)));
  if (prev) return { ok: false as const, reason: "Tu organización ya dejó su reseña.", review: prev };
  return { ok: true as const };
}

export async function submitReview(user: { id: string; name: string; studioId: string }, organizationId: string, orgRole: string, rating: number, body: string) {
  const e = await reviewEligibility(user, organizationId, orgRole);
  if (!e.ok) throw new RedError(e.reason);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new RedError("Elegí de 1 a 5 estrellas.");
  const text = body.trim();
  if (text.length < 20) throw new RedError("Contá un poco más (al menos 20 caracteres).");
  const [r] = await getDb()
    .insert(directory_reviews)
    .values({ studio_id: user.studioId, organization_id: organizationId, author_user_id: user.id, author_label: user.name.split(" ")[0] || "Cliente verificado", rating, body: text.slice(0, 2000) })
    .onConflictDoNothing()
    .returning({ id: directory_reviews.id });
  if (!r) throw new RedError("Tu organización ya dejó su reseña.");
  return r.id;
}

/** Respuesta pública del estudio (una por reseña, editable) */
export async function respondReview(studioId: string, reviewId: string, userId: string, text: string) {
  const t = text.trim().slice(0, 1500);
  const [r] = await getDb()
    .update(directory_reviews)
    .set({ response: t || null, responded_by: t ? userId : null, responded_at: t ? new Date() : null })
    .where(and(eq(directory_reviews.id, reviewId), eq(directory_reviews.studio_id, studioId)))
    .returning({ id: directory_reviews.id });
  if (!r) throw new RedError("Esa reseña no es de tu estudio.");
}

// ── Pedir propuesta ───────────────────────────────────────────────────

/** "Pedir propuesta": crea una consulta (CRM) en el estudio, con el consentimiento de la persona */
export async function requestProposal(input: { studioId: string; name: string; email: string; phone?: string; profile?: string; message: string; userId?: string | null; fleetId?: string | null }) {
  const db = getDb();
  const p = await getProfile(input.studioId);
  if (await visibilityIssue(input.studioId, p)) throw new RedError("Ese estudio no está disponible en la Red.");
  if (!p!.accepting_clients) throw new RedError("Ese estudio no está tomando clientes nuevos por ahora.");
  const [lead] = await db
    .insert(leads)
    .values({
      studio_id: input.studioId,
      name: input.name.slice(0, 120),
      email: input.email.toLowerCase(),
      phone: input.phone?.slice(0, 40) || null,
      contributor_type: input.profile || null,
      message: input.message.slice(0, 2000) || null,
      source: input.fleetId ? "flota" : "red",
      notes: input.userId ? `Usuario de Faro (${input.userId}). Llegó desde la Red de estudios con consentimiento para compartir estos datos.` : "Llegó desde la Red de estudios con consentimiento para compartir estos datos.",
    })
    .returning({ id: leads.id });
  await audit({ studioId: input.studioId, actor: input.userId ? { id: input.userId, email: input.email } : undefined, actorLabel: input.userId ? undefined : input.email, action: "red.pedido_propuesta", entityType: "consulta", entityId: lead.id, metadata: { flota: input.fleetId ?? null } });
  // Aviso al dueño del estudio (y al mail de contacto de la ficha)
  const owners = await db.select({ email: users.email }).from(users).where(and(eq(users.studioId, input.studioId), eq(users.role, "dueno"), eq(users.active, true)));
  const to = [...new Set([...owners.map((o) => o.email), ...(p!.contact_email ? [p!.contact_email] : [])])];
  if (to.length)
    await sendMail({
      to,
      subject: `Nuevo pedido de propuesta desde la Red: ${input.name}`,
      html: mailLayout(
        "Pedido de propuesta",
        `<p><strong>${esc(input.name)}</strong> (${esc(input.email)}) pidió una propuesta desde la Red de estudios de Faro.</p>${input.message ? `<p>${esc(input.message.slice(0, 600))}</p>` : ""}`,
        { href: `${getSiteUrl()}/admin/consultas/${lead.id}`, label: "Ver la consulta" },
        "Faro",
      ),
    }).catch(() => undefined);
  return lead.id;
}

/** Cantidades para el Faro Manager */
export async function moderationCounts() {
  const db = getDb();
  const [[lic], [rev]] = await Promise.all([
    db.select({ n: count() }).from(directory_profiles).where(eq(directory_profiles.license_status, "pendiente")),
    db.select({ n: count() }).from(directory_reviews).where(eq(directory_reviews.status, "pendiente")),
  ]);
  return { licenses: lic?.n ?? 0, reviews: rev?.n ?? 0 };
}

