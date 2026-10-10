import type { Metadata } from "next";
import { AppFrame } from "@/components/app/shell/AppFrame";
import { getCurrentUser } from "@/lib/auth";
import { HelpLink } from "@/components/app/Guide";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { FaroLogo } from "@/components/admin/kit/FaroLogo";
import { ThemeToggle } from "@/components/app/ThemeToggle";
import { Toaster } from "@/components/ui/sonner";
import { homeOf } from "@/modules/gastos/server/actor";
import { getGastosActor } from "@/modules/gastos/server/session";
import { gastosSignOut } from "./actions";

export const metadata: Metadata = { title: { default: "Grupos de gastos", template: "%s · Grupos de gastos" }, robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const PANEL: Record<string, string> = { "/admin": "Volver al estudio", "/portal": "Volver al portal", "/personal": "Volver a tu panel" };

/** Grupos de gastos: mismo lugar para todos (estudio, autónomo, portal, empleados e invitados) */
export default async function GastosLayout({ children }: { children: React.ReactNode }) {
  // Con cuenta: dentro del marco de la app (menú, barra superior y selector de espacio)
  const user = await getCurrentUser().catch(() => null);
  if (user)
    return (
      <AppFrame>
        <div className="mx-auto w-full max-w-3xl">{children}</div>
      </AppFrame>
    );
  // Invitado sin cuenta (link mágico del grupo): pantalla simple, solo su grupo
  const actor = await getGastosActor();
  const home = actor ? homeOf(actor) : null;
  return (
    <div className="admin-shell app-ui min-h-dvh bg-canvas text-ink">
      <header className="sticky top-0 z-30 bg-night text-paper">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-4 sm:px-6">
          <Link href={actor ? "/grupos" : "/grupos/entrar"} aria-label="Grupos de gastos, inicio">
            <FaroLogo size="sm" sub="Grupos de gastos" />
          </Link>
          <span className="flex-1" />
          {home && (
            <Link href={home} className="hidden items-center gap-1.5 text-[13px] text-paper/75 hover:text-paper sm:inline-flex">
              <ArrowLeft className="size-3.5" aria-hidden />
              {PANEL[home] ?? "Volver"}
            </Link>
          )}
          <HelpLink compact className="text-paper/75 hover:text-paper" />
          <ThemeToggle className="text-paper/75 hover:text-paper" />
          {actor && (
            <form action={gastosSignOut}>
              <button type="submit" className="text-[13px] text-paper/75 underline-offset-4 hover:underline">
                Salir
              </button>
            </form>
          )}
        </div>
        {home && (
          <Link href={home} className="flex items-center gap-1.5 border-t border-paper/10 px-4 py-2 text-[13px] text-paper/70 sm:hidden">
            <ArrowLeft className="size-3.5" aria-hidden />
            {PANEL[home] ?? "Volver"}
          </Link>
        )}
      </header>
      <main className="mx-auto w-full max-w-3xl px-4 pb-32 pt-6 sm:px-6 sm:pt-8">{children}</main>
      <Toaster position="top-center" />
    </div>
  );
}
