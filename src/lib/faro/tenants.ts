import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { service_plans, studios, users } from "@/db/schema";
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
    if (dup && t.kind === "personal") return { ok: false, message: "Ya hay una cuenta de Faro Personal con ese CUIT." };
  }
  const [studio] = await db
    .insert(studios)
    .values({ slug: await uniqueSlug(name), name, kind: t.kind, plan_key: plan.key, cuit, created_via: t.via })
    .returning({ id: studios.id });
  try {
    const user = await createUserWithPassword(db, {
      studioId: studio.id,
      name: t.owner.name.trim().slice(0, 120) || email.split("@")[0],
      email,
      password: t.owner.password,
      role: t.kind === "personal" ? "autonomo" : "admin",
    });
    if (t.owner.mustChangePassword) await db.update(users).set({ mustChangePassword: true }).where(eq(users.id, user.id));
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
