import "server-only";
import { randomBytes } from "node:crypto";
import { resolveTxt } from "node:dns/promises";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { studio_branding, studios } from "@/db/schema";
import { audit } from "@/lib/audit";
import { hasModule } from "@/lib/faro/entitlements";
import { getSiteUrl } from "@/lib/runtime-config";
import { checkUpload, deleteStored, storeUpload } from "@/lib/uploads";
import { brandVars, checkColors, normalizeDomain, reservedHost, txtName } from "./core";

// Marca blanca (white_label, plan Avanzado): logo, colores y dominio propio
// del estudio en el portal de sus clientes, siempre con "Con tecnología de
// Faro". Solo el dueño la configura; todo sale del estudio de la sesión.

export class BrandingError extends Error {}
type Actor = { id: string; email: string; studioId: string };
type Branding = typeof studio_branding.$inferSelect;

/** Lo que ve el portal: null si el estudio no la tiene activa o no está en su plan */
export interface PortalBrand {
  studioId: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  vars: Record<string, string>;
}

export const whiteLabelEnabled = (studioId: string) => hasModule(studioId, "white_label");

export async function getBranding(studioId: string) {
  const [b] = await getDb().select().from(studio_branding).where(eq(studio_branding.studio_id, studioId));
  return b ?? null;
}

const toBrand = (b: Branding, studio: { slug: string; name: string }): PortalBrand => ({
  studioId: b.studio_id,
  slug: studio.slug,
  name: b.display_name?.trim() || studio.name,
  logoUrl: b.logo_path ? `/api/marca/${b.studio_id}/logo?v=${b.updated_at.getTime()}` : null,
  vars: brandVars(b.primary_color, b.accent_color),
});

/** Marca del portal de un estudio (con la sesión ya validada) */
export async function portalBrand(studioId: string): Promise<PortalBrand | null> {
  const [r] = await getDb()
    .select({ b: studio_branding, slug: studios.slug, name: studios.name })
    .from(studio_branding)
    .innerJoin(studios, eq(studios.id, studio_branding.studio_id))
    .where(eq(studio_branding.studio_id, studioId));
  if (!r || !r.b.enabled || !(await whiteLabelEnabled(studioId))) return null;
  return toBrand(r.b, r);
}

/** Marca por host: solo dominios verificados de estudios con el módulo activo */
export async function brandByHost(host: string | null): Promise<PortalBrand | null> {
  const h = host ? normalizeDomain(host) : null;
  if (!h) return null;
  const [r] = await getDb()
    .select({ b: studio_branding, slug: studios.slug, name: studios.name })
    .from(studio_branding)
    .innerJoin(studios, eq(studios.id, studio_branding.studio_id))
    .where(and(eq(studio_branding.custom_domain, h), eq(studio_branding.domain_status, "verificado")));
  if (!r || !r.b.enabled || !(await whiteLabelEnabled(r.b.studio_id))) return null;
  return toBrand(r.b, r);
}

/** Hosts de Faro y de la app: nunca pueden ser el dominio de un estudio */
function reservedHosts() {
  const fromEnv = [process.env.FARO_HOSTS, process.env.APP_HOSTS].join(",").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
  const site = normalizeDomain(getSiteUrl());
  return [...fromEnv, ...(site ? [site.split(".").slice(-2).join(".")] : []), "estudiocristofaro.com", "faro.com.ar"];
}

async function ensure(actor: Actor) {
  if (!(await whiteLabelEnabled(actor.studioId))) throw new BrandingError("La marca blanca viene con el plan Avanzado.");
  const current = await getBranding(actor.studioId);
  if (current) return current;
  const [b] = await getDb().insert(studio_branding).values({ studio_id: actor.studioId, updated_by: actor.id }).onConflictDoNothing().returning();
  return b ?? (await getBranding(actor.studioId))!;
}

export async function saveBranding(actor: Actor, i: { enabled: boolean; displayName: string | null; primary: string | null; accent: string | null }) {
  await ensure(actor);
  const primary = i.primary?.trim().toLowerCase() || null;
  const accent = i.accent?.trim().toLowerCase() || null;
  const bad = checkColors(primary, accent);
  if (bad) throw new BrandingError(bad);
  await getDb()
    .update(studio_branding)
    .set({ enabled: i.enabled, display_name: i.displayName?.trim().slice(0, 80) || null, primary_color: primary, accent_color: accent, updated_by: actor.id })
    .where(eq(studio_branding.studio_id, actor.studioId));
  await audit({ studioId: actor.studioId, actor, action: "marca.guardada", entityType: "marca", entityId: actor.studioId, metadata: { activa: i.enabled, principal: primary, acento: accent } });
}

