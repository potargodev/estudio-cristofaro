"use client";

import { AnimatePresence, LayoutGroup, LazyMotion, domMax, m, useReducedMotion } from "motion/react";
import { NoticesBell, type Notice } from "./NoticesBell";
import { ArrowUpDown, Blocks, Bot, Boxes, Briefcase, Building2, Calculator, CalendarClock, CalendarDays, ChevronRight, ChevronsLeft, ChevronsRight, CircleHelp, ClipboardList, Compass, Factory, FileText, Globe, HandCoins, Handshake, Inbox, KeyRound, LayoutDashboard, LibraryBig, ListChecks, ListTodo, Lock, MessageSquareText, MessagesSquare, MoreHorizontal, Network, NotebookPen, Plug, ReceiptText, ScrollText, Search, ServerCog, Settings, ShieldCheck, Ship, Sparkles, Star, Tags, UserPlus, UserRound, Users, Wallet, WandSparkles, Waypoints, X, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Popover } from "@/components/ds/Popover";
import { setSidebarPref } from "@/app/actions/prefs";
import { CommandPalette } from "@/components/admin/shell/CommandPalette";
import type { NavAccess } from "@/components/admin/shell/nav";
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
import { formatDate } from "@/lib/format";

// Estructura única de la app para todos los espacios (estudio, cuenta
// personal, portal de una organización y Faro Manager): barra lateral oscura
// (en escritorio, al colapsarla pasa a una barra horizontal de íconos),
// drawer y barra inferior en el celular, barra superior con ubicación,
// buscador, Vigía, mensajes, avisos, ayuda y cuenta (con la barra colapsada,
// todo en una sola fila). La preferencia de la barra se guarda por usuario.

const ICONS: Record<ShellIcon, LucideIcon> = {
  cajas: Boxes,
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
  honorarios: HandCoins,
  tareas: ListTodo,
  recategorizacion: ArrowUpDown,
  buzon: Inbox,
  configuracion: Settings,
  empresa: Briefcase,
  catalogo: LibraryBig,
  plataforma: ServerCog,
  facturacion: ReceiptText,
};

interface ShellProps {
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
  /** Marca blanca (F9): logo y colores del estudio en el portal */
  studioLogo?: string | null;
  brandVars?: Record<string, string> | null;
  collapsedInitial: boolean;
  /** Estudio: el buscador (lupa o Cmd/Ctrl+K) suma organizaciones, CUIT, consultas y solicitudes */
  studioAccess?: NavAccess | null;
  assisted?: { studioName: string; expiresAt: string } | null;
  /** «Ver como…» vigente (owner de Faro sobre un usuario de la demo) */
  viewAs?: { name: string; role: string; studio: string } | null;
  endViewAs?: () => void | Promise<void>;
  endAssisted?: () => void | Promise<void>;
  /** Espacio de demostración: franja fija para no confundirlo con datos reales */
  demo?: boolean;
  /** Parte C · Servicios simulados o en su ambiente de prueba: «Modo demostración» o «Modo prueba» en todas las pantallas */
  serviceMark?: "simulador" | "prueba" | null;
  signOut: () => void | Promise<void>;
  switchOrg?: (fd: FormData) => void | Promise<void>;
  notices?: { items: Notice[]; unread: number };
  children: React.ReactNode;
}

/** Resorte del sidebar (viaje de los íconos entre la barra lateral y la horizontal) */
const SPRING = { type: "spring", stiffness: 260, damping: 30 } as const;
/** Escalonado: cada ítem sale (o vuelve) 35 ms después del de arriba */
const STEP = 0.035;
const NO_MOTION = { duration: 0 } as const;

const isActive = (i: ShellItem, active: ShellItem | null) => !!active && active.href === i.href;

