import "server-only";
import { and, count, eq, inArray, ne, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb } from "@/db";
import {
  accounting_expenses,
  ai_conversations,
  documents,
  expense_groups,
  expenses,
  fleet_members,
  fleet_proposals,
  fleet_votes,
  fleets,
  group_members,
  invitations,
  obligations,
  onboarding_progress,
  organization_industries,
  organizations,
  reimbursements,
  request_messages,
  requests,
  service_agreements,
  studios,
  users,
} from "@/db/schema";
import { getCurrentUser, getMemberships, ORG_COOKIE, type StaffUser } from "@/lib/auth";
import { CHECKLISTS, PROFILE_LABEL, type GuideView, type OnboardingProfile, type SpaceType } from "./catalog";

// Progreso del onboarding por usuario y por espacio (tenant u organización),
// en la base. Los pasos se detectan de la actividad real (lo que la persona
// ya hizo); los que no dejan rastro propio (abrir una pantalla) se marcan con
// markStep desde la página. El espacio y el perfil salen SIEMPRE de la
// sesión: nada de lo que llega del navegador elige a quién se le escribe.

export interface OnboardingContext {
  user: StaffUser;
  profile: OnboardingProfile;
  spaceType: SpaceType;
  spaceId: string;
  organizationId: string | null;
}

/**
 * Perfil y espacio de la sesión actual (o null: sin sesión o en acceso
 * asistido). Con la ruta de una Flota de la que es integrante activo, el
 * espacio es esa Flota (Capitán o Tripulante).
 */
export async function onboardingContext(path?: string | null): Promise<OnboardingContext | null> {
  const user = await getCurrentUser();
  // El equipo de Faro en acceso asistido no deja progreso en el tenant ajeno
  if (!user || user.assisted) return null;
  const fleetId = path?.match(/^\/flotas\/([0-9a-f-]{36})/i)?.[1];
  if (fleetId && user.role === "titular") {
    const [m] = await getDb()
      .select({ role: fleet_members.role })
      .from(fleet_members)
      .innerJoin(fleets, eq(fleets.id, fleet_members.fleet_id))
      .where(and(eq(fleet_members.fleet_id, fleetId), eq(fleet_members.user_id, user.id), eq(fleet_members.status, "activo"), eq(fleets.status, "activa")));
    if (m) return { user, profile: m.role === "capitan" ? "capitan" : "tripulante", spaceType: "fleet", spaceId: fleetId, organizationId: null };
  }
  if (user.role === "cliente") {
    const list = await getMemberships(user.id, user.studioId);
    if (!list.length) return null;
    const wanted = (await cookies()).get(ORG_COOKIE)?.value;
    const m = list.find((x) => x.organizationId === wanted) ?? list[0];
    const profile: OnboardingProfile = m.role === "empleado" ? "empleado" : m.role === "administrador" || m.role === "direccion" ? "org_dueno" : "org_administracion";
    return { user, profile, spaceType: "organization", spaceId: m.organizationId, organizationId: m.organizationId };
  }
  if (user.role === "titular") return { user, profile: user.tenantKind === "persona" ? "persona" : "autonomo", spaceType: "tenant", spaceId: user.studioId, organizationId: null };
  if (user.role === "dueno") return { user, profile: "estudio_dueno", spaceType: "tenant", spaceId: user.studioId, organizationId: null };
  return { user, profile: "estudio_equipo", spaceType: "tenant", spaceId: user.studioId, organizationId: null };
}

const has = async (q: Promise<{ n: number }[]>) => ((await q)[0]?.n ?? 0) > 0;

