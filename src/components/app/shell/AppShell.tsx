"use client";

import {
  ArrowLeftRight,
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
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { setSidebarPref } from "@/app/actions/prefs";
import { CommandPalette } from "@/components/admin/shell/CommandPalette";
import { askFaroHref, primaryAction, type NavAccess } from "@/components/admin/shell/nav";
import { Avatar } from "@/components/admin/kit/Avatar";
import { FaroLogo } from "@/components/admin/kit/FaroLogo";
import { Sello } from "@/components/admin/kit/Sello";
import { GuideButton, HelpLink } from "@/components/app/Guide";
import { RouteReveal } from "@/components/app/RouteReveal";
import { ThemeToggle } from "@/components/app/ThemeToggle";
import { cn } from "@/lib/utils";
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
};

export interface ShellSpace {
  key: string;
  label: string;
  href: string;
  current: boolean;
  /** Cambiar de organización del portal (form con el id; el servidor valida la membresía) */
  orgId?: string;
}

export interface ShellProps {
  space: Space;
  groups: ShellGroup[];
  bottom: ShellItem[];
  badges: Partial<Record<ShellBadge, number>>;
  user: { id: string; name: string; email: string; roleLabel: string };
  spaceName: string;
  spaces: ShellSpace[];
  home: string;
  account: string;
  /** Portal: la marca del estudio ("Con tecnología de Faro") */
  studioBrand?: string | null;
  collapsedInitial: boolean;
  /** Estudio: buscador (Cmd/Ctrl+K), "Preguntar a Faro" y acción principal */
  studioAccess?: NavAccess | null;
  assisted?: { studioName: string; expiresAt: string } | null;
  endAssisted?: () => void | Promise<void>;
  signOut: () => void | Promise<void>;
  switchOrg?: (fd: FormData) => void | Promise<void>;
  children: React.ReactNode;
}

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

