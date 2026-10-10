"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { legal_entities, studios } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requireTenantOwner } from "@/lib/auth";
import { normalizeCuit, ownOrganization } from "@/lib/faro/tenants";
import { isIndustryKey } from "@/modules/industries/catalog";

// Asistente de bienvenida del dueño del tenant (estudio, autónomo o persona).
// El tenant sale de la sesión: nunca de un id del formulario.

const s = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
};
const back = (paso: number, error: string): never => redirect(`/bienvenida?paso=${paso}&error=${encodeURIComponent(error)}`);
const REGIMES = ["monotributo", "responsable_inscripto", "exento"];

/** Paso 1: datos fiscales (estudio y autónomo) */
export async function saveWelcomeData(fd: FormData) {
  const me = await requireTenantOwner();
  const db = getDb();
  const [t] = await db.select().from(studios).where(eq(studios.id, me.studioId));
  if (!t || t.kind === "persona") redirect("/bienvenida?paso=2");
  const name = s(fd, "name").slice(0, 120);
  if (name.length < 2) back(1, "Completá el nombre.");
  const rawCuit = s(fd, "cuit");
  const cuit = rawCuit ? normalizeCuit(rawCuit) : null;
  if (rawCuit && !cuit) back(1, "Revisá el CUIT: 11 números con el dígito verificador correcto.");
  if (t!.kind === "personal" && !cuit) back(1, "Tu CUIT es necesario para armar tu calendario.");
  if (cuit && cuit !== t!.cuit) {
    const [dup] = await db.select({ id: studios.id, kind: studios.kind }).from(studios).where(eq(studios.cuit, cuit));
    if (dup && dup.id !== t!.id && dup.kind !== "studio" && t!.kind !== "studio") back(1, "Ya hay otra cuenta con ese CUIT.");
  }
  const regime = REGIMES.includes(s(fd, "tax_regime")) ? s(fd, "tax_regime") : null;
  await db
    .update(studios)
    .set({ name, legal_name: s(fd, "legal_name").slice(0, 160) || name, cuit, tax_regime: regime, fiscal_address: s(fd, "fiscal_address").slice(0, 200) || null })
    .where(eq(studios.id, t!.id));
  // Autónomo: su razón social propia sigue al CUIT y al régimen
  if (t!.kind === "personal" && cuit) {
    const own = await ownOrganization(t!.id);
    if (own) {
      const [le] = await db.select({ id: legal_entities.id }).from(legal_entities).where(eq(legal_entities.organization_id, own.id));
      const values = { cuit, business_name: name, regime: regime === "responsable_inscripto" ? ("responsable_inscripto" as const) : ("monotributo" as const) };
      if (le) await db.update(legal_entities).set(values).where(eq(legal_entities.id, le.id));
      else await db.insert(legal_entities).values({ studio_id: t!.id, organization_id: own.id, ...values });
    }
  }
  await audit({ studioId: t!.id, actor: me, action: "tenant.datos", entityType: "tenant", entityId: t!.id, metadata: { origen: "bienvenida", cuit: !!cuit, regimen: regime } });
  redirect("/bienvenida?paso=2");
}

/** Paso 2: rubros (estudio: los que atiende; autónomo: el suyo; persona: qué quiere hacer) */
export async function saveWelcomeIndustries(fd: FormData) {
  const me = await requireTenantOwner();
  const db = getDb();
  const [t] = await db.select({ id: studios.id, kind: studios.kind, onboarding: studios.onboarding }).from(studios).where(eq(studios.id, me.studioId));
  if (!t) redirect("/");
  const industries = fd
    .getAll("industries")
    .filter(isIndustryKey)
    .slice(0, t!.kind === "studio" ? 12 : 1);
  const goal = ["grupos", "red", "flotas"].includes(s(fd, "goal")) ? s(fd, "goal") : null;
  await db
    .update(studios)
    .set({ industries: t!.kind === "persona" ? [] : industries, onboarding: { ...t!.onboarding, wizard: true, ...(goal ? { [`objetivo_${goal}`]: true } : {}) } })
    .where(eq(studios.id, t!.id));
  await audit({ studioId: t!.id, actor: me, action: "tenant.bienvenida", entityType: "tenant", entityId: t!.id, metadata: { rubros: industries, objetivo: goal } });
  redirect("/bienvenida?paso=3");
}
