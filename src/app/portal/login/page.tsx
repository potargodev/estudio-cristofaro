import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";
import { PortalAccess } from "@/components/auth/PortalAccess";
import { isDbConfigured } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { AUTH_ERRORS, googleEnabled } from "@/lib/auth-server";

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

export default async function PortalLoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const user = isDbConfigured ? await getCurrentUser().catch(() => null) : null;
  // El staff no usa el portal
  if (user) redirect(user.role === "cliente" ? "/portal" : "/admin");
  return (
    <AuthShell title="Portal de clientes" subtitle="Estudio Cristofaro" footer={<p>Sin contraseñas: entrás con Google o con un enlace a tu mail.</p>}>
      <PortalAccess google={googleEnabled()} error={errorText(error)} />
    </AuthShell>
  );
}
