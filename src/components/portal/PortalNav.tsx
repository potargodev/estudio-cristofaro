"use client";

import { Blocks, CalendarClock, Ellipsis, FileText, House, MessageSquare, Users, Video } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { PortalIcon, PortalNavItem } from "@/lib/portal-nav";
import { cn } from "@/lib/utils";

const ICONS: Record<PortalIcon, typeof House> = {
  inicio: House,
  vencimientos: CalendarClock,
  documentos: FileText,
  solicitudes: MessageSquare,
  modulo: Blocks,
  equipo: Users,
  agenda: Video,
  mas: Ellipsis,
};

/**
 * Navegación del portal: barra lateral en escritorio y barra inferior en el
 * celular (las secciones extra, como módulos y Mi equipo, van en "Más").
 */
export function PortalNav({ main, extra, openRequests }: { main: PortalNavItem[]; extra: PortalNavItem[]; openRequests: number }) {
  const pathname = usePathname();
  const isActive = (href: string, exact?: boolean) => (exact ? pathname === href : pathname.startsWith(href));
  const desktop = [...main, ...extra];
  const mobile: PortalNavItem[] = extra.length ? [...main, { href: "/portal/mas", label: "Más", icon: "mas" }] : main;
  const moreActive = pathname.startsWith("/portal/mas") || extra.some((i) => isActive(i.href));
  const badge = (item: PortalNavItem) => item.href === "/portal/solicitudes" && openRequests > 0;
  return (
    <>
      <nav aria-label="Portal" className="hidden md:block">
        <ul className="border-t border-paper/10 px-3 py-4">
          {desktop.map((item) => {
            const active = isActive(item.href, item.exact);
            const Icon = ICONS[item.icon];
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 border-l px-3 py-2.5 text-[15px] transition-colors",
                    active ? "border-rose-light bg-paper/[0.04] text-paper" : "border-transparent text-paper/65 hover:text-paper",
                  )}
                >
                  <Icon className={cn("size-4", active ? "text-rose-light" : "text-paper/45")} aria-hidden />
                  <span className="flex-1">{item.label}</span>
                  {badge(item) && <span className="tabular bg-rose-light px-1.5 text-xs font-semibold text-night">{openRequests}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <nav
        aria-label="Portal"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        <ul
          className="grid"
          style={{
            gridTemplateColumns: `repeat(${mobile.length}, minmax(0, 1fr))`,
          }}
        >
          {mobile.map((item) => {
            const active = item.icon === "mas" ? moreActive : isActive(item.href, item.exact);
            const Icon = ICONS[item.icon];
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn("flex flex-col items-center gap-1 py-2.5 text-[11px]", active ? "text-navy" : "text-muted")}
                >
                  <span className="relative">
                    <Icon className={cn("size-5", active && "text-rose-deep")} aria-hidden />
                    {badge(item) && (
                      <span className="absolute -right-2 -top-1 rounded-[2px] bg-rose-deep px-1 text-[10px] font-semibold leading-4 text-paper">
                        {openRequests}
                      </span>
                    )}
                  </span>
                  <span className={cn(active && "font-semibold")}>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