const LOGO_TYPES: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg" };

export async function saveLogo(actor: Actor, file: File | null) {
  const current = await ensure(actor);
  if (!file) {
    if (current.logo_path) await deleteStored(current.logo_path).catch(() => undefined);
    await getDb().update(studio_branding).set({ logo_path: null, logo_mime: null, updated_by: actor.id }).where(eq(studio_branding.studio_id, actor.studioId));
    await audit({ studioId: actor.studioId, actor, action: "marca.logo", entityType: "marca", entityId: actor.studioId, metadata: { quitado: true } });
    return;
  }
  const ext = file.name.toLowerCase().match(/\.[a-z]+$/)?.[0] ?? "";
  // Sin SVG: un logo se sirve público y un SVG puede llevar scripts
  if (!LOGO_TYPES[ext]) throw new BrandingError("El logo tiene que ser PNG o JPG.");
  if (file.size > 1024 * 1024) throw new BrandingError("El logo puede pesar hasta 1 MB.");
  const check = await checkUpload(file);
  if (!check.ok) throw new BrandingError(check.error);
  const stored = await storeUpload(file, actor.studioId, "marca");
  if (current.logo_path) await deleteStored(current.logo_path).catch(() => undefined);
  await getDb().update(studio_branding).set({ logo_path: stored.storagePath, logo_mime: LOGO_TYPES[ext], updated_by: actor.id }).where(eq(studio_branding.studio_id, actor.studioId));
  await audit({ studioId: actor.studioId, actor, action: "marca.logo", entityType: "marca", entityId: actor.studioId, metadata: { archivo: stored.name, bytes: stored.sizeBytes } });
}

/** Carga (o quita) el dominio propio: queda pendiente hasta verificar el TXT */
export async function setDomain(actor: Actor, input: string) {
  await ensure(actor);
  const db = getDb();
  if (!input.trim()) {
    await db.update(studio_branding).set({ custom_domain: null, domain_status: "sin_dominio", domain_token: null, domain_verified_at: null, updated_by: actor.id }).where(eq(studio_branding.studio_id, actor.studioId));
    await audit({ studioId: actor.studioId, actor, action: "marca.dominio", entityType: "marca", entityId: actor.studioId, metadata: { quitado: true } });
    return null;
  }
  const domain = normalizeDomain(input);
  if (!domain) throw new BrandingError("Escribí un dominio válido, por ejemplo portal.tuestudio.com.ar.");
  if (reservedHost(domain, reservedHosts())) throw new BrandingError("Ese dominio no se puede usar. Usá uno de tu estudio.");
  const [taken] = await db.select({ id: studio_branding.studio_id }).from(studio_branding).where(eq(studio_branding.custom_domain, domain));
  if (taken && taken.id !== actor.studioId) throw new BrandingError("Ese dominio ya lo usa otro estudio en Faro.");
  const token = `faro-${randomBytes(12).toString("hex")}`;
  await db.update(studio_branding).set({ custom_domain: domain, domain_status: "pendiente", domain_token: token, domain_verified_at: null, domain_checked_at: null, updated_by: actor.id }).where(eq(studio_branding.studio_id, actor.studioId));
  await audit({ studioId: actor.studioId, actor, action: "marca.dominio", entityType: "marca", entityId: actor.studioId, metadata: { dominio: domain } });
  return { domain, token };
}

type TxtResolver = (name: string) => Promise<string[][]>;

/** Verifica el registro TXT del dominio (el resolver se puede inyectar en las pruebas) */
export async function verifyDomain(actor: Actor, resolver: TxtResolver = resolveTxt) {
  const b = await ensure(actor);
  if (!b.custom_domain || !b.domain_token) throw new BrandingError("Primero cargá el dominio.");
  let found = false;
  try {
    found = (await resolver(txtName(b.custom_domain))).some((r) => r.join("").trim() === b.domain_token);
  } catch {
    found = false;
  }
  await getDb()
    .update(studio_branding)
    .set({ domain_checked_at: new Date(), ...(found ? { domain_status: "verificado", domain_verified_at: new Date() } : {}) })
    .where(eq(studio_branding.studio_id, actor.studioId));
  await audit({ studioId: actor.studioId, actor, action: "marca.dominio_verificado", entityType: "marca", entityId: actor.studioId, result: found ? "ok" : "error", metadata: { dominio: b.custom_domain } });
  return found;
}
