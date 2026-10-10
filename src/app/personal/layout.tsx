import type { Metadata } from "next";
import { LegalGate } from "@/components/app/LegalGate";
import { GuideButton, GuideHost, HelpLink } from "@/components/app/Guide";
import { guideBoot } from "@/modules/onboarding/server";
import Link from "next/link";
import { FaroLogo } from "@/components/admin/kit/FaroLogo";
import { ThemeToggle } from "@/components/app/ThemeToggle";
import { PersonalNav } from "@/components/faro/PersonalNav";
import { Toaster } from "@/components/ui/sonner";
import { signOut } from "../admin/actions";
import { endAssistedAccess } from "../faro-manager/actions";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = { title: { default: "Faro", template: "%s · Faro" }, robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Panel del autónomo o de la persona: pensado para el celular, con barra inferior */
export default async function PersonalLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  return (
    <div className="admin-shell app-ui min-h-dvh bg-canvas pb-[calc(72px+env(safe-area-inset-bottom))] text-ink md:pb-0">
      <header className="sticky top-0 z-30 bg-night text-paper">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-4 px-4 sm:px-6">
          <Link href="/personal" aria-label="Faro Personal, inicio">
            <FaroLogo size="sm" sub="Personal" />
          </Link>
          <span className="flex-1" />
          <PersonalNav variant="top" />
          <GuideButton compact className="text-paper/75 hover:text-paper" />
          <HelpLink compact className="text-paper/75 hover:text-paper" />
          <ThemeToggle className="text-paper/75 hover:text-paper" />
          <form action={signOut}>
            <button type="submit" className="text-[13px] text-paper/75 underline-offset-4 hover:underline">
              Salir
            </button>
          </form>
        </div>
      </header>
      {user?.assisted && (
        <div role="status" className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-[#e3cf9f] bg-[#fbf5e6] px-4 py-2 text-[13px] text-[#7a5410] sm:px-6">
          <span>
            <strong className="font-medium">Acceso asistido de Faro</strong> a {user.assisted.studioName} hasta{" "}
            {user.assisted.expiresAt.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}. Todo queda en la auditoría.
          </span>
          <form action={endAssistedAccess}>
            <button type="submit" className="font-medium underline underline-offset-4">
              Terminar el acceso
            </button>
          </form>
        </div>
      )}
      <LegalGate back="/personal" />
      <main className="mx-auto w-full max-w-5xl px-4 pt-6 sm:px-6 sm:pt-8">{children}</main>
      <PersonalNav variant="bottom" />
      <GuideHost boot={await guideBoot()} />
      <Toaster position="top-center" />
    </div>
  );
}
