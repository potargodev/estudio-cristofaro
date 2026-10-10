import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Sello } from "@/components/admin/kit/Sello";
import { AccessChooser } from "@/components/auth/AccessChooser";
import { isDbConfigured } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { AUTH_ERRORS, googleEnabled } from "@/lib/auth-server";

export const metadata: Metadata = { title: "Ingresar", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

function errorText(code?: string) {
  if (!code) return null;
  if (code in AUTH_ERRORS) return AUTH_ERRORS[code as keyof typeof AUTH_ERRORS];
  if (code === "INVALID_TOKEN" || code === "EXPIRED_TOKEN") return "El enlace venció o ya se usó. Pedí uno nuevo.";
  if (code === "access_denied") return "Cancelaste el ingreso con Google.";
  return "No pudimos completar el ingreso. Probá de nuevo.";
}

/**
 * Ingreso único, pensado como la pantalla de inicio de la app: sello, saludo y
 * las tres formas de entrar. Con sesión, va directo a lo suyo.
 */
export default async function IngresarPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const user = isDbConfigured ? await getCurrentUser().catch(() => null) : null;
  if (user) redirect(user.role === "cliente" ? "/portal" : "/admin");
  return (
    <main className="flex min-h-dvh flex-col bg-navy text-paper">
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-[calc(3rem+env(safe-area-inset-top))]">
        <Sello className="size-20 text-rose-light" />
        <h1 className="mt-8 font-display text-[34px] leading-[1.05]">Hola de nuevo.</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-paper/65">Ingresá a tu cuenta de Estudio Cristofaro.</p>
        <div className="mt-8">
          <AccessChooser google={googleEnabled()} error={errorText(error)} />
        </div>
        <p className="mt-10 text-[13px] leading-relaxed text-paper/50">
          ¿Todavía no sos cliente?{" "}
          <Link href="/agendar" className="text-paper underline underline-offset-4 hover:text-rose-light">
            Agendá una llamada
          </Link>{" "}
          o{" "}
          <Link href="/" className="text-paper underline underline-offset-4 hover:text-rose-light">
            conocé el estudio
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