function Count({ n, badge, className }: { n: number; badge: ShellBadge; className?: string }) {
  if (!n) return null;
  return (
    <span className={cn("tabular min-w-5 rounded bg-rose-light px-1.5 text-center text-caption font-medium leading-5 text-night", className)}>
      {n}
      <span className="sr-only"> {BADGE_TEXT[badge]}</span>
    </span>
  );
}

function SideNav({ groups, badges, active, onNavigate, shared = false, reduce = false }: { groups: ShellGroup[]; badges: ShellProps["badges"]; active: ShellItem | null; onNavigate?: () => void; shared?: boolean; reduce?: boolean }) {
  let order = 0;
  const main = groups.filter((g) => !g.pinned);
  const pinned = groups.filter((g) => g.pinned);
  return (
    <nav aria-label="Menú" data-tour="nav" className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden px-3 py-2">
      {[...main, ...pinned].map((g, gi) => (
        <div key={g.title || `g${gi}`} className={cn("mb-4", g.pinned && "mb-0 mt-auto border-t border-paper/10 pt-2", g.pinned && pinned[0] !== g && "mt-0 border-t-0 pt-0")}>
          {g.title && !g.pinned && <p className="mb-1 h-5 px-3 text-caption text-slate-light">{g.title}</p>}
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
                    className={cn("relative flex h-10 items-center gap-3 rounded-md px-3 text-ui transition-colors", on ? "bg-paper/[0.08] text-paper" : "text-paper/70 hover:bg-paper/[0.04] hover:text-paper")}
                  >
                    {shared ? (
                      // El ícono vuelve de la barra superior a su lugar, de a uno (de arriba hacia abajo)
                      <m.span layoutId={`nav-${g.title}-${i.href}`} layoutDependency={k} transition={reduce ? NO_MOTION : { ...SPRING, delay: k * STEP }} className="grid size-[18px] shrink-0 place-items-center">
                        <Icon className={cn("size-[18px]", on && "text-rose-light")} strokeWidth={1.5} aria-hidden />
                      </m.span>
                    ) : (
                      <Icon className={cn("size-[18px] shrink-0", on && "text-rose-light")} strokeWidth={1.5} aria-hidden />
                    )}
                    {shared ? (
                      // La etiqueta aparece detrás de su ícono y, al colapsar, se va de a una
                      <m.span
                        initial={reduce ? false : { opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0, transition: reduce ? NO_MOTION : { duration: 0.24, delay: 0.12 + k * STEP, ease: [0.16, 1, 0.3, 1] } }}
                        exit={{ opacity: 0, x: -8, transition: reduce ? NO_MOTION : { duration: 0.16, delay: k * STEP, ease: [0.4, 0, 1, 1] } }}
                        className="flex-1 truncate"
                      >
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
function TopIconBar({ groups, badges, active, onExpand, brand, right, reduce = false }: { groups: ShellGroup[]; badges: ShellProps["badges"]; active: ShellItem | null; onExpand: () => void; brand: React.ReactNode; right: React.ReactNode; reduce?: boolean }) {
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
  const moreBtn = useRef<HTMLButtonElement>(null);
  const closeMore = useCallback(() => setMore(false), []);
  const shown = items.slice(0, fit);
  const rest = items.slice(fit);
  const icon = (i: (typeof items)[number], inMenu = false, k = 0) => {
    const Icon = ICONS[i.icon];
    const on = isActive(i, active);
    const n = i.badge ? (badges[i.badge] ?? 0) : 0;
    return inMenu ? (
      <Link key={i.key} href={i.href} onClick={() => setMore(false)} role="menuitem" aria-current={on ? "page" : undefined} className={cn("flex items-center gap-2.5 px-3 py-2 text-ui", on ? "text-paper" : "text-paper/75 hover:bg-paper/[0.06] hover:text-paper")}>
        <Icon className={cn("size-4", on && "text-rose-light")} strokeWidth={1.5} aria-hidden />
        <span className="flex-1">{i.label}</span>
        {i.badge && <Count n={n} badge={i.badge} />}
      </Link>
    ) : (
      <li key={i.key} className="group relative">
        <Link href={i.href} aria-label={i.label} aria-current={on ? "page" : undefined} className={cn("relative grid size-10 place-items-center rounded-md transition-colors", on ? "bg-paper/[0.1] text-rose-light" : "text-paper/65 hover:bg-paper/[0.06] hover:text-paper")}>
          {/* Cada ícono viaja del sidebar a su lugar en la barra, de a uno */}
          <m.span layoutId={`nav-${i.key}`} transition={reduce ? NO_MOTION : { ...SPRING, delay: k * STEP }} className="grid size-[18px] place-items-center">
            <Icon className="size-[18px]" strokeWidth={1.5} aria-hidden />
          </m.span>
          {n > 0 && <span aria-hidden className="absolute right-1.5 top-1.5 size-2 rounded-full bg-rose-light" />}
        </Link>
        <span role="tooltip" className="pointer-events-none absolute left-1/2 top-full z-50 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border border-paper/15 bg-night px-2 py-1 text-caption text-paper opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
          {i.label}
          {n > 0 && <span className="ml-1.5 text-rose-light">{n}</span>}
        </span>
      </li>
    );
  };
  return (
    <m.div initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1, transition: reduce ? NO_MOTION : { duration: 0.2 } }} exit={{ opacity: 0, transition: reduce ? NO_MOTION : { duration: 0.2, delay: items.length * STEP } }} className="keep-dark sticky top-0 z-40 hidden h-[var(--header-h)] items-center gap-2 border-b border-[var(--shell-line)] bg-night px-3 text-paper lg:flex">
      <button type="button" onClick={onExpand} aria-label="Expandir la barra lateral ( [ )" title="Expandir ( [ )" className="grid size-9 shrink-0 place-items-center rounded-md text-paper/70 hover:bg-paper/[0.06] hover:text-paper">
        <ChevronsRight className="size-[18px]" strokeWidth={1.6} aria-hidden />
      </button>
      {brand}
      <div ref={wrap} className="min-w-0 flex-1">
        <nav aria-label="Menú" data-tour="nav">
          <ul className="flex items-center gap-1">
            {shown.map((i, k) => icon(i, false, k))}
            {rest.length > 0 && (
              <li className="relative" data-more>
                <button ref={moreBtn} type="button" aria-haspopup="menu" aria-expanded={more} onClick={() => setMore((m) => !m)} className="flex h-10 items-center gap-1 rounded-md px-2.5 text-meta text-paper/70 hover:bg-paper/[0.06] hover:text-paper">
                  <MoreHorizontal className="size-[18px]" aria-hidden /> Más
                </button>
                <Popover open={more} onClose={closeMore} anchor={moreBtn} label="Más secciones" className="keep-dark w-60 border border-paper/15 bg-night py-1 text-paper">
                  {rest.map((i) => icon(i, true))}
                </Popover>
              </li>
            )}
          </ul>
        </nav>
      </div>
      <div className="flex shrink-0 items-center gap-1">{right}</div>
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

  const vigiaCount = p.badges[p.vigiaBadge] ?? 0;
  // Ubicación: espacio › sección (el grupo no se repite si se llama igual o no tiene título)
  const group = active ? p.groups.find((g) => g.items.some((i) => i.href === active.href))?.title : "";
  const trail: { label: string; href?: string }[] = active ? [...(group && group !== active.label ? [{ label: group }] : [{ label: p.spaceName }]), { label: active.label, href: active.href }] : [{ label: p.spaceName }];

  const brand = (small: boolean) => (
    <Link href={p.home} className="flex min-w-0 items-center gap-3" aria-label={`${p.spaceName} · Inicio`}>
      {p.studioBrand ? (
        <span className="flex min-w-0 items-center gap-2.5">
          {p.studioLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.studioLogo} alt="" className="h-9 w-auto max-w-[120px] shrink-0 object-contain" />
          ) : (
            <Sello className="size-9 shrink-0 text-rose-light" title={p.studioBrand} />
          )}
          {!small && (
            <span className="min-w-0 leading-tight">
              <span className="block truncate font-display text-title text-paper">{p.studioBrand}</span>
              <span className="block text-micro text-paper/50">Con tecnología de Faro</span>
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
  // Acciones de la barra: en la superior clara (canvas) o, con la barra lateral colapsada, en la fila oscura de íconos
  const actions = (dark: boolean) => {
    const plain = dark ? "text-paper/70 hover:bg-paper/[0.06] hover:text-paper" : "text-ink hover:bg-surface";
    const ring = dark ? "ring-night" : "ring-canvas";
    return (
      <>
        <button type="button" onClick={() => setSearch(true)} aria-label="Buscar (Ctrl o Cmd + K)" title="Buscar (Ctrl o Cmd + K)" className={cn("grid size-9 place-items-center rounded-md", plain)}>
          <Search className="size-[18px]" strokeWidth={1.6} aria-hidden />
        </button>
        <Link
          href="/vigia"
          onClick={(e) => {
            if (openVigia()) e.preventDefault();
          }}
          data-tour="vigia"
          aria-label={`Vigía${vigiaCount ? ` · ${vigiaCount} ${BADGE_TEXT[p.vigiaBadge]}` : ""}`}
          className={cn("relative inline-flex h-(--control-h) items-center gap-1.5 rounded-md px-2.5 text-meta font-medium text-paper sm:px-3", dark ? "bg-paper/[0.1] hover:bg-paper/[0.16]" : "bg-navy hover:bg-navy-deep")}
        >
          <WandSparkles className="size-4 text-gold" strokeWidth={1.6} aria-hidden />
          <span className="hidden sm:inline">Vigía</span>
          {vigiaCount > 0 && <span aria-hidden className={cn("num absolute -right-1.5 -top-1.5 min-w-[18px] rounded-full bg-rose-light px-1 text-center text-micro leading-[18px] text-night ring-2", ring)}>{vigiaCount}</span>}
        </Link>
        <Link href="/mensajes" aria-label={`Mensajes${p.badges.unread ? ` · ${p.badges.unread} sin leer` : ""}`} title="Mensajes" className={cn("relative grid size-9 place-items-center rounded-md", plain, pathname.startsWith("/mensajes") && (dark ? "bg-paper/[0.1] text-paper" : "bg-surface"))}>
          <MessagesSquare className="size-[18px]" strokeWidth={1.6} aria-hidden />
          {(p.badges.unread ?? 0) > 0 && <span aria-hidden className={cn("num absolute -right-0.5 -top-0.5 min-w-[17px] rounded-full bg-rose-light px-1 text-center text-micro leading-[17px] text-night ring-2", ring)}>{p.badges.unread}</span>}
        </Link>
        {p.notices && <NoticesBell items={p.notices.items} unread={p.notices.unread} className={cn("rounded-md", plain)} />}
        <HelpMenu className={cn("rounded-md", plain)} />
        <AccountMenu user={p.user} spaceName={p.spaceName} links={p.links} spaces={p.spaces} switchOrg={p.switchOrg} signOut={p.signOut} className={dark ? "ring-offset-night hover:ring-paper/30" : undefined} />
      </>
    );
  };
  // Buscador fuera del estudio: las secciones del menú del espacio
  const searchItems = p.groups.flatMap((g) => g.items.map((i) => ({ label: i.label, href: i.href, detail: g.title && g.title !== i.label ? g.title : "" })));
  // El contenido acompaña a la barra con la misma curva (sin salto); con reduced motion, directo
  const pad = collapsed ? "lg:ml-0" : "lg:ml-[248px]";
  const navCount = p.groups.reduce((n, g) => n + g.items.length, 0);

  return (
    <div className="admin-shell app-ui min-h-dvh bg-canvas text-ink" style={p.brandVars ? (p.brandVars as React.CSSProperties) : undefined}>
      {/* Escritorio expandido: barra lateral (siempre oscura) */}
      <LazyMotion features={domMax}>
      <LayoutGroup id="shell-nav">
      <AnimatePresence initial={false}>
      {!collapsed && (
        <m.aside
          key="sidebar"
          // Solo transform: el fondo entra y sale de costado; al colapsar espera a que se vayan las etiquetas
          initial={reduce ? false : { x: "-100%" }}
          animate={{ x: 0, transition: reduce ? NO_MOTION : { type: "spring", stiffness: 320, damping: 34 } }}
          exit={{ x: "-100%", transition: reduce ? NO_MOTION : { type: "spring", stiffness: 320, damping: 36, delay: navCount * STEP + 0.06 } }}
          className="keep-dark fixed inset-y-0 left-0 z-40 hidden w-[248px] flex-col overflow-hidden bg-night text-paper will-change-transform lg:flex"
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
          <SideNav groups={p.groups} badges={p.badges} active={active} shared reduce={!!reduce} />
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
          right={actions(true)}
          reduce={!!reduce}
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

      {/* El contenido se corre con una animación de posición (transform), no con un cambio de padding cuadro a cuadro */}
      <LazyMotion features={domMax}>
      <m.div layout={reduce ? false : "position"} layoutDependency={collapsed} transition={{ type: "spring", stiffness: 320, damping: 36, delay: collapsed ? navCount * STEP * 0.5 : 0 }} className={pad}>
        <header className={cn("sticky top-0 z-30 flex h-[var(--header-h)] items-center gap-2 border-b border-[var(--shell-line)] bg-canvas/95 px-4 backdrop-blur sm:px-6 lg:px-8", collapsed && "lg:hidden")}>
          <nav aria-label="Ubicación" className="min-w-0 flex-1">
            <ol className="flex min-w-0 items-center gap-1.5 text-meta text-muted">
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
          {actions(false)}
        </header>
        {p.viewAs ? (
          <div role="status" data-ver-como className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-rose/40 bg-rose-soft px-4 py-2 text-meta text-rose-deep sm:px-6 lg:px-8">
            <span>
              <strong className="font-semibold">Viendo como {p.viewAs.name}</strong> ({p.viewAs.role} · {p.viewAs.studio}). Datos de la demo; todo queda en la auditoría.
            </span>
            {p.endViewAs && (
              <form action={p.endViewAs}>
                <button type="submit" className="font-semibold underline underline-offset-4">
                  Volver a mi usuario
                </button>
              </form>
            )}
          </div>
        ) : (
          (p.demo || p.serviceMark) && (
            <div role="note" data-demo data-modo={p.serviceMark ?? "demo"} className="border-b border-line bg-rose-soft px-4 py-1.5 text-meta text-rose-deep sm:px-6 lg:px-8">
              {p.serviceMark === "prueba" && !p.demo ? (
                <>
                  <strong className="font-semibold">Modo prueba.</strong> Algunos servicios usan su ambiente de prueba (como la homologación de ARCA): lo que se emite no tiene validez fiscal.
                </>
              ) : (
                <>
                  <strong className="font-semibold">Modo demostración.</strong> {p.demo ? "Estos datos son ficticios y se borran con la demo. " : ""}ARCA, Mercado Pago, WhatsApp, las tiendas y los bancos son simulados: nada sale de Faro ni tiene validez fiscal.{" "}
                  {p.serviceMark === "simulador" && p.space !== "portal" && (
                    <Link href="/simuladores" className="font-semibold underline underline-offset-4">
                      Simuladores
                    </Link>
                  )}
                </>
              )}
            </div>
          )
        )}
        {p.assisted && (
          <div role="status" className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-rose/40 bg-rose-soft px-4 py-2 text-meta text-rose-deep sm:px-6 lg:px-8">
            <span>
              <strong className="font-semibold">Acceso asistido de Faro</strong> a {p.assisted.studioName} hasta{" "}
              {formatDate(p.assisted.expiresAt, "time")}. Todo queda en la auditoría.
            </span>
            {p.endAssisted && (
              <form action={p.endAssisted}>
                <button type="submit" className="font-semibold underline underline-offset-4">
                  Terminar el acceso
                </button>
              </form>
            )}
          </div>
        )}
        <main id="contenido" className="mx-auto w-full max-w-[calc(var(--content-max)+4rem)] px-4 pb-28 pt-6 [--app-bottom:calc(60px+env(safe-area-inset-bottom))] sm:px-6 sm:pt-8 lg:px-8 lg:pb-10 lg:[--app-bottom:0px]">
          <RouteReveal>{p.children}</RouteReveal>
        </main>
      </m.div>
      </LazyMotion>

      {/* Celular: barra inferior */}
      <nav aria-label="Secciones principales" className="keep-dark fixed inset-x-0 bottom-0 z-40 border-t border-paper/10 bg-night pb-[env(safe-area-inset-bottom)] text-paper lg:hidden">
        <ul className="grid grid-cols-5 items-end">
          {[...p.bottom.slice(0, 2), null, ...p.bottom.slice(2, 3)].map((i) => {
            // Al centro, el Vigía como botón destacado (§2.o, regla 8)
            if (!i)
              return (
                <li key="vigia" className="flex justify-center">
                  <Link
                    href="/vigia"
                    onClick={(e) => {
                      if (openVigia()) e.preventDefault();
                    }}
                    aria-label={`Vigía${vigiaCount ? ` · ${vigiaCount} ${BADGE_TEXT[p.vigiaBadge]}` : ""}`}
                    className="relative -mt-5 mb-1 flex flex-col items-center gap-1 text-micro text-paper"
                  >
                    <span className="grid size-[52px] place-items-center rounded-full bg-gold text-night shadow-overlay ring-4 ring-night motion-safe:transition-transform motion-safe:active:scale-95">
                      <WandSparkles className="size-6" strokeWidth={1.6} aria-hidden />
                    </span>
                    {vigiaCount > 0 && <span aria-hidden className="num absolute right-0 top-0 min-w-[18px] rounded-full bg-rose-light px-1 text-center text-micro font-semibold leading-[18px] text-night ring-2 ring-night">{vigiaCount}</span>}
                    Vigía
                  </Link>
                </li>
              );
            const Icon = ICONS[i.icon];
            const on = isActive(i, active);
            const n = i.badge ? (p.badges[i.badge] ?? 0) : 0;
            return (
              <li key={i.href}>
                <Link href={i.href} aria-current={on ? "page" : undefined} className={cn("flex flex-col items-center gap-1 pb-2 pt-2.5 text-micro", on ? "text-paper" : "text-paper/60")}>
                  <span className="relative">
                    <Icon className={cn("size-[22px]", on && "text-rose-light")} strokeWidth={1.5} aria-hidden />
                    {n > 0 && (
                      <span className="tabular absolute -right-2.5 -top-1.5 min-w-4 rounded bg-rose-light px-1 text-center text-micro font-semibold leading-4 text-night">
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
            <button type="button" onClick={() => setDrawer(true)} aria-expanded={drawer} aria-label="Más: el menú completo y tus espacios" className={cn("flex w-full flex-col items-center gap-1 pb-2 pt-2.5 text-micro", drawer ? "text-paper" : "text-paper/60")}>
              <MoreHorizontal className="size-[22px]" strokeWidth={1.5} aria-hidden />
              Más
            </button>
          </li>
        </ul>
      </nav>
      <Suspense>
        <VigiaPanel space={p.space} label={p.spaceName} />
      </Suspense>
      <CommandPalette open={search} onClose={() => setSearch(false)} access={p.studioAccess} items={searchItems} />
    </div>
  );
}

