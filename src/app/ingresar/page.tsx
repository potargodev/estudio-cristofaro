import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Sello } from "@/components/admin/kit/Sello";
import { AccessChooser } from "@/components/auth/AccessChooser";
import { isDbConfigured } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { AUTH_ERRORS, googleEnabled } from "@/lib/auth-server";
import { homeFor } from "@/lib/roles";
import { FARO_APP_METADATA } from "@/lib/faro/pwa";

export const metadata: Metadata = { ...FARO_APP_METADATA, title: { absolute: "Ingresar · Faro" }, robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

function errorText(code?: string) {
  if (!code) return null;
  // Google o enlace con un mail sin cuenta: puede ser alguien nuevo que quiere registrarse
  if (code === "SIN_INVITACION") return "No encontramos una cuenta con ese mail. Si es tu primera vez, tocá «Empezá gratis» acá abajo. Si te invitó un estudio o una organización, pedile que te vuelva a invitar.";
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
  if (user) redirect(homeFor(user.role));
  return (
    <main className="flex min-h-dvh flex-col bg-navy text-paper">
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-[calc(3rem+env(safe-area-inset-top))]">
        <Sello className="size-20 text-rose-light" />
        <h1 className="mt-8 font-display text-[34px] leading-[1.05]">Hola de nuevo.</h1>
        <p className="mt-2 text-body leading-relaxed text-paper/65">Ingresá a tu cuenta de Faro.</p>
        <div className="mt-8">
          <AccessChooser google={googleEnabled()} error={errorText(error)} />
        </div>
        <div className="mt-10 border-t border-paper/15 pt-6">
          <p className="text-body text-paper">¿Primera vez en Faro?</p>
          <p className="mt-1 text-meta leading-relaxed text-paper/60">Creá tu cuenta gratis con Google o con un enlace por mail, sin contraseña: anotá tus gastos con el Vigía y dividilos con amigos.</p>
          <Link href="/faro/registro?tipo=persona" className="mt-4 inline-flex h-12 w-full items-center justify-center border border-rose-light/60 text-body text-paper transition-colors hover:bg-paper/10">
            Empezá gratis
          </Link>
          <p className="mt-3 text-meta text-paper/50">
            <Link href="/faro" className="text-paper underline underline-offset-4 hover:text-rose-light">
              ¿Qué es Faro?
            </Link>{" "}
            ¿Sos autónomo o tenés un estudio?{" "}
            <Link href="/faro/registro" className="text-paper underline underline-offset-4 hover:text-rose-light">
              Elegí tu tipo de cuenta
            </Link>
            .
          </p>
        </div>
        <p className="mt-3 text-meta leading-relaxed text-paper/50">
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
