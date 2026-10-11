"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

// Pestañas únicas de la app (docs/faro-producto.md §2.o, regla 7): cada
// pestaña es una URL (?tab= o una subruta), así se puede compartir, volver
// atrás y recargar sin perder la vista. Sin `active` explícito, la activa sale
// de la URL: la ruta más larga que coincide y, si la pestaña lo pide, su ?tab=.

export interface TabItem {
  href: string;
  label: string;
  /** Ícono ya renderizado (los componentes no pasan del servidor al cliente) */
  icon?: React.ReactNode;
  count?: number;
  active?: boolean;
  /** Otras rutas que también la activan */
  match?: string[];
}

const pathOf = (href: string) => href.split(/[?#]/)[0];
const tabOf = (href: string) => new URLSearchParams(href.split("?")[1]?.split("#")[0] ?? "").get("tab");
const under = (pathname: string, p: string) => pathname === p || pathname.startsWith(`${p}/`);

export function activeTab(tabs: TabItem[], pathname: string, tab: string | null) {
  if (tabs.some((t) => t.active !== undefined)) return tabs.findIndex((t) => t.active);
  let best = -1;
  let score = -1;
  tabs.forEach((t, i) => {
    for (const p of [pathOf(t.href), ...(t.match ?? [])]) {
      if (!under(pathname, p)) continue;
      const want = tabOf(t.href);
      // La ruta pesa más; a igual ruta, gana la pestaña de ese ?tab= (o la que no pide ninguno)
      const s = p.length * 4 + (want ? (want === tab ? 2 : -1) : tab ? 0 : 1);
      if (s > score) {
        best = i;
        score = s;
      }
    }
  });
  return best;
}

export function SectionTabs({ tabs, label = "Secciones", className }: { tabs: TabItem[]; label?: string; className?: string }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const on = activeTab(tabs, pathname, search.get("tab"));
  if (tabs.length < 2) return null;
  return (
    <nav aria-label={label} className={cn("-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0", className)}>
      <ul className="flex min-w-max gap-1 border-b border-line">
        {tabs.map((t, i) => (
          <li key={t.href}>
            <Link
              href={t.href}
              scroll={false}
              aria-current={i === on ? "page" : undefined}
              className={cn(
                "-mb-px flex h-10 items-center gap-2 border-b-2 px-3 text-ui transition-colors",
                i === on ? "border-navy font-semibold text-ink" : "border-transparent text-muted hover:text-ink",
              )}
            >
              {t.icon && <span className={cn("[&>svg]:size-4", i === on && "text-rose-deep")}>{t.icon}</span>}
              {t.label}
              {!!t.count && <span className="num rounded-md bg-navy-soft px-1.5 text-caption leading-5 text-ink">{t.count}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