/** Pasos que la actividad real ya cumple */
async function detect(ctx: OnboardingContext): Promise<Set<string>> {
  const db = getDb();
  const { user } = ctx;
  const sid = user.studioId;
  const done = new Set<string>();
  const checks: Record<string, () => Promise<boolean>> = {
    seguridad: async () => user.twoFactorEnabled,
    grupo: () => has(db.select({ n: count() }).from(expense_groups).where(and(eq(expense_groups.studio_id, sid), eq(expense_groups.created_by, user.id)))),
    gasto: () => has(db.select({ n: count() }).from(expenses).where(eq(expenses.created_by, user.id))),
    invitar: () =>
      has(
        db
          .select({ n: count() })
          .from(group_members)
          .innerJoin(expense_groups, eq(expense_groups.id, group_members.group_id))
          .where(and(eq(expense_groups.studio_id, sid), eq(expense_groups.created_by, user.id), sql`${group_members.user_id} is distinct from ${user.id}`)),
      ),
    datos: async () => {
      const [t] = await db.select({ cuit: studios.cuit, regime: studios.tax_regime }).from(studios).where(eq(studios.id, sid));
      return !!t?.cuit && !!t.regime;
    },
    gasto_actividad: () => has(db.select({ n: count() }).from(accounting_expenses).where(eq(accounting_expenses.studio_id, sid))),
    asistente: () => has(db.select({ n: count() }).from(ai_conversations).where(and(eq(ai_conversations.studio_id, sid), eq(ai_conversations.user_id, user.id)))),
    organizacion: () => has(db.select({ n: count() }).from(organizations).where(and(eq(organizations.studio_id, sid), ne(organizations.status, "baja")))),
    rubro: () => has(db.select({ n: count() }).from(organization_industries).where(eq(organization_industries.studio_id, sid))),
    vencimientos: () => has(db.select({ n: count() }).from(obligations).where(eq(obligations.studio_id, sid))),
    cliente: () => has(db.select({ n: count() }).from(invitations).where(eq(invitations.studio_id, sid))),
    equipo:
      ctx.spaceType === "organization"
        ? () => has(db.select({ n: count() }).from(invitations).where(and(eq(invitations.studio_id, sid), eq(invitations.organization_id, ctx.spaceId), eq(invitations.invited_by, user.id))))
        : () => has(db.select({ n: count() }).from(users).where(and(eq(users.studioId, sid), inArray(users.role, ["contador", "colaborador"])))),
    solicitud:
      ctx.spaceType === "organization"
        ? () => has(db.select({ n: count() }).from(requests).where(and(eq(requests.studio_id, sid), eq(requests.organization_id, ctx.spaceId), eq(requests.created_by, user.id))))
        : () =>
            has(
              db
                .select({ n: count() })
                .from(request_messages)
                .innerJoin(requests, eq(requests.id, request_messages.request_id))
                .where(and(eq(requests.studio_id, sid), eq(request_messages.author_id, user.id), eq(request_messages.from_client, false))),
            ),
    documento: () => has(db.select({ n: count() }).from(documents).where(and(eq(documents.studio_id, sid), eq(documents.organization_id, ctx.spaceId), eq(documents.uploaded_by, user.id)))),
    flota_miembros: () => has(db.select({ n: sql<number>`case when count(*) >= 3 then 1 else 0 end::int` }).from(fleet_members).where(and(eq(fleet_members.fleet_id, ctx.spaceId), eq(fleet_members.status, "activo")))),
    flota_pedido: () => has(db.select({ n: count() }).from(fleets).where(and(eq(fleets.id, ctx.spaceId), ne(fleets.request_status, "borrador")))),
    flota_propuestas: () =>
      has(
        db
          .select({ n: count() })
          .from(fleet_votes)
          .innerJoin(fleet_members, eq(fleet_members.id, fleet_votes.member_id))
          .where(and(eq(fleet_votes.fleet_id, ctx.spaceId), eq(fleet_members.user_id, user.id))),
      ),
    flota_acuerdo: () => has(db.select({ n: count() }).from(service_agreements).where(and(eq(service_agreements.fleet_id, ctx.spaceId), eq(service_agreements.user_id, user.id)))),
    rendicion: () => has(db.select({ n: count() }).from(reimbursements).where(and(eq(reimbursements.studio_id, sid), eq(reimbursements.organization_id, ctx.spaceId), eq(reimbursements.user_id, user.id)))),
  };
  const keys = CHECKLISTS[ctx.profile].map((s) => s.key).filter((k) => checks[k]);
  const results = await Promise.all(keys.map((k) => checks[k]().catch(() => false)));
  keys.forEach((k, i) => results[i] && done.add(k));
  return done;
}

