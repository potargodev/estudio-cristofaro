import type { Metadata } from "next";
import Link from "next/link";
import { FaroLogo } from "@/components/admin/kit/FaroLogo";
import { PersonalNav } from "@/components/faro/PersonalNav";
import { Toaster } from "@/components/ui/sonner";
import { signOut } from "../admin/actions";

export const metadata: Metadata = { title: { default: "Faro Personal", template: "%s · Faro Personal" }, robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Panel del autónomo (Faro Personal): pensado para el celular, con barra inferior */
export default function PersonalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="admin-shell min-h-dvh bg-paper pb-[calc(72px+env(safe-area-inset-bottom))] text-ink md:pb-0">
      <header className="sticky top-0 z-30 bg-night text-paper">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-4 px-4 sm:px-6">
          <Link href="/personal" aria-label="Faro Personal, inicio">
            <FaroLogo size="sm" sub="Personal" />
          </Link>
          <span className="flex-1" />
          <PersonalNav variant="top" />
          <form action={signOut}>
            <button type="submit" className="text-[13px] text-paper/75 underline-offset-4 hover:underline">
              Salir
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl px-4 pt-6 sm:px-6 sm:pt-8">{children}</main>
      <PersonalNav variant="bottom" />
      <Toaster position="top-center" />
    </div>
  );
}
