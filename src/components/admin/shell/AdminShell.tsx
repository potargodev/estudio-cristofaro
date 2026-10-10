"use client";

import {
  Building2,
  CalendarClock,
  CalendarDays,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Globe,
  Inbox,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  MoreHorizontal,
  Plug,
  Plus,
  Bot,
  Blocks,
  Lock,
  ShieldCheck,
  Sparkles,
  Waypoints,
  Compass,
  Wallet,
  Search,
  UserRound,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { RouteReveal } from "@/components/app/RouteReveal";
import { GuideButton, HelpLink } from "@/components/app/Guide";
import { ThemeToggle } from "@/components/app/ThemeToggle";
import { cn } from "@/lib/utils";
import { Avatar } from "../kit/Avatar";
import { FaroLogo } from "../kit/FaroLogo";
import { Sello } from "../kit/Sello";
import { CommandPalette } from "./CommandPalette";
import { askFaroHref, BADGE_LABEL, crumbs, itemEnabled, primaryAction, sidebarStorageKey as storageKey, visibleGroups, type BadgeKey, type NavAccess, type NavIcon } from "./nav";

const ICONS: Record<NavIcon, LucideIcon> = {
  resumen: LayoutDashboard,
  organizaciones: Building2,
  vencimientos: CalendarClock,
  solicitudes: Inbox,
  consultas: UserRound,
  agenda: CalendarDays,
  contenidos: Globe,
  usuarios: Users,
  integraciones: Plug,
  asistente: Bot,
  aprobaciones: ShieldCheck,
  mcp: Waypoints,
  ia: Sparkles,
  faro: Compass,
  gastos: Wallet,
  modulos: Blocks,
};

/** Barra inferior del celular, como en una app: las cuatro secciones de todos los días y "Más" (abre el menú completo) */
const BOTTOM: { href: string; label: string; icon: NavIcon; badge?: BadgeKey; exact?: boolean }[] = [
  { href: "/admin", label: "Resumen", icon: "resumen", exact: true },
  { href: "/admin/organizaciones", label: "Clientes", icon: "organizaciones" },
  { href: "/admin/vencimientos", label: "Vencim.", icon: "vencimientos", badge: "obligations" },
  { href: "/admin/solicitudes", label: "Solicitudes", icon: "solicitudes", badge: "requests" },
];

/** Cuenta personal: su panel, el Asistente, grupos de gastos y "Más" */
const BOTTOM_PERSONAL: typeof BOTTOM = [
  { href: "/personal", label: "Inicio", icon: "resumen", exact: true },
  { href: "/admin/asistente", label: "Asistente", icon: "asistente" },
  { href: "/grupos", label: "Gastos", icon: "gastos" },
  { href: "/admin/mcp", label: "MCP", icon: "mcp" },
];

function BottomBar({ badges, onMore, moreOpen, personal }: { badges: Record<BadgeKey, number>; onMore: () => void; moreOpen: boolean; personal?: boolean }) {
  const pathname = usePathname();
  const BOTTOM_ITEMS = personal ? BOTTOM_PERSONAL : BOTTOM;
  const inBar = BOTTOM_ITEMS.some((i) => (i.exact ? pathname === i.href : pathname.startsWith(i.href)));
  return (
    <nav aria-label="Secciones principales" className="keep-dark fixed inset-x-0 bottom-0 z-40 border-t border-paper/10 bg-night pb-[env(safe-area-inset-bottom)] text-paper lg:hidden">
      <ul className="grid grid-cols-5">
        {BOTTOM_ITEMS.map((i) => {
          const Icon = ICONS[i.icon];
          const active = i.exact ? pathname === i.href : pathname.startsWith(i.href);
          const count = i.badge ? badges[i.badge] : 0;
          return (
            <li key={i.href}>
              <Link href={i.href} aria-current={active ? "page" : undefined} className={cn("flex flex-col items-center gap-1 pb-2 pt-2.5 text-[11px]", active ? "text-paper" : "text-paper/60")}>
                <span className="relative">
                  <Icon className={cn("size-[22px]", active && "text-rose-light")} strokeWidth={1.5} aria-hidden />
                  {count > 0 && (
                    <span className="tabular absolute -right-2.5 -top-1.5 min-w-4 bg-rose-light px-1 text-center text-[10px] font-semibold leading-4 text-night">
                      {count}
                      <span className="sr-only"> {BADGE_LABEL[i.badge!]}</span>
                    </span>
                  )}
                </span>
                {i.label}
              </Link>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            onClick={onMore}
            aria-expanded={moreOpen}
            className={cn("flex w-full flex-col items-center gap-1 pb-2 pt-2.5 text-[11px]", !inBar ? "text-paper" : "text-paper/60")}
          >
            <MoreHorizontal className={cn("size-[22px]", !inBar && "text-rose-light")} strokeWidth={1.5} aria-hidden />
            Más
          </button>
        </li>
      </ul>
    </nav>
  );
}

const ROLE_LABEL: Record<string, string> = { dueno: "Dueño", titular: "Titular", contador: "Contador", colaborador: "Colaborador" };

export interface ShellUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

function Nav({
  collapsed,
  access,
  badges,
  onNavigate,
}: {
  collapsed: boolean;
  access: NavAccess;
  badges: Record<BadgeKey, number>;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  // Tooltip del modo colapsado: fixed (el nav recorta lo que sobresale)
  const [tip, setTip] = useState<{ label: string; count: number; top: number } | null>(null);
  const showTip = (e: React.SyntheticEvent<HTMLElement>, label: string, count: number) => {
    if (!collapsed) return;
    const r = e.currentTarget.getBoundingClientRect();
    setTip({ label, count, top: r.top + r.height / 2 });
  };
  return (
    <nav aria-label="Backoffice" data-tour="nav" className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-2" onMouseLeave={() => setTip(null)}>
      {collapsed && tip && (
        <span role="tooltip" className="pointer-events-none fixed left-[84px] z-50 -translate-y-1/2 whitespace-nowrap border border-paper/15 bg-night px-2.5 py-1.5 text-[13px] text-paper" style={{ top: tip.top }}>
          {tip.label}
          {tip.count > 0 && <span className="tabular ml-2 text-rose-light">{tip.count}</span>}
        </span>
      )}
      {visibleGroups(access).map((g) => (
        <div key={g.title} className="mb-4">
          <p className={cn("mb-1 h-5 px-3 text-[12px] text-slate-light transition-opacity duration-200", collapsed && "opacity-0")} aria-hidden={collapsed}>
            {g.title}
          </p>
          <ul>
            {g.items
              .map((i) => {
                const enabled = itemEnabled(i, access);
                const href = enabled ? i.href : `/admin/modulos/${i.module}`;
                const active = i.exact ? pathname === i.href : pathname.startsWith(i.href);
                const Icon = ICONS[i.icon];
                const count = enabled && i.badge ? badges[i.badge] : 0;
                return (
                  <li key={i.href} className="relative">
                    <Link
                      href={href}
                      onClick={onNavigate}
                      onMouseEnter={(e) => showTip(e, i.label, count)}
                      onFocus={(e) => showTip(e, i.label, count)}
                      onBlur={() => setTip(null)}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "relative flex h-10 items-center gap-3 px-3 text-[14px] transition-colors",
                        active ? "bg-paper/[0.07] text-paper" : "text-paper/70 hover:bg-paper/[0.04] hover:text-paper",
                      )}
                    >
                      <span className="relative shrink-0">
                        <Icon className={cn("size-[18px]", active ? "text-rose-light" : "")} strokeWidth={1.5} aria-hidden />
                        {collapsed && count > 0 && <span aria-hidden className="absolute -right-1 -top-1 size-2 bg-rose-light" />}
                      </span>
                      <span className={cn("flex-1 truncate transition-opacity duration-200", collapsed && "sr-only")}>{i.label}</span>
                      {!enabled && <Lock className={cn("size-3.5 text-paper/45", collapsed && "sr-only")} aria-label="No incluido en tu plan" />}
                      {count > 0 && (
                        <span className={cn("tabular min-w-5 bg-rose-light px-1.5 text-center text-[12px] font-medium leading-5 text-night", collapsed && "sr-only")}>
                          {count}
                          <span className="sr-only"> {BADGE_LABEL[i.badge!]}</span>
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function UserMenu({ user, studioName, collapsed, signOut }: { user: ShellUser; studioName: string; collapsed: boolean; signOut: () => void | Promise<void> }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative border-t border-paper/10 p-3">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 p-1.5 text-left hover:bg-paper/[0.05]"
      >
        <Avatar name={user.name || user.email} size="sm" tone="dark" className="size-8" />
        <span className={cn("min-w-0 flex-1 transition-opacity duration-200", collapsed && "sr-only")}>
          <span className="block truncate text-[14px] text-paper">{user.name || user.email}</span>
          <span className="block truncate text-[12px] text-slate-light">
            {ROLE_LABEL[user.role] ?? user.role} · {studioName}
          </span>
        </span>
      </button>
      {open && (
        <div role="menu" className="absolute bottom-full left-3 z-50 mb-2 w-56 border border-paper/15 bg-night py-1 text-[14px] shadow-[0_16px_40px_-16px_rgba(0,0,0,0.6)]">
          <Link role="menuitem" href="/admin/cuenta" onClick={() => setOpen(false)} className="flex items-center gap-2.5 px-3 py-2.5 text-paper/85 hover:bg-paper/[0.06] hover:text-paper">
            <KeyRound className="size-4" strokeWidth={1.5} aria-hidden /> Mi cuenta y 2FA
          </Link>
          <form action={signOut}>
            <button role="menuitem" type="submit" className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-paper/85 hover:bg-paper/[0.06] hover:text-paper">
              <LogOut className="size-4" strokeWidth={1.5} aria-hidden /> Cerrar sesión
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

/**
 * Estructura del backoffice: barra lateral replegable (248 / 72 px, atajo "[",
 * estado guardado por usuario), drawer en el celular, barra superior con
 * breadcrumb, buscador (Cmd/Ctrl+K) y acción principal de la sección.
 */
export function AdminShell({
  user,
  access,
  badges,
  signOut,
  children,
  studioName,
  assisted,
  endAssisted,
}: {
  user: ShellUser;
  access: NavAccess;
  studioName: string;
  /** Acceso asistido del equipo de Faro en curso */
  assisted?: { studioName: string; expiresAt: string } | null;
  endAssisted?: () => void | Promise<void>;
  badges: Record<BadgeKey, number>;
  signOut: () => void | Promise<void>;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [search, setSearch] = useState(false);

  useEffect(() => setCollapsed(document.documentElement.dataset.sidebar === "collapsed"), []);
  const toggle = useCallback(() => {
    setCollapsed((c) => {
      const next = !c;
      if (next) document.documentElement.dataset.sidebar = "collapsed";
      else delete document.documentElement.dataset.sidebar;
      try {
        localStorage.setItem(storageKey(user.id), next ? "collapsed" : "expanded");
      } catch {}
      return next;
    });
  }, [user.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearch((s) => !s);
      } else if (e.key === "[" && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        toggle();
      } else if (e.key === "Escape") setDrawer(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);
  useEffect(() => setDrawer(false), [pathname]);

  const action = access.isPersonal ? null : primaryAction(pathname, access.isOperator);
  const searchParams = useSearchParams();
  const askHref = askFaroHref(pathname, searchParams);
  const trail = crumbs(pathname);

  const brand = (small: boolean) => (
    <Link href={access.isPersonal ? "/personal" : "/admin"} className="flex min-w-0 items-center gap-3" aria-label={`Faro · ${studioName} · Inicio`}>
      {small ? <Sello className="size-10 shrink-0 text-gold" title="Faro" /> : <FaroLogo />}
    </Link>
  );
  const collapseButton = (
    <button
      type="button"
      onClick={toggle}
      aria-label={collapsed ? "Expandir la barra lateral ( [ )" : "Contraer la barra lateral ( [ )"}
      aria-pressed={collapsed}
      title={collapsed ? "Expandir ( [ )" : "Contraer ( [ )"}
      className="grid size-8 shrink-0 place-items-center text-paper/60 hover:bg-paper/[0.06] hover:text-paper"
    >
      {collapsed ? <ChevronsRight className="size-[18px]" strokeWidth={1.6} aria-hidden /> : <ChevronsLeft className="size-[18px]" strokeWidth={1.6} aria-hidden />}
    </button>
  );

  return (
    <div className="admin-shell app-ui min-h-dvh bg-canvas text-ink">
      {/* Sidebar de escritorio (siempre oscura, también en modo claro) */}
      <aside className="keep-dark fixed inset-y-0 left-0 z-40 hidden w-[var(--sb)] flex-col bg-night text-paper transition-[width] duration-200 ease-out lg:flex">
        <div className={cn("flex border-b border-paper/10", collapsed ? "h-28 flex-col items-center justify-center gap-2 px-0" : "h-20 items-center justify-between gap-2 pl-5 pr-3")}>
          {brand(collapsed)}
          {collapseButton}
        </div>
        <Nav collapsed={collapsed} access={access} badges={badges} />
        <UserMenu user={user} studioName={studioName} collapsed={collapsed} signOut={signOut} />
      </aside>

      {/* Drawer del celular */}
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" aria-label="Cerrar menú" className="absolute inset-0 bg-night/60" onClick={() => setDrawer(false)} />
          <aside role="dialog" aria-modal="true" aria-label="Menú del backoffice" className="keep-dark absolute inset-y-0 left-0 flex w-[280px] max-w-[85vw] flex-col bg-night text-paper">
            <div className="flex h-16 items-center justify-between border-b border-paper/10 px-5">
              {brand(false)}
              <button type="button" onClick={() => setDrawer(false)} aria-label="Cerrar menú" className="grid size-9 place-items-center text-paper/80" autoFocus>
                <X className="size-5" aria-hidden />
              </button>
            </div>
            <Nav collapsed={false} access={access} badges={badges} onNavigate={() => setDrawer(false)} />
            <UserMenu user={user} studioName={studioName} collapsed={false} signOut={signOut} />
          </aside>
        </div>
      )}

      <div className="transition-[padding] duration-200 ease-out lg:pl-[var(--sb)]">
        {/* Barra superior */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-canvas/95 px-4 backdrop-blur sm:px-6 lg:px-8">
          <button type="button" onClick={() => setDrawer(true)} aria-label="Abrir menú" className="grid size-9 place-items-center border border-line lg:hidden">
            <Menu className="size-5" aria-hidden />
          </button>
          <nav aria-label="Ubicación" className="min-w-0 flex-1">
            <ol className="flex min-w-0 items-center gap-1.5 text-[13px] text-muted">
              {trail.map((c, i) => (
                <li key={i} className={cn("flex min-w-0 items-center gap-1.5", i < trail.length - 2 && "hidden sm:flex")}>
                  {i > 0 && <ChevronRight className="size-3.5 shrink-0" aria-hidden />}
                  {c.href && i < trail.length - 1 ? (
                    <Link href={c.href} className="truncate hover:text-ink">
                      {c.label}
                    </Link>
                  ) : (
                    <span className={cn("truncate", i === trail.length - 1 && "text-ink")} aria-current={i === trail.length - 1 ? "page" : undefined}>
                      {c.label}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
          {!pathname.startsWith("/admin/asistente") && (
            <Link
              href={askHref}
              className="inline-flex h-9 items-center gap-1.5 border border-line bg-surface px-2.5 text-[13px] font-medium text-ink hover:border-muted sm:px-3"
              title="Preguntar a Faro sobre esta pantalla"
            >
              <Sparkles className="size-4 text-rose-deep" strokeWidth={1.5} aria-hidden />
              <span className="hidden md:inline">Preguntar a Faro</span>
              <span className="sr-only md:hidden">Preguntar a Faro</span>
            </Link>
          )}
          <button
            type="button"
            onClick={() => setSearch(true)}
            className="flex h-9 items-center gap-2 border border-line bg-surface px-3 text-[13px] text-muted hover:border-muted sm:w-64"
            aria-label="Buscar (Ctrl o Cmd + K)"
          >
            <Search className="size-4" aria-hidden />
            <span className="hidden flex-1 text-left sm:inline">Buscar…</span>
            <kbd className="hidden border border-line px-1 text-[11px] sm:inline">⌘K</kbd>
          </button>
          <GuideButton className="border border-line bg-surface text-ink hover:border-muted" />
          <HelpLink compact className="border border-line bg-surface text-ink hover:border-muted" />
          <ThemeToggle className="border border-line bg-surface text-ink hover:border-muted" />
          {action && (
            <Link href={action.href} data-tour="accion" className="inline-flex h-9 items-center gap-1.5 rounded-md bg-navy px-3 text-[13px] font-medium text-paper hover:bg-navy-deep sm:px-4">
              <Plus className="size-4" aria-hidden />
              <span className="hidden sm:inline">{action.label}</span>
              <span className="sr-only sm:hidden">{action.label}</span>
            </Link>
          )}
        </header>
        {assisted && (
          <div role="status" className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-[#e3cf9f] bg-[#fbf5e6] px-4 py-2 text-[13px] text-[#7a5410] sm:px-6 lg:px-8">
            <span>
              <strong className="font-medium">Acceso asistido de Faro</strong> a {assisted.studioName} hasta{" "}
              {new Date(assisted.expiresAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}. Todo lo que hagas queda en la auditoría del estudio.
            </span>
            {endAssisted && (
              <form action={endAssisted}>
                <button type="submit" className="font-medium underline underline-offset-4">
                  Terminar el acceso
                </button>
              </form>
            )}
          </div>
        )}
        <main id="contenido" className="mx-auto w-full max-w-[1440px] px-4 pb-28 pt-6 sm:px-6 sm:pt-8 lg:px-8 lg:pb-8">
          <RouteReveal>{children}</RouteReveal>
        </main>
      </div>
      <BottomBar badges={badges} onMore={() => setDrawer(true)} moreOpen={drawer} personal={access.isPersonal} />
      <CommandPalette open={search} onClose={() => setSearch(false)} access={access} />
    </div>
  );
}