function SideNav({ groups, badges, active, onNavigate }: { groups: ShellGroup[]; badges: ShellProps["badges"]; active: ShellItem | null; onNavigate?: () => void }) {
  return (
    <nav aria-label="Menú" data-tour="nav" className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-2">
      {groups.map((g) => (
        <div key={g.title} className="mb-4">
          <p className="mb-1 h-5 px-3 text-[12px] text-slate-light">{g.title}</p>
          <ul>
            {g.items.map((i) => {
              const Icon = ICONS[i.icon];
              const on = isActive(i, active);
              const n = i.badge ? (badges[i.badge] ?? 0) : 0;
              return (
                <li key={`${g.title}-${i.href}`}>
                  <Link
                    href={i.href}
                    onClick={onNavigate}
                    aria-current={on ? "page" : undefined}
                    className={cn("relative flex h-10 items-center gap-3 rounded-md px-3 text-[14px] transition-colors", on ? "bg-paper/[0.08] text-paper" : "text-paper/70 hover:bg-paper/[0.04] hover:text-paper")}
                  >
                    <Icon className={cn("size-[18px] shrink-0", on && "text-rose-light")} strokeWidth={1.5} aria-hidden />
                    <span className="flex-1 truncate">{i.label}</span>
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
          <Icon className="size-[18px]" strokeWidth={1.5} aria-hidden />
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
    <div className="keep-dark sticky top-0 z-40 hidden h-14 items-center gap-2 border-b border-paper/10 bg-night px-3 text-paper lg:flex">
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
    </div>
  );
}

function UserMenu({ user, spaceName, spaces, account, signOut, switchOrg, up = true }: Pick<ShellProps, "user" | "spaceName" | "spaces" | "account" | "signOut" | "switchOrg"> & { up?: boolean }) {
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
    <div ref={ref} className="relative">
      <button type="button" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 rounded-md p-1.5 text-left hover:bg-paper/[0.05]">
        <Avatar name={user.name || user.email} size="sm" tone="dark" className="size-8" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] text-paper">{user.name || user.email}</span>
          <span className="block truncate text-[12px] text-slate-light">
            {user.roleLabel} · {spaceName}
          </span>
        </span>
      </button>
      {open && (
        <div role="menu" className={cn("absolute left-0 z-50 w-64 rounded-md border border-paper/15 bg-night py-1 text-[14px] shadow-[0_16px_40px_-16px_rgba(0,0,0,0.6)]", up ? "bottom-full mb-2" : "top-full mt-2")}>
          {spaces.length > 1 && (
            <>
              <p className="px-3 pb-1 pt-2 text-[11px] uppercase tracking-[0.12em] text-paper/45">Cambiar de espacio</p>
              {spaces.map((s) =>
                s.orgId && switchOrg ? (
                  <form key={s.key} action={switchOrg}>
                    <input type="hidden" name="organization_id" value={s.orgId} />
                    <button role="menuitem" type="submit" className={cn("flex w-full items-center gap-2.5 px-3 py-2 text-left", s.current ? "text-paper" : "text-paper/75 hover:bg-paper/[0.06] hover:text-paper")}>
                      <ArrowLeftRight className="size-4" strokeWidth={1.5} aria-hidden /> <span className="truncate">{s.label}</span>
                    </button>
                  </form>
                ) : (
                  <Link key={s.key} role="menuitem" href={s.href} onClick={() => setOpen(false)} aria-current={s.current ? "true" : undefined} className={cn("flex items-center gap-2.5 px-3 py-2", s.current ? "text-paper" : "text-paper/75 hover:bg-paper/[0.06] hover:text-paper")}>
                    <ArrowLeftRight className="size-4" strokeWidth={1.5} aria-hidden /> <span className="truncate">{s.label}</span>
                  </Link>
                ),
              )}
              <div className="my-1 border-t border-paper/10" />
            </>
          )}
          <Link role="menuitem" href={account} onClick={() => setOpen(false)} className="flex items-center gap-2.5 px-3 py-2.5 text-paper/85 hover:bg-paper/[0.06] hover:text-paper">
            <KeyRound className="size-4" strokeWidth={1.5} aria-hidden /> Mi cuenta
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

export function AppShell(p: ShellProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [collapsed, setCollapsed] = useState(p.collapsedInitial);
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

  const action = p.space === "studio" && p.studioAccess && !p.studioAccess.isPersonal ? primaryAction(pathname, p.studioAccess.isOperator) : null;
  const ask = p.space === "studio" && p.studioAccess && !pathname.startsWith("/admin/asistente") ? askFaroHref(pathname, searchParams) : null;
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
  const pad = collapsed ? "lg:pl-0" : "lg:pl-[248px]";

  return (
    <div className="admin-shell app-ui min-h-dvh bg-canvas text-ink">
      {/* Escritorio expandido: barra lateral (siempre oscura) */}
      {!collapsed && (
        <aside className="keep-dark fixed inset-y-0 left-0 z-40 hidden w-[248px] flex-col bg-night text-paper lg:flex">
          <div className="flex h-20 items-center justify-between gap-2 border-b border-paper/10 pl-5 pr-3">
            {brand(false)}
            <button type="button" onClick={toggle} aria-label="Contraer la barra lateral ( [ )" title="Contraer ( [ )" className="grid size-8 shrink-0 place-items-center rounded-md text-paper/60 hover:bg-paper/[0.06] hover:text-paper">
              <ChevronsLeft className="size-[18px]" strokeWidth={1.6} aria-hidden />
            </button>
          </div>
          <SideNav groups={p.groups} badges={p.badges} active={active} />
          <div className="border-t border-paper/10 p-3">
            <UserMenu {...p} />
          </div>
        </aside>
      )}
      {/* Escritorio colapsado: barra horizontal de íconos */}
      {collapsed && (
        <TopIconBar
          groups={p.groups}
          badges={p.badges}
          active={active}
          onExpand={toggle}
          brand={<span className="mr-2 flex items-center">{brand(true)}</span>}
          right={<UserMenu {...p} up={false} />}
        />
      )}

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
            <SideNav groups={p.groups} badges={p.badges} active={active} onNavigate={() => setDrawer(false)} />
            <div className="border-t border-paper/10 p-3">
              <div className="mb-2 flex items-center justify-between px-1.5 text-[13px] text-paper/70">
                Tema
                <ThemeToggle withLabel className="text-paper/80 hover:text-paper" />
              </div>
              <UserMenu {...p} />
            </div>
          </aside>
        </div>
      )}

      <div className={pad}>
        <header className={cn("sticky z-30 flex h-14 items-center gap-2 border-b border-line bg-canvas/95 px-4 backdrop-blur sm:px-6 lg:px-8", collapsed ? "top-0 lg:top-14" : "top-0")}>
          <button type="button" onClick={() => setDrawer(true)} aria-label="Abrir menú" className="grid size-9 place-items-center rounded-md border border-line lg:hidden">
            <Menu className="size-5" aria-hidden />
          </button>
          <nav aria-label="Ubicación" className="min-w-0 flex-1">
            <ol className="flex min-w-0 items-center gap-1.5 text-[13px] text-muted">
              {trail.map((c, i) => (
                <li key={i} className={cn("flex min-w-0 items-center gap-1.5", i < trail.length - 1 && "hidden sm:flex")}>
                  {i > 0 && <ChevronRight className="size-3.5 shrink-0" aria-hidden />}
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
          {ask && (
            <Link href={ask} className="hidden h-9 items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 text-[13px] font-medium text-ink hover:border-muted md:inline-flex" title="Preguntar a Faro sobre esta pantalla">
              <Sparkles className="size-4 text-rose-deep" strokeWidth={1.5} aria-hidden />
              Preguntar a Faro
            </Link>
          )}
          {p.studioAccess && (
            <button type="button" onClick={() => setSearch(true)} className="hidden h-9 items-center gap-2 rounded-md border border-line bg-surface px-2.5 text-[13px] text-muted hover:border-muted sm:flex sm:w-56" aria-label="Buscar (Ctrl o Cmd + K)">
              <Search className="size-4" aria-hidden />
              <span className="hidden flex-1 text-left sm:inline">Buscar…</span>
              <kbd className="hidden rounded border border-line px-1 text-[11px] sm:inline">⌘K</kbd>
            </button>
          )}
          <GuideButton className="rounded-md border border-line bg-surface text-ink hover:border-muted" />
          <HelpLink compact className="rounded-md border border-line bg-surface text-ink hover:border-muted" />
          <ThemeToggle className="hidden rounded-md border border-line bg-surface text-ink hover:border-muted sm:inline-flex" />
          {action && (
            <Link href={action.href} data-tour="accion" className="inline-flex h-9 items-center gap-1.5 rounded-md bg-navy px-3 text-[13px] font-medium text-paper hover:bg-navy-deep sm:px-4">
              <Plus className="size-4" aria-hidden />
              <span className="hidden sm:inline">{action.label}</span>
              <span className="sr-only sm:hidden">{action.label}</span>
            </Link>
          )}
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
        <main id="contenido" className="mx-auto w-full max-w-[1440px] px-4 pb-28 pt-6 sm:px-6 sm:pt-8 lg:px-8 lg:pb-10">
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
      {p.studioAccess && <CommandPalette open={search} onClose={() => setSearch(false)} access={p.studioAccess} />}
    </div>
  );
}

