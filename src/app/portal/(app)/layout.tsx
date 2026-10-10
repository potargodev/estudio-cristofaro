import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { LegalGate } from "@/components/app/LegalGate";
import { getDb } from "@/db";
import { studios } from "@/db/schema";
import { GuideButton, GuideHost, HelpLink } from "@/components/app/Guide";
import { guideBoot } from "@/modules/onboarding/server";
import Link from "next/link";
import { ThemeToggle } from "@/components/app/ThemeToggle";
import { PortalNav } from "@/components/portal/PortalNav";
import { Monogram } from "@/components/site/Logo";
import { Toaster } from "@/components/ui/sonner";
import { OrgSwitcher } from "@/components/portal/OrgSwitcher";
import { requireMember } from "@/lib/auth";
import { canSeeRequests } from "@/lib/permissions";
import { buildPortalNav } from "@/lib/portal-nav";
import { getRequests } from "@/lib/portal-data";
import { RouteReveal } from "@/components/app/RouteReveal";
import { portalSignOut } from "../actions";

export const metadata: Metadata = {
  title: { default: "Tu portal", template: "%s · Tu portal" },
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const me = await requireMember();
  const open = canSeeRequests(me.orgRole) ? await getRequests(me, true) : [];
  const nav = buildPortalNav(me.orgRole, me.modules);
  const [studio] = await getDb().select({ name: studios.name }).from(studios).where(eq(studios.id, me.studioId));

  return (
    <div className="app-ui min-h-dvh bg-canvas md:grid md:grid-cols-[248px_1fr]">
      <aside className="bg-night text-paper md:sticky md:top-0 md:flex md:h-dvh md:flex-col md:border-r md:border-paper/10">
        <div className="flex items-center justify-between gap-4 px-4 py-3 md:block md:px-5 md:pb-6 md:pt-7">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/portal"
              aria-label="Inicio del portal"
              className="grid size-9 shrink-0 place-items-center border border-rose-light/50 text-rose-light"
            >
              <Monogram className="size-6" />
            </Link>
            <div className="min-w-0 leading-tight">
              {me.memberships.length > 1 ? (
                <OrgSwitcher
                  current={me.organizationId}
                  options={me.memberships.map((m) => ({
                    id: m.organizationId,
                    name: m.organizationName,
                  }))}
                />
              ) : (
                <span className="block truncate font-display text-lg">{me.organizationName}</span>
              )}
              <span className="block text-xs text-paper/60">Portal · {studio?.name ?? "tu estudio"}</span>
            </div>
          </div>
          <div className="flex items-center gap-1 md:hidden">
          <GuideButton compact className="text-paper/80 hover:text-paper" />
          <HelpLink compact className="text-paper/80 hover:text-paper" />
          <ThemeToggle className="text-paper/80 hover:text-paper" />
          <form action={portalSignOut}>
            <button type="submit" className="border border-paper/25 px-3 py-1.5 text-sm text-paper/90 transition-colors hover:border-paper/60">
              Salir
            </button>
          </form>
          </div>
        </div>
        <PortalNav main={nav.main} extra={nav.extra} openRequests={open.length} />
        <div className="mt-auto hidden items-center justify-between border-t border-paper/10 px-5 py-4 md:flex">
        <form action={portalSignOut}>
          <button type="submit" className="text-sm text-paper/70 transition-colors hover:text-paper">
            Cerrar sesión
          </button>
        </form>
        <ThemeToggle withLabel className="-mr-2.5 text-paper/70 hover:text-paper" />
        </div>
        <p className="hidden px-5 pb-4 text-[11px] text-paper/40 md:block">Con tecnología de Faro</p>
      </aside>
      <main className="mx-auto w-full max-w-5xl px-4 pb-28 pt-6 sm:px-6 md:px-10 md:pb-14 md:pt-10">
        <div className="mb-4 hidden justify-end gap-2 md:flex">
          <GuideButton className="rounded-md border border-line bg-surface text-ink hover:border-muted" />
          <HelpLink className="rounded-md border border-line bg-surface text-ink hover:border-muted" />
        </div>
        <LegalGate back="/portal" />
        <RouteReveal>{children}</RouteReveal>
      </main>
      <GuideHost boot={await guideBoot()} />
      <Toaster position="top-center" />
    </div>
  );
}
