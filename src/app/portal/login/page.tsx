import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";
import { PortalAccess } from "@/components/auth/PortalAccess";
import { isDbConfigured } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { AUTH_ERRORS, googleEnabled } from "@/lib/auth-server";
import { homeFor } from "@/lib/roles";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { studios } from "@/db/schema";
import { brandByHost, portalBrand } from "@/modules/white-label/server";

export const metadata: Metadata = { title: "Ingresar al portal", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Errores que vuelven de Google o del enlace (?error=CODIGO) */
function errorText(code?: string) {
  if (!code) return null;
  if (code in AUTH_ERRORS) return AUTH_ERRORS[code as keyof typeof AUTH_ERRORS];
  if (code === "INVALID_TOKEN" || code === "EXPIRED_TOKEN") return "El enlace venció o ya se usó. Pedí uno nuevo.";
  if (code === "access_denied") return "Cancelaste el ingreso con Google.";
  return "No pudimos completar el ingreso. Probá de nuevo o pedí un enlace por mail.";
}

/** Marca blanca en el ingreso: por el dominio propio verificado o por ?estudio=<slug> */
async function loginBrand(slug?: string) {
  if (!isDbConfigured) return { brand: null, custom: false };
  const byHost = await brandByHost((await headers()).get("host")).catch(() => null);
  if (byHost) return { brand: byHost, custom: true };
  if (!slug || !/^[a-z0-9-]{2,60}$/.test(slug)) return { brand: null, custom: false };
  const [s] = await getDb().select({ id: studios.id }).from(studios).where(eq(studios.slug, slug));
  return { brand: s ? await portalBrand(s.id).catch(() => null) : null, custom: false };
}

export default async function PortalLoginPage({ searchParams }: { searchParams: Promise<{ error?: string; estudio?: string }> }) {
  const { error, estudio } = await searchParams;
  const { brand, custom } = await loginBrand(estudio);
  const user = isDbConfigured ? await getCurrentUser().catch(() => null) : null;
  // El staff no usa el portal
  if (user) redirect(homeFor(user.role));
  return (
    <AuthShell brand="studio" title="Portal de clientes" subtitle={brand?.name ?? "Estudio Cristofaro"} logoUrl={brand?.logoUrl} vars={brand?.vars} footer={<p>{custom ? "Sin contraseñas: entrás con un enlace a tu mail." : "Sin contraseñas: entrás con Google o con un enlace a tu mail."}</p>}>
      <PortalAccess google={googleEnabled() && !custom} error={errorText(error)} />
    </AuthShell>
  );
}
