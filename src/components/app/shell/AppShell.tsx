"use client";

import { AnimatePresence, LayoutGroup, LazyMotion, domMax, m, useReducedMotion } from "motion/react";
import { NoticesBell, type Notice } from "./NoticesBell";
export type { ShellSpace } from "./SpaceSwitcher";
import {
  ArrowLeftRight,
  Briefcase,
  Calculator,
  Handshake,
  LibraryBig,
  ServerCog,
  Settings,
  ListChecks,
  Blocks,
  Bot,
  Building2,
  CalendarClock,
  CalendarDays,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  CircleHelp,
  ClipboardList,
  Compass,
  Factory,
  FileText,
  Globe,
  Inbox,
  KeyRound,
  LayoutDashboard,
  Lock,
  LogOut,
  Menu,
  MessageSquareText,
  MessagesSquare,
  MoreHorizontal,
  Network,
  NotebookPen,
  Plug,
  Plus,
  ReceiptText,
  ScrollText,
  Search,
  ShieldCheck,
  Ship,
  Sparkles,
  Star,
  Tags,
  UserPlus,
  UserRound,
  Users,
  Wallet,
  WandSparkles,
  Waypoints,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { setSidebarPref } from "@/app/actions/prefs";
import { CommandPalette } from "@/components/admin/shell/CommandPalette";
import type { NavAccess } from "@/components/admin/shell/nav";
import { Avatar } from "@/components/admin/kit/Avatar";
import { FaroLogo } from "@/components/admin/kit/FaroLogo";
import { Sello } from "@/components/admin/kit/Sello";
import { HelpMenu } from "@/components/app/HelpMenu";
import { openVigia } from "@/components/vigia/events";
import { VigiaPanel } from "@/components/vigia/VigiaPanel";
import { AccountMenu, type AccountLinks } from "./AccountMenu";
import { RouteReveal } from "@/components/app/RouteReveal";
import { cn } from "@/lib/utils";
import { SpaceSwitcher, type ShellSpace } from "./SpaceSwitcher";
import { activeItem, BADGE_TEXT, type ShellBadge, type ShellGroup, type ShellIcon, type ShellItem, type Space } from "./spaces";

// Estructura única de la app para todos los espacios (estudio, cuenta
// personal, portal de una organización y Faro Manager): barra lateral oscura
// (en escritorio, al colapsarla pasa a una barra horizontal de íconos),
// drawer y barra inferior en el celular, barra superior con ubicación, Guía,
// Ayuda y tema. La preferencia de la barra se guarda por usuario en la base.

const ICONS: Record<ShellIcon, LucideIcon> = {
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
  ayuda: CircleHelp,
  red: Network,
  rubros: Factory,
  copiloto: WandSparkles,
  bitacora: NotebookPen,
  mensajes: MessagesSquare,
  flotas: Ship,
  documentos: FileText,
  equipo: Users,
  rendiciones: ReceiptText,
  resena: Star,
  plan: Tags,
  cuenta: KeyRound,
  tenants: Building2,
  alta: UserPlus,
  pedidos: ClipboardList,
  plantillas: Factory,
  auditoria: ScrollText,
  opiniones: MessageSquareText,
  pasos: ListChecks,
  contador: Calculator,
  comercial: Handshake,
  configuracion: Settings,
  empresa: Briefcase,
  catalogo: LibraryBig,
  plataforma: ServerCog,
  facturacion: ReceiptText,
};

export interface ShellProps {
  space: Space;
  groups: ShellGroup[];
  bottom: ShellItem[];
  badges: Partial<Record<ShellBadge, number>>;
  user: { id: string; name: string; email: string; roleLabel: string };
  spaceName: string;
  spaces: ShellSpace[];
  home: string;
  /** Menú de la cuenta: Mi cuenta, Plan y facturación, Accesos MCP, Mi equipo */
  links: AccountLinks;
  /** Badge del botón Vigía: propuestas para aprobar (estudio) o respuestas nuevas */
  vigiaBadge: ShellBadge;
  /** Portal: la marca del estudio ("Con tecnología de Faro") */
  studioBrand?: string | null;
  collapsedInitial: boolean;
  /** Estudio: buscador (Cmd/Ctrl+K), "Preguntar a Faro" y acción principal */
  studioAccess?: NavAccess | null;
  assisted?: { studioName: string; expiresAt: string } | null;
  endAssisted?: () => void | Promise<void>;
  signOut: () => void | Promise<void>;
  switchOrg?: (fd: FormData) => void | Promise<void>;
  notices?: { items: Notice[]; unread: number };
  children: React.ReactNode;
}

/** Resorte del sidebar (ancho y viaje de los íconos entre la barra lateral y la horizontal) */
const SPRING = { type: "spring", stiffness: 260, damping: 30 } as const;

const isActive = (i: ShellItem, active: ShellItem | null) => !!active && active.href === i.href;

function Count({ n, badge, className }: { n: number; badge: ShellBadge; className?: string }) {
  if (!n) return null;
  return (
    <span className={cn("tabular min-w-5 rounded bg-rose-light px-1.5 text-center text-[12px] font-medium leading-5 text-night", className)}>
      {n}
      <span className="sr-only"> {BADGE_TEXT[badge]}</span>
    </span>
  );
}

function SideNav({ groups, badges, active, onNavigate, shared = false }: { groups: ShellGroup[]; badges: ShellProps["badges"]; active: ShellItem | null; onNavigate?: () => void; shared?: boolean }) {
  let order = 0;
  const main = groups.filter((g) => !g.pinned);
  const pinned = groups.filter((g) => g.pinned);
  return (
    <nav aria-label="Menú" data-tour="nav" className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden px-3 py-2">
      {[...main, ...pinned].map((g, gi) => (
        <div key={g.title || `g${gi}`} className={cn("mb-4", g.pinned && "mb-0 mt-auto border-t border-paper/10 pt-2", g.pinned && pinned[0] !== g && "mt-0 border-t-0 pt-0")}>
          {g.title && !g.pinned && <p className="mb-1 h-5 px-3 text-[12px] text-slate-light">{g.title}</p>}
          <ul>
            {g.items.map((i) => {
              const Icon = ICONS[i.icon];
              const on = isActive(i, active);
              const n = i.badge ? (badges[i.badge] ?? 0) : 0;
              const k = order++;
              return (
                <li key={`${g.title}-${i.href}`}>
                  <Link
                    href={i.href}
                    onClick={onNavigate}
                    aria-current={on ? "page" : undefined}
                    className={cn("relative flex h-10 items-center gap-3 rounded-md px-3 text-[14px] transition-colors", on ? "bg-paper/[0.08] text-paper" : "text-paper/70 hover:bg-paper/[0.04] hover:text-paper")}
                  >
                    {shared ? (
                      <m.span layoutId={`nav-${g.title}-${i.href}`} transition={SPRING} className="grid size-[18px] shrink-0 place-items-center">
                        <Icon className={cn("size-[18px]", on && "text-rose-light")} strokeWidth={1.5} aria-hidden />
                      </m.span>
                    ) : (
                      <Icon className={cn("size-[18px] shrink-0", on && "text-rose-light")} strokeWidth={1.5} aria-hidden />
                    )}
                    {shared ? (
                      <m.span initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.28, delay: 0.08 + Math.min(k, 14) * 0.018, ease: [0.16, 1, 0.3, 1] }} className="flex-1 truncate">
                        {i.label}
                      </m.span>
                    ) : (
                      <span className="flex-1 truncate">{i.label}</span>
                    )}
                    {i.locked && <Lock className="size-3.5 text-paper/45" aria-label="No incluido en tu plan" />}
                    {i.badge && <Count n={n} badge={i.badge} />}
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

/** Barra horizontal de íconos (escritorio, barra lateral colapsada) */
function TopIconBar({ groups, badges, active, onExpand, brand, right }: { groups: ShellGroup[]; badges: ShellProps["badges"]; active: ShellItem | null; onExpand: () => void; brand: React.ReactNode; right: React.ReactNode }) {
  const items = groups.flatMap((g) => g.items.map((i) => ({ ...i, key: `${g.title}-${i.href}` })));
  const wrap = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(items.length);
  const [more, setMore] = useState(false);
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const measure = () => {
      const n = Math.floor((el.clientWidth - 48) / 44);
      setFit(n >= items.length ? items.length : Math.max(1, n));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [items.length]);
  useEffect(() => {
    if (!more) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !(e.target as HTMLElement).closest("[data-more]")) setMore(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [more]);
  const shown = items.slice(0, fit);
  const rest = items.slice(fit);
  const icon = (i: (typeof items)[number], inMenu = false) => {
    const Icon = ICONS[i.icon];
    const on = isActive(i, active);
    const n = i.badge ? (badges[i.badge] ?? 0) : 0;
    return inMenu ? (
      <Link key={i.key} href={i.href} onClick={() => setMore(false)} role="menuitem" aria-current={on ? "page" : undefined} className={cn("flex items-center gap-2.5 px-3 py-2 text-[14px]", on ? "text-paper" : "text-paper/75 hover:bg-paper/[0.06] hover:text-paper")}>
        <Icon className={cn("size-4", on && "text-rose-light")} strokeWidth={1.5} aria-hidden />
        <span className="flex-1">{i.label}</span>
        {i.badge && <Count n={n} badge={i.badge} />}
      </Link>
    ) : (
      <li key={i.key} className="group relative">
        <Link href={i.href} aria-label={i.label} aria-current={on ? "page" : undefined} className={cn("relative grid size-10 place-items-center rounded-md transition-colors", on ? "bg-paper/[0.1] text-rose-light" : "text-paper/65 hover:bg-paper/[0.06] hover:text-paper")}>
          <m.span layoutId={`nav-${i.key}`} transition={SPRING} className="grid size-[18px] place-items-center">
            <Icon className="size-[18px]" strokeWidth={1.5} aria-hidden />
          </m.span>
          {n > 0 && <span aria-hidden className="absolute right-1.5 top-1.5 size-2 rounded-full bg-rose-light" />}
        </Link>
        <span role="tooltip" className="pointer-events-none absolute left-1/2 top-full z-50 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded border border-paper/15 bg-night px-2 py-1 text-[12px] text-paper opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
          {i.label}
          {n > 0 && <span className="ml-1.5 text-rose-light">{n}</span>}
        </span>
      </li>
    );
  };
  return (
    <m.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="keep-dark sticky top-0 z-40 hidden h-[var(--header-h)] items-center gap-2 border-b border-[var(--shell-line)] bg-night px-3 text-paper lg:flex">
      <button type="button" onClick={onExpand} aria-label="Expandir la barra lateral ( [ )" title="Expandir ( [ )" className="grid size-9 shrink-0 place-items-center rounded-md text-paper/70 hover:bg-paper/[0.06] hover:text-paper">
        <ChevronsRight className="size-[18px]" strokeWidth={1.6} aria-hidden />
      </button>
      {brand}
      <div ref={wrap} className="min-w-0 flex-1">
        <nav aria-label="Menú" data-tour="nav">
          <ul className="flex items-center gap-1">
            {shown.map((i) => icon(i))}
            {rest.length > 0 && (
              <li className="relative" data-more>
                <button type="button" aria-haspopup="menu" aria-expanded={more} onClick={() => setMore((m) => !m)} className="flex h-10 items-center gap-1 rounded-md px-2.5 text-[13px] text-paper/70 hover:bg-paper/[0.06] hover:text-paper">
                  <MoreHorizontal className="size-[18px]" aria-hidden /> Más
                </button>
                {more && (
                  <div role="menu" className="absolute right-0 top-full z-50 mt-1.5 max-h-[70vh] w-60 overflow-y-auto rounded-md border border-paper/15 bg-night py-1 shadow-[0_16px_40px_-16px_rgba(0,0,0,0.6)]">
                    {rest.map((i) => icon(i, true))}
                  </div>
                )}
              </li>
            )}
          </ul>
        </nav>
      </div>
      <div className="w-56 shrink-0">{right}</div>
    </m.div>
  );
}

export function AppShell(p: ShellProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(p.collapsedInitial);
  const reduce = useReducedMotion();
  const [drawer, setDrawer] = useState(false);
  const [search, setSearch] = useState(false);
  const active = activeItem(p.groups, pathname);

  const toggle = useCallback(() => {
    setCollapsed((c) => {
      void setSidebarPref(!c);
      return !c;
    });
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName);
      if (p.studioAccess && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearch((s) => !s);
      } else if (e.key === "[" && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        toggle();
      } else if (e.key === "Escape") setDrawer(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle, p.studioAccess]);
  useEffect(() => setDrawer(false), [pathname]);

  const vigiaCount = p.badges[p.vigiaBadge] ?? 0;
  const trail = active ? [{ label: p.groups.find((g) => g.items.some((i) => i.href === active.href))?.title ?? "" }, { label: active.label, href: active.href }] : [{ label: p.spaceName }];

  const brand = (small: boolean) => (
    <Link href={p.home} className="flex min-w-0 items-center gap-3" aria-label={`${p.spaceName} · Inicio`}>
      {p.studioBrand ? (
        <span className="flex min-w-0 items-center gap-2.5">
          <Sello className="size-9 shrink-0 text-rose-light" title={p.studioBrand} />
          {!small && (
            <span className="min-w-0 leading-tight">
              <span className="block truncate font-display text-[17px] text-paper">{p.studioBrand}</span>
              <span className="block text-[11px] text-paper/50">Con tecnología de Faro</span>
            </span>
          )}
        </span>
      ) : small ? (
        <Sello className="size-9 shrink-0 text-gold" title="Faro" />
      ) : (
        <FaroLogo sub={p.space === "faro" ? "Manager" : undefined} />
      )}
    </Link>
  );
  // El contenido acompaña a la barra con la misma curva (sin salto); con reduced motion, directo
  const pad = cn("motion-safe:transition-[padding] motion-safe:duration-500 motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)]", collapsed ? "lg:pl-0" : "lg:pl-[248px]");

  return (
    <div className={cn("admin-shell app-ui min-h-dvh bg-canvas text-ink", collapsed && "lg:[--app-top:calc(var(--header-h)*2)]")}>
      {/* Escritorio expandido: barra lateral (siempre oscura) */}
      <LazyMotion features={domMax}>
      <LayoutGroup id="shell-nav">
      <AnimatePresence initial={false}>
      {!collapsed && (
        <m.aside
          key="sidebar"
          initial={{ width: 64 }}
          animate={{ width: 248 }}
          exit={{ width: 0 }}
          transition={reduce ? { duration: 0 } : SPRING}
          className="keep-dark fixed inset-y-0 left-0 z-40 hidden flex-col overflow-hidden bg-night text-paper lg:flex"
        >
          <div className="flex w-[248px] flex-1 flex-col">
          <div className="flex h-[var(--header-h)] shrink-0 items-center justify-between gap-2 border-b border-[var(--shell-line)] pl-5 pr-3">
            {brand(false)}
            <button type="button" onClick={toggle} aria-label="Contraer la barra lateral ( [ )" title="Contraer ( [ )" className="grid size-8 shrink-0 place-items-center rounded-md text-paper/60 hover:bg-paper/[0.06] hover:text-paper">
              <ChevronsLeft className="size-[18px]" strokeWidth={1.6} aria-hidden />
            </button>
          </div>
          <div className="px-3 pt-3">
            <SpaceSwitcher spaces={p.spaces} switchOrg={p.switchOrg} />
          </div>
          <SideNav groups={p.groups} badges={p.badges} active={active} shared />
          </div>
        </m.aside>
      )}
      {/* Escritorio colapsado: barra horizontal de íconos */}
      {collapsed && (
        <TopIconBar
          key="topbar"
          groups={p.groups}
          badges={p.badges}
          active={active}
          onExpand={toggle}
          brand={
            <span className="mr-2 flex items-center gap-2">
              {brand(true)}
              <SpaceSwitcher spaces={p.spaces} switchOrg={p.switchOrg} compact className="w-auto xl:w-56" />
            </span>
          }
          right={null}
        />
      )}
      </AnimatePresence>
      </LayoutGroup>
      </LazyMotion>

      {/* Celular: drawer */}
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" aria-label="Cerrar menú" className="absolute inset-0 bg-night/60" onClick={() => setDrawer(false)} />
          <aside role="dialog" aria-modal="true" aria-label="Menú" className="keep-dark absolute inset-y-0 left-0 flex w-[290px] max-w-[85vw] flex-col bg-night text-paper">
            <div className="flex h-16 items-center justify-between border-b border-paper/10 px-5">
              {brand(false)}
              <button type="button" onClick={() => setDrawer(false)} aria-label="Cerrar menú" className="grid size-9 place-items-center text-paper/80" autoFocus>
                <X className="size-5" aria-hidden />
              </button>
            </div>
            <div className="px-3 pt-3">
              <SpaceSwitcher spaces={p.spaces} switchOrg={p.switchOrg} />
            </div>
            <SideNav groups={p.groups} badges={p.badges} active={active} onNavigate={() => setDrawer(false)} />
          </aside>
        </div>
      )}

      <div className={pad}>
        <header className={cn("sticky z-30 flex h-[var(--header-h)] items-center gap-2 border-b border-[var(--shell-line)] bg-canvas/95 px-4 backdrop-blur sm:px-6 lg:px-8", collapsed ? "top-0 lg:top-[var(--header-h)]" : "top-0")}>
          <button type="button" onClick={() => setDrawer(true)} aria-label="Abrir menú" className="grid size-9 place-items-center rounded-md border border-line lg:hidden">
            <Menu className="size-5" aria-hidden />
          </button>
          <nav aria-label="Ubicación" className="min-w-0 flex-1">
            <ol className="flex min-w-0 items-center gap-1.5 text-[13px] text-muted">
              {trail.map((c, i) => (
                <li key={i} className={cn("flex min-w-0 items-center gap-1.5", i < trail.length - 1 && "hidden sm:flex")}>
                  {i > 0 && <ChevronRight className="hidden size-3.5 shrink-0 sm:block" aria-hidden />}
                  {"href" in c && c.href && i < trail.length - 1 ? (
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
          {p.studioAccess && (
            <button type="button" onClick={() => setSearch(true)} className="hidden h-9 items-center gap-2 rounded-md border border-line bg-surface px-2.5 text-[13px] text-muted hover:border-muted md:flex md:w-48 xl:w-56" aria-label="Buscar (Ctrl o Cmd + K)">
              <Search className="size-4" aria-hidden />
              <span className="flex-1 text-left">Buscar…</span>
              <kbd className="rounded border border-line px-1 text-[11px]">⌘K</kbd>
            </button>
          )}
          <a
            href="/vigia"
            onClick={(e) => {
              if (openVigia()) e.preventDefault();
            }}
            data-tour="vigia"
            aria-label={`Vigía${vigiaCount ? ` · ${vigiaCount} ${BADGE_TEXT[p.vigiaBadge]}` : ""}`}
            className="relative inline-flex h-9 items-center gap-1.5 rounded-md bg-navy px-2.5 text-[13px] font-medium text-paper shadow-sm hover:bg-navy-deep sm:px-3"
          >
            <WandSparkles className="size-4 text-gold" strokeWidth={1.6} aria-hidden />
            <span className="hidden sm:inline">Vigía</span>
            {vigiaCount > 0 && <span aria-hidden className="num absolute -right-1.5 -top-1.5 min-w-[18px] rounded-full bg-rose-light px-1 text-center text-[11px] leading-[18px] text-night ring-2 ring-canvas">{vigiaCount}</span>}
          </a>
          <Link href="/mensajes" aria-label={`Mensajes${p.badges.unread ? ` · ${p.badges.unread} sin leer` : ""}`} title="Mensajes" className={cn("relative grid size-9 place-items-center rounded-md text-ink hover:bg-surface", pathname.startsWith("/mensajes") && "bg-surface")}>
            <MessagesSquare className="size-[18px]" strokeWidth={1.6} aria-hidden />
            {(p.badges.unread ?? 0) > 0 && <span aria-hidden className="num absolute -right-0.5 -top-0.5 min-w-[17px] rounded-full bg-rose-light px-1 text-center text-[10px] leading-[17px] text-night ring-2 ring-canvas">{p.badges.unread}</span>}
          </Link>
          {p.notices && <NoticesBell items={p.notices.items} unread={p.notices.unread} className="rounded-md text-ink hover:bg-surface" />}
          <HelpMenu className="rounded-md text-ink hover:bg-surface" />
          <AccountMenu user={p.user} spaceName={p.spaceName} links={p.links} spaces={p.spaces} switchOrg={p.switchOrg} signOut={p.signOut} />
        </header>
        {p.assisted && (
          <div role="status" className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-[#e3cf9f] bg-[#fbf5e6] px-4 py-2 text-[13px] text-[#7a5410] sm:px-6 lg:px-8">
            <span>
              <strong className="font-medium">Acceso asistido de Faro</strong> a {p.assisted.studioName} hasta{" "}
              {new Date(p.assisted.expiresAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}. Todo queda en la auditoría.
            </span>
            {p.endAssisted && (
              <form action={p.endAssisted}>
                <button type="submit" className="font-medium underline underline-offset-4">
                  Terminar el acceso
                </button>
              </form>
            )}
          </div>
        )}
        <main id="contenido" className="mx-auto w-full max-w-[1440px] px-4 pb-28 pt-6 [--app-bottom:calc(60px+env(safe-area-inset-bottom))] sm:px-6 sm:pt-8 lg:px-8 lg:pb-10 lg:[--app-bottom:0px]">
          <RouteReveal>{p.children}</RouteReveal>
        </main>
      </div>

      {/* Celular: barra inferior */}
      <nav aria-label="Secciones principales" className="keep-dark fixed inset-x-0 bottom-0 z-40 border-t border-paper/10 bg-night pb-[env(safe-area-inset-bottom)] text-paper lg:hidden">
        <ul className="grid grid-cols-5">
          {p.bottom.map((i) => {
            const Icon = ICONS[i.icon];
            const on = isActive(i, active);
            const n = i.badge ? (p.badges[i.badge] ?? 0) : 0;
            return (
              <li key={i.href}>
                <Link href={i.href} aria-current={on ? "page" : undefined} className={cn("flex flex-col items-center gap-1 pb-2 pt-2.5 text-[11px]", on ? "text-paper" : "text-paper/60")}>
                  <span className="relative">
                    <Icon className={cn("size-[22px]", on && "text-rose-light")} strokeWidth={1.5} aria-hidden />
                    {n > 0 && (
                      <span className="tabular absolute -right-2.5 -top-1.5 min-w-4 rounded bg-rose-light px-1 text-center text-[10px] font-semibold leading-4 text-night">
                        {n}
                        <span className="sr-only"> {i.badge && BADGE_TEXT[i.badge]}</span>
                      </span>
                    )}
                  </span>
                  <span className="max-w-full truncate px-1">{i.label}</span>
                </Link>
              </li>
            );
          })}
          <li>
            <button type="button" onClick={() => setDrawer(true)} aria-expanded={drawer} className="flex w-full flex-col items-center gap-1 pb-2 pt-2.5 text-[11px] text-paper/60">
              <MoreHorizontal className="size-[22px]" strokeWidth={1.5} aria-hidden />
              Más
            </button>
          </li>
        </ul>
      </nav>
      <Suspense>
        <VigiaPanel space={p.space} label={p.spaceName} />
      </Suspense>
      {p.studioAccess && <CommandPalette open={search} onClose={() => setSearch(false)} access={p.studioAccess} />}
    </div>
  );
}

