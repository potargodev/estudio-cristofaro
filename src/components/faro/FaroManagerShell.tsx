"use client";

import {
  ArrowLeft,
  Blocks,
  Building2,
  ChevronsLeft,
  ChevronsRight,
  CircleHelp,
  ClipboardList,
  Factory,
  LayoutDashboard,
  LogOut,
  Menu,
  ScrollText,
  Tags,
  UserPlus,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { FaroLogo } from "@/components/admin/kit/FaroLogo";
import { Sello } from "@/components/admin/kit/Sello";
import { ThemeToggle } from "@/components/app/ThemeToggle";
import { cn } from "@/lib/utils";

// Estructura del Faro Manager: el mismo sistema del backoffice (barra lateral
// replegable con el botón arriba, grupos e íconos, siempre oscura) con la
// navegación del nivel plataforma.

interface Item {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  ownerOnly?: boolean;
  badge?: "requests" | "reviews" | "verifications";
}

const GROUPS: { title: string; items: Item[] }[] = [
  { title: "General", items: [{ href: "/faro-manager", label: "Resumen", icon: LayoutDashboard, exact: true }] },
  {
    title: "Tenants",
    items: [
      { href: "/faro-manager/tenants", label: "Tenants", icon: Building2 },
      { href: "/faro-manager/nuevo", label: "Alta manual", icon: UserPlus, ownerOnly: true },
      { href: "/faro-manager/pedidos", label: "Pedidos de plan", icon: ClipboardList, badge: "requests" },
    ],
  },
  {
    title: "Catálogo",
    items: [
      { href: "/faro-manager/planes", label: "Planes y precios", icon: Tags },
      { href: "/faro-manager/modulos", label: "Módulos", icon: Blocks },
      { href: "/faro-manager/plantillas", label: "Plantillas de industria", icon: Factory },
    ],
  },
  // Red de estudios (matrículas y reseñas) y Textos legales se suman en sus etapas
  {
    title: "Plataforma",
    items: [
      { href: "/faro-manager/auditoria", label: "Auditoría", icon: ScrollText },
      { href: "/ayuda", label: "Ayuda", icon: CircleHelp },
    ],
  },
];

const KEY = "faro-manager-sidebar";

export function FaroManagerShell({
  user,
  badges,
  signOut,
  children,
}: {
  user: { name: string; email: string; role: "faro_owner" | "faro_support" };
  badges: Partial<Record<NonNullable<Item["badge"]>, number>>;
  signOut: () => void | Promise<void>;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(KEY) === "collapsed");
    } catch {}
  }, []);
  useEffect(() => setDrawer(false), [pathname]);
  const toggle = useCallback(() => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(KEY, c ? "expanded" : "collapsed");
      } catch {}
      return !c;
    });
  }, []);

  const nav = (small: boolean) => (
    <nav aria-label="Faro Manager" className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-2">
      {GROUPS.map((g) => {
        const items = g.items.filter((i) => !i.ownerOnly || user.role === "faro_owner");
        if (!items.length) return null;
        return (
          <div key={g.title} className="mb-4">
            <p className={cn("mb-1 h-5 px-3 text-[12px] text-slate-light", small && "opacity-0")} aria-hidden={small}>
              {g.title}
            </p>
            <ul>
              {items.map((i) => {
                const active = i.exact ? pathname === i.href : pathname.startsWith(i.href);
                const count = i.badge ? (badges[i.badge] ?? 0) : 0;
                return (
                  <li key={i.href}>
                    <Link
                      href={i.href}
                      title={small ? i.label : undefined}
                      aria-current={active ? "page" : undefined}
                      className={cn("flex h-10 items-center gap-3 px-3 text-[14px] transition-colors", active ? "bg-paper/[0.07] text-paper" : "text-paper/70 hover:bg-paper/[0.04] hover:text-paper")}
                    >
                      <i.icon className={cn("size-[18px] shrink-0", active && "text-rose-light")} strokeWidth={1.5} aria-hidden />
                      <span className={cn("flex-1 truncate", small && "sr-only")}>{i.label}</span>
                      {count > 0 && <span className={cn("tabular min-w-5 rounded bg-rose-light px-1.5 text-center text-[12px] font-medium leading-5 text-night", small && "sr-only")}>{count}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );

  const foot = (small: boolean) => (
    <div className="border-t border-paper/10 p-3 text-[13px]">
      <Link href="/admin" className="flex h-9 items-center gap-3 px-3 text-paper/70 hover:text-paper" title="Volver a mi espacio">
        <ArrowLeft className="size-4 shrink-0" aria-hidden />
        <span className={cn(small && "sr-only")}>Volver a mi espacio</span>
      </Link>
      <form action={signOut}>
        <button type="submit" className="flex h-9 w-full items-center gap-3 px-3 text-left text-paper/70 hover:text-paper" title="Cerrar sesión">
          <LogOut className="size-4 shrink-0" aria-hidden />
          <span className={cn("truncate", small && "sr-only")}>
            {user.name} · {user.role === "faro_owner" ? "Owner" : "Soporte"}
          </span>
        </button>
      </form>
    </div>
  );

  return (
    <div className="app-ui min-h-dvh bg-canvas text-ink" style={{ ["--fm" as string]: collapsed ? "72px" : "248px" }}>
      <aside className="keep-dark fixed inset-y-0 left-0 z-40 hidden w-[var(--fm)] flex-col bg-night text-paper transition-[width] duration-200 ease-out lg:flex">
        <div className={cn("flex border-b border-paper/10", collapsed ? "h-28 flex-col items-center justify-center gap-2" : "h-20 items-center justify-between gap-2 pl-5 pr-3")}>
          <Link href="/faro-manager" aria-label="Faro Manager">
            {collapsed ? <Sello className="size-10 text-gold" title="Faro" /> : <FaroLogo sub="Manager" />}
          </Link>
          <button type="button" onClick={toggle} aria-label={collapsed ? "Expandir la barra lateral" : "Contraer la barra lateral"} className="grid size-8 place-items-center text-paper/60 hover:bg-paper/[0.06] hover:text-paper">
            {collapsed ? <ChevronsRight className="size-[18px]" aria-hidden /> : <ChevronsLeft className="size-[18px]" aria-hidden />}
          </button>
        </div>
        {nav(collapsed)}
        {foot(collapsed)}
      </aside>
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" aria-label="Cerrar menú" className="absolute inset-0 bg-night/60" onClick={() => setDrawer(false)} />
          <aside role="dialog" aria-modal="true" aria-label="Menú del Faro Manager" className="keep-dark absolute inset-y-0 left-0 flex w-[280px] max-w-[85vw] flex-col bg-night text-paper">
            <div className="flex h-16 items-center justify-between border-b border-paper/10 px-5">
              <FaroLogo sub="Manager" />
              <button type="button" onClick={() => setDrawer(false)} aria-label="Cerrar menú" className="grid size-9 place-items-center text-paper/80" autoFocus>
                <X className="size-5" aria-hidden />
              </button>
            </div>
            {nav(false)}
            {foot(false)}
          </aside>
        </div>
      )}
      <div className="transition-[padding] duration-200 lg:pl-[var(--fm)]">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-canvas/95 px-4 backdrop-blur sm:px-6 lg:px-8">
          <button type="button" onClick={() => setDrawer(true)} aria-label="Abrir menú" className="grid size-9 place-items-center border border-line lg:hidden">
            <Menu className="size-5" aria-hidden />
          </button>
          <p className="flex-1 truncate text-[13px] text-muted">Faro Manager · nivel plataforma</p>
          <Link href="/ayuda" className="inline-flex h-9 items-center gap-1.5 border border-line bg-surface px-2.5 text-[13px] text-ink hover:border-muted" aria-label="Ayuda">
            <CircleHelp className="size-4" aria-hidden />
            <span className="hidden sm:inline">Ayuda</span>
          </Link>
          <ThemeToggle className="border border-line bg-surface text-ink hover:border-muted" />
        </header>
        <main className="mx-auto w-full max-w-[1440px] px-4 pb-16 pt-6 sm:px-6 sm:pt-8 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
