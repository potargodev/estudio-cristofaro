import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { FaroLogo } from "@/components/admin/kit/FaroLogo";
import { GuideButton, GuideHost, HelpLink } from "@/components/app/Guide";
import { ThemeToggle } from "@/components/app/ThemeToggle";
import { Toaster } from "@/components/ui/sonner";
import { guideBoot } from "@/modules/onboarding/server";

export const metadata: Metadata = { title: { default: "Flotas", template: "%s · Flotas" }, robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Flotas: grupos informales que piden juntos una propuesta a un estudio */
export default async function FlotasLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="admin-shell app-ui min-h-dvh bg-canvas text-ink">
      <header className="keep-dark sticky top-0 z-30 bg-night text-paper">
        <div className="mx-auto flex h-14 max-w-4xl items-center gap-3 px-4 sm:px-6">
          <Link href="/flotas" aria-label="Flotas, inicio">
            <FaroLogo size="sm" sub="Flotas" />
          </Link>
          <span className="flex-1" />
          <Link href="/personal" className="hidden items-center gap-1.5 text-[13px] text-paper/75 hover:text-paper sm:inline-flex">
            <ArrowLeft className="size-3.5" aria-hidden /> Volver a tu panel
          </Link>
          <GuideButton compact className="text-paper/75 hover:text-paper" />
          <HelpLink compact className="text-paper/75 hover:text-paper" />
          <ThemeToggle className="text-paper/75 hover:text-paper" />
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl px-4 pb-24 pt-6 sm:px-6 sm:pt-8">{children}</main>
      <GuideHost boot={await guideBoot()} />
      <Toaster position="top-center" />
    </div>
  );
}
