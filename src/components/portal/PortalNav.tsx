"use client";

import { CalendarClock, FileText, House, MessageSquare } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const items = [
  { href: "/portal", label: "Inicio", icon: House, exact: true },
  { href: "/portal/vencimientos", label: "Vencimientos", icon: CalendarClock },
  { href: "/portal/documentos", label: "Documentos", icon: FileText },
  { href: "/portal/solicitudes", label: "Solicitudes", icon: MessageSquare },
];

/** Navegación del portal: barra inferior en el celular y pestañas arriba en escritorio. */
export function PortalNav({ openRequests }: { openRequests: number }) {
  const pathname = usePathname();
  const isActive = (href: string, exact?: boolean) => (exact ? pathname === href : pathname.startsWith(href));
  return (
    <>
      <nav aria-label="Portal" className="hidden border-t border-paper/10 md:block">
        <ul className="mx-auto flex max-w-5xl gap-1 px-6">
          {items.map((item) => {
            const active = isActive(item.href, item.exact);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative inline-flex items-center gap-2 px-3 py-3 text-[15px] transition-colors",
                    active ? "text-paper after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:bg-rose-light" : "text-paper/70 hover:text-paper",
                  )}
                >
                  {item.label}
                  {item.href === "/portal/solicitudes" && openRequests > 0 && (
                    <span className="rounded-full bg-rose-light px-1.5 text-xs font-semibold text-navy-deep">{openRequests}</span>
                  )}
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
        <ul className="grid grid-cols-4">
          {items.map((item) => {
            const active = isActive(item.href, item.exact);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn("flex flex-col items-center gap-1 py-2.5 text-[11px]", active ? "text-navy" : "text-muted")}
                >
                  <span className="relative">
                    <Icon className={cn("size-5", active && "text-rose-deep")} aria-hidden />
                    {item.href === "/portal/solicitudes" && openRequests > 0 && (
                      <span className="absolute -right-2 -top-1 rounded-full bg-rose-deep px-1 text-[10px] font-semibold leading-4 text-paper">
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
