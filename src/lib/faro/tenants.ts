import "server-only";
import { and, asc, desc, eq, gt, isNull, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { legal_entities, organizations, service_plans, signup_requests, studios, users } from "@/db/schema";
import { SERVICE_PLANS } from "@/lib/service-plans";
import { createUserWithPassword } from "@/lib/users";
import { DEFAULT_PLAN, getPlan, type TenantKind } from "./plans";

// Alta de tenants (estudios y autónomos). La usan el Faro Manager (alta
// manual) y el autoregistro de la landing: misma validación para los dos.

export const SITE_STUDIO_SLUG = () => process.env.STUDIO_SLUG?.trim() || "cristofaro";

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** CUIT válido (11 dígitos con dígito verificador) o null */
export function normalizeCuit(v: string | null | undefined): string | null {
  const d = (v ?? "").replace(/\D/g, "");
  if (d.length !== 11) return null;
  const w = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = w.reduce((s, x, i) => s + x * Number(d[i]), 0);
  const mod = 11 - (sum % 11);
  const check = mod === 11 ? 0 : mod === 10 ? 9 : mod;
  return check === Number(d[10]) ? d : null;
}

function slugify(name: string) {
  return (
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "estudio"
  );
}

async function uniqueSlug(name: string) {
  const base = slugify(name);
  for (let i = 0; i < 50; i++) {
    const slug = i ? `${base}-${i + 1}` : base;
    const [hit] = await getDb().select({ id: studios.id }).from(studios).where(eq(studios.slug, slug));
    if (!hit) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export interface NewTenant {
  kind: TenantKind;
  name: string;
  planKey?: string;
  cuit?: string | null;
  /** Régimen del autónomo (monotributo | responsable_inscripto) */
  taxRegime?: string | null;
  /** Rubros (claves de /data/industries) */
  industries?: string[];
  owner: { name: string; email: string; password: string; mustChangePassword?: boolean };
  via: "manual" | "registro";
}

export type NewTenantResult = { ok: true; studioId: string; userId: string } | { ok: false; message: string };

export async function createTenant(t: NewTenant): Promise<NewTenantResult> {
  const email = t.owner.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { ok: false, message: "Revisá el email." };
  if (t.owner.password.length < 8) return { ok: false, message: "La contraseña tiene que tener al menos 8 caracteres." };
  const name = t.name.trim().slice(0, 120);
  if (name.length < 2) return { ok: false, message: "Completá el nombre." };
  const plan = getPlan(t.planKey ?? DEFAULT_PLAN[t.kind]);
  if (!plan || plan.kind !== t.kind) return { ok: false, message: "Ese plan no corresponde a este tipo de cuenta." };
  let cuit: string | null = null;
  if (t.kind === "personal" || t.cuit) {
    cuit = normalizeCuit(t.cuit);
    if (!cuit) return { ok: false, message: "Revisá el CUIT: tiene que tener 11 números y el dígito verificador correcto." };
  }
  const db = getDb();
  const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (taken) return { ok: false, message: "Ya hay una cuenta con ese email. Entrá con tu contraseña o recuperala." };
  if (cuit) {
    const [dup] = await db.select({ id: studios.id }).from(studios).where(eq(studios.cuit, cuit));
    if (dup && t.kind !== "studio") return { ok: false, message: "Ya hay una cuenta de Faro Personal con ese CUIT." };
  }
  const [studio] = await db
    .insert(studios)
    .values({
      slug: await uniqueSlug(name),
      name,
      kind: t.kind,
      plan_key: plan.key,
      cuit,
      created_via: t.via,
      legal_name: name,
      tax_regime: t.taxRegime ?? null,
      industries: (t.industries ?? []).slice(0, 12),
      // Planes pagos arrancan con la prueba gratis (el cobro llega en la F7)
      status: plan.trialDays > 0 && !plan.free ? "prueba" : "activo",
      trial_ends_at: plan.trialDays > 0 && !plan.free ? new Date(Date.now() + plan.trialDays * 86400000) : null,
    })
    .returning({ id: studios.id });
  try {
    const user = await createUserWithPassword(db, {
      studioId: studio.id,
      name: t.owner.name.trim().slice(0, 120) || email.split("@")[0],
      email,
      password: t.owner.password,
      role: t.kind === "studio" ? "dueno" : "titular",
    });
    if (t.owner.mustChangePassword) await db.update(users).set({ mustChangePassword: true }).where(eq(users.id, user.id));
    await db.update(studios).set({ owner_user_id: user.id }).where(eq(studios.id, studio.id));
    // Cuenta personal: una sola organización, la propia (contexto de sus gastos y, después, su facturación)
    if (t.kind !== "studio") {
      const [org] = await db.insert(organizations).values({ studio_id: studio.id, name, status: "activa" }).returning({ id: organizations.id });
      if (cuit)
        await db.insert(legal_entities).values({
          studio_id: studio.id,
          organization_id: org.id,
          cuit,
          business_name: name,
          regime: t.taxRegime === "responsable_inscripto" ? "responsable_inscripto" : "monotributo",
        });
    }
    // Un estudio arranca con los planes de servicio del brief para sus organizaciones
    if (t.kind === "studio") await db.insert(service_plans).values(SERVICE_PLANS.map((p) => ({ ...p, features: [...p.features], studio_id: studio.id })));
    return { ok: true, studioId: studio.id, userId: user.id };
  } catch (error) {
    await db.delete(studios).where(eq(studios.id, studio.id));
    const code = (error as { cause?: { code?: string }; code?: string }).cause?.code ?? (error as { code?: string }).code;
    if (code === "23505") return { ok: false, message: "Ya hay una cuenta con ese email." };
    console.error("[faro] createTenant", error);
    return { ok: false, message: "No se pudo crear la cuenta. Probá de nuevo." };
  }
}

/** Organización propia de una cuenta personal (la única que tiene) */
export async function ownOrganization(studioId: string) {
  const [o] = await getDb()
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .innerJoin(studios, eq(studios.id, organizations.studio_id))
    .where(and(eq(organizations.studio_id, studioId), ne(studios.kind, "studio")))
    .orderBy(asc(organizations.created_at))
    .limit(1);
  return o ?? null;
}

// ── Autoregistro sin contraseña (persona o autónomo) ─────────────────────

/** Cuenta propia: dueño, organización propia y su razón social (si hay CUIT) */
export async function finalizePersonalTenant(studioId: string, userId: string) {
  const db = getDb();
  const [t] = await db.select().from(studios).where(eq(studios.id, studioId));
  if (!t || t.kind === "studio") return;
  await db.update(studios).set({ owner_user_id: userId }).where(and(eq(studios.id, studioId), isNull(studios.owner_user_id)));
  if (await ownOrganization(studioId)) return;
  const [org] = await db.insert(organizations).values({ studio_id: studioId, name: t.name, status: "activa" }).returning({ id: organizations.id });
  if (t.cuit)
    await db.insert(legal_entities).values({
      studio_id: studioId,
      organization_id: org.id,
      cuit: t.cuit,
      business_name: t.name,
      regime: t.tax_regime === "responsable_inscripto" ? "responsable_inscripto" : "monotributo",
    });
}

/** Pedido de alta vigente para un email (lo usa el hook de creación de usuario de Better Auth) */
export async function pendingSignup(email: string) {
  const [r] = await getDb()
    .select()
    .from(signup_requests)
    .where(and(eq(signup_requests.email, email.trim().toLowerCase()), isNull(signup_requests.used_at), gt(signup_requests.expires_at, new Date())))
    .orderBy(desc(signup_requests.created_at))
    .limit(1);
  return r ?? null;
}

/** Crea el tenant de un pedido de alta (el usuario lo crea Better Auth con este studioId) */
export async function tenantFromSignup(r: typeof signup_requests.$inferSelect) {
  const db = getDb();
  const plan = getPlan(DEFAULT_PLAN[r.kind])!;
  const [studio] = await db
    .insert(studios)
    .values({ slug: await uniqueSlug(r.name), name: r.name, kind: r.kind, plan_key: plan.key, cuit: r.cuit, created_via: "registro", legal_name: r.name, tax_regime: (r.data.taxRegime as string) ?? null })
    .returning({ id: studios.id });
  await db.update(signup_requests).set({ used_at: new Date(), studio_id: studio.id }).where(eq(signup_requests.id, r.id));
  return studio.id;
}
