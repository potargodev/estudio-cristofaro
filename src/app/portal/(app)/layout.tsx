import type { Metadata } from "next";
import Link from "next/link";
import { PortalNav } from "@/components/portal/PortalNav";
import { Monogram } from "@/components/site/Logo";
import { Toaster } from "@/components/ui/sonner";
import { requireClient } from "@/lib/auth";
import { getRequests } from "@/lib/portal-data";
import { portalSignOut } from "../actions";

export const metadata: Metadata = {
  title: { default: "Tu portal", template: "%s · Tu portal" },
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const me = await requireClient();
  const open = await getRequests(me, true);

  return (
    <div className="min-h-dvh bg-paper">
      <header className="bg-navy text-paper">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/portal" className="flex min-w-0 items-center gap-2.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-full border border-rose-light/60 text-rose-light">
              <Monogram className="size-6" />
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block truncate font-display text-lg">{me.clientName}</span>
              <span className="block text-xs text-paper/70">Portal de clientes · Estudio Cristofaro</span>
            </span>
          </Link>
          <form action={portalSignOut}>
            <button type="submit" className="rounded-md border border-paper/30 px-3 py-1.5 text-sm text-paper/90 transition-colors hover:bg-paper/10">
              Salir
            </button>
          </form>
        </div>
        <PortalNav openRequests={open.length} />
      </header>
      <main className="mx-auto max-w-5xl px-4 pb-28 pt-6 sm:px-6 md:pb-12 md:pt-8">{children}</main>
      <Toaster position="top-center" />
    </div>
  );
}
