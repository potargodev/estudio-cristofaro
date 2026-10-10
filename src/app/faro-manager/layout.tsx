import type { Metadata } from "next";
import Link from "next/link";
import { FaroLogo } from "@/components/admin/kit/FaroLogo";
import { SubmitButton } from "@/components/admin/ui";
import { ThemeToggle } from "@/components/app/ThemeToggle";
import { Toaster } from "@/components/ui/sonner";
import { requireFaro } from "@/lib/auth";
import { signOut } from "../admin/actions";

export const metadata: Metadata = { title: { default: "Faro Manager", template: "%s · Faro Manager" }, robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function FaroManagerLayout({ children }: { children: React.ReactNode }) {
  const faro = await requireFaro();
  return (
    <div className="admin-shell app-ui min-h-dvh bg-canvas text-ink">
      <header className="sticky top-0 z-30 bg-night text-paper">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-4 px-4 sm:px-6 lg:px-8">
          <Link href="/faro-manager" aria-label="Faro Manager">
            <FaroLogo size="sm" sub="Manager" />
          </Link>
          <nav aria-label="Faro Manager" className="ml-2 hidden items-center gap-1 text-[14px] sm:flex">
            <Link href="/faro-manager" className="px-3 py-2 text-paper/80 hover:text-paper">
              Tenants
            </Link>
            {faro.faroRole === "owner" && (
              <Link href="/faro-manager/nuevo" className="px-3 py-2 text-paper/80 hover:text-paper">
                Alta manual
              </Link>
            )}
            <Link href="/faro-manager/planes" className="px-3 py-2 text-paper/80 hover:text-paper">
              Planes y módulos
            </Link>
          </nav>
          <span className="flex-1" />
          <span className="hidden text-[13px] text-paper/60 md:inline">
            {faro.name} · {faro.faroRole === "owner" ? "Owner" : "Soporte"}
          </span>
          <Link href="/admin" className="text-[13px] text-paper/80 underline-offset-4 hover:underline">
            Mi estudio
          </Link>
          <ThemeToggle className="text-paper/75 hover:text-paper" />
          <form action={signOut}>
            <SubmitButton variant="secondary" pendingText="…">
              Salir
            </SubmitButton>
          </form>
        </div>
        <nav aria-label="Faro Manager" className="flex gap-1 overflow-x-auto border-t border-paper/10 px-4 text-[14px] sm:hidden">
          <Link href="/faro-manager" className="px-3 py-2 text-paper/80">
            Tenants
          </Link>
          {faro.faroRole === "owner" && (
            <Link href="/faro-manager/nuevo" className="px-3 py-2 text-paper/80">
              Alta manual
            </Link>
          )}
          <Link href="/faro-manager/planes" className="px-3 py-2 text-paper/80">
            Planes
          </Link>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-[1440px] px-4 pb-16 pt-6 sm:px-6 sm:pt-8 lg:px-8">{children}</main>
      <Toaster position="top-center" />
    </div>
  );
}
