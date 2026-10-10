import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { FaroLogo } from "@/components/admin/kit/FaroLogo";
import { Toaster } from "@/components/ui/sonner";
import { getGastosActor, homeOf } from "@/modules/gastos/server/actor";
import { gastosSignOut } from "./actions";

export const metadata: Metadata = { title: { default: "Gastos compartidos", template: "%s · Gastos compartidos" }, robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const PANEL: Record<string, string> = { "/admin": "Volver al estudio", "/portal": "Volver al portal", "/personal": "Volver a tu panel" };

/** Gastos compartidos: mismo lugar para todos (estudio, autónomo, portal, empleados e invitados) */
export default async function GastosLayout({ children }: { children: React.ReactNode }) {
  const actor = await getGastosActor();
  const home = actor ? homeOf(actor) : null;
  return (
    <div className="admin-shell min-h-dvh bg-paper text-ink">
      <header className="sticky top-0 z-30 bg-night text-paper">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-4 sm:px-6">
          <Link href={actor ? "/gastos" : "/gastos/entrar"} aria-label="Gastos compartidos, inicio">
            <FaroLogo size="sm" sub="Gastos compartidos" />
          </Link>
          <span className="flex-1" />
          {home && (
            <Link href={home} className="hidden items-center gap-1.5 text-[13px] text-paper/75 hover:text-paper sm:inline-flex">
              <ArrowLeft className="size-3.5" aria-hidden />
              {PANEL[home] ?? "Volver"}
            </Link>
          )}
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
