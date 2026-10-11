import "server-only";
import { eq } from "drizzle-orm";
import type { NavAccess } from "@/components/admin/shell/nav";
import { getDb } from "@/db";
import { studios } from "@/db/schema";
import { TENANT_OWNERS, type StaffUser } from "./auth";
import { getEntitlements } from "./faro/entitlements";
import { SITE_STUDIO_SLUG } from "./faro/tenants";

/** Qué secciones y pestañas ve la sesión en el espacio del estudio (o de la cuenta personal) */
export async function studioAccess(user: StaffUser): Promise<NavAccess> {
  const [[studio], ent] = await Promise.all([getDb().select({ slug: studios.slug }).from(studios).where(eq(studios.id, user.studioId)), getEntitlements(user.studioId)]);
  return {
    isAdmin: TENANT_OWNERS.includes(user.role),
    isOperator: user.role !== "colaborador",
    isPersonal: user.tenantKind !== "studio",
    modules: ent ? [...ent.modules] : undefined,
    hasSite: studio?.slug === SITE_STUDIO_SLUG(),
    isFaro: Boolean(user.faroRole),
  };
}
