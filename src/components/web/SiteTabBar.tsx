"use client";

import { CalendarPlus, House, LayoutGrid, LogIn, Tags } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SCHEDULE_HREF } from "@/lib/site";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/", label: "Inicio", icon: House, exact: true },
  { href: "/#plataforma", label: "Plataforma", icon: LayoutGrid },
  { href: SCHEDULE_HREF, label: "Agendar", icon: CalendarPlus, primary: true },
  { href: "/planes", label: "Planes", icon: Tags },
  { href: "/portal/login", label: "Ingresar", icon: LogIn },
];

/**
 * Menú inferior del sitio en el celular, como en una app. "Agendar" va al
 * centro y destacado en rosé. Respeta la zona segura del iPhone.
 */
export function SiteTabBar() {
  const pathname = usePathname();
  return (
    <nav aria-label="Accesos rápidos" className="fixed inset-x-0 bottom-0 z-40 border-t border-paper/10 bg-night/95 pb-[env(safe-area-inset-bottom)] text-paper backdrop-blur lg:hidden">
      <ul className="grid grid-cols-5 items-end">
        {TABS.map((t) => {
          const active = t.exact ? pathname === t.href : !t.href.includes("#") && pathname.startsWith(t.href);
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={cn("flex flex-col items-center gap-1 pb-2 pt-2.5 text-[11px]", active ? "text-paper" : "text-paper/65")}
              >
                {t.primary ? (
                  <span className="-mt-6 grid size-12 place-items-center bg-rose-light text-night shadow-[0_10px_24px_-8px_rgba(0,0,0,0.6)]">
                    <t.icon className="size-[22px]" strokeWidth={1.5} aria-hidden />
                  </span>
                ) : (
                  <t.icon className={cn("size-[22px]", active && "text-rose-light")} strokeWidth={1.5} aria-hidden />
                )}
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