async function progressRow(ctx: OnboardingContext) {
  const db = getDb();
  const where = and(eq(onboarding_progress.user_id, ctx.user.id), eq(onboarding_progress.space_type, ctx.spaceType), eq(onboarding_progress.space_id, ctx.spaceId));
  const [row] = await db.select().from(onboarding_progress).where(where);
  if (row) return row;
  await db.insert(onboarding_progress).values({ user_id: ctx.user.id, space_type: ctx.spaceType, space_id: ctx.spaceId, profile: ctx.profile }).onConflictDoNothing();
  const [created] = await db.select().from(onboarding_progress).where(where);
  return created;
}

/** Arma la guía de la sesión y guarda los pasos recién cumplidos (con su fecha) */
export async function getGuide(ctx?: OnboardingContext | null, path?: string | null): Promise<GuideView | null> {
  const c = ctx === undefined ? await onboardingContext(path) : ctx;
  if (!c) return null;
  const row = await progressRow(c);
  const detected = await detect(c);
  const completed = { ...row.completed };
  let changed = row.profile !== c.profile;
  for (const k of detected)
    if (!completed[k]) {
      completed[k] = new Date().toISOString();
      changed = true;
    }
  if (changed) await getDb().update(onboarding_progress).set({ completed, profile: c.profile }).where(eq(onboarding_progress.id, row.id));
  return {
    profile: c.profile,
    profileLabel: PROFILE_LABEL[c.profile],
    steps: CHECKLISTS[c.profile].map((s) => ({ ...s, done: !!completed[s.key] })),
    toursSeen: Object.keys(row.tours_seen ?? {}),
    disabled: row.disabled,
  };
}

/** Marca un paso que no deja rastro propio (por ejemplo, abrir una pantalla) */
export async function markStep(key: string, path?: string) {
  const c = await onboardingContext(path);
  if (!c || !CHECKLISTS[c.profile].some((s) => s.key === key)) return;
  const row = await progressRow(c);
  if (row.completed[key]) return;
  await getDb()
    .update(onboarding_progress)
    .set({ completed: { ...row.completed, [key]: new Date().toISOString() } })
    .where(eq(onboarding_progress.id, row.id));
}

export async function setTourSeen(tourId: string, path?: string | null) {
  const c = await onboardingContext(path);
  if (!c) return;
  const row = await progressRow(c);
  await getDb()
    .update(onboarding_progress)
    .set({ tours_seen: { ...row.tours_seen, [tourId]: new Date().toISOString() } })
    .where(eq(onboarding_progress.id, row.id));
}

export async function setGuideDisabled(disabled: boolean, resetTours = false, path?: string | null) {
  const c = await onboardingContext(path);
  if (!c) return false;
  const row = await progressRow(c);
  await getDb()
    .update(onboarding_progress)
    .set({ disabled, ...(resetTours ? { tours_seen: {} } : {}) })
    .where(eq(onboarding_progress.id, row.id));
  return true;
}

/** Datos mínimos para el cliente al cargar el layout: tours vistos y si la guía está apagada */
export async function guideBoot(path?: string | null): Promise<{ toursSeen: string[]; disabled: boolean } | null> {
  const c = await onboardingContext(path);
  if (!c) return null;
  const [row] = await getDb()
    .select({ tours: onboarding_progress.tours_seen, disabled: onboarding_progress.disabled })
    .from(onboarding_progress)
    .where(and(eq(onboarding_progress.user_id, c.user.id), eq(onboarding_progress.space_type, c.spaceType), eq(onboarding_progress.space_id, c.spaceId)));
  return { toursSeen: Object.keys(row?.tours ?? {}), disabled: row?.disabled ?? false };
}
