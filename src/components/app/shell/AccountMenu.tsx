"use client";

import { ArrowLeftRight, ChevronDown, KeyRound, LogOut, Tags, Users, Waypoints } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/admin/kit/Avatar";
import { ThemeToggle } from "@/components/app/ThemeToggle";
import { cn } from "@/lib/utils";
import { SpaceList, type ShellSpace } from "./SpaceSwitcher";

export interface AccountLinks {
  account: string;
  /** Plan y facturación (dueño del estudio o titular de la cuenta personal) */
  plan?: string;
  /** Accesos MCP (usuarios de un tenant) */
  mcp?: string;
  /** Configuración de la organización: Mi equipo (quien puede gestionarlo) */
  team?: string;
}

/**
 * Menú de la cuenta (avatar de la barra superior, docs/faro-producto.md §2.o):
 * Mi cuenta, Plan y facturación, Accesos MCP, tema claro/oscuro, cambiar de
 * espacio y Salir. En el portal suma "Mi equipo" para quien lo gestiona.
 */
export function AccountMenu({
  user,
  spaceName,
  links,
  spaces,
  switchOrg,
  signOut,
}: {
  user: { name: string; email: string; roleLabel: string };
  spaceName: string;
  links: AccountLinks;
  spaces: ShellSpace[];
  switchOrg?: (fd: FormData) => void | Promise<void>;
  signOut: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [spacesOpen, setSpacesOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
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
  useEffect(() => {
    setOpen(false);
    setSpacesOpen(false);
  }, [pathname]);
  const row = "flex w-full items-center gap-2.5 rounded-[4px] px-3 py-2.5 text-left text-ink hover:bg-canvas";
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-expanded={open} aria-haspopup="menu" aria-label={`Tu cuenta: ${user.name || user.email}`} onClick={() => setOpen((o) => !o)} className="grid size-9 place-items-center rounded-full ring-offset-2 ring-offset-canvas hover:ring-2 hover:ring-line">
        <Avatar name={user.name || user.email} size="sm" className="size-8" />
      </button>
      {open && (
        <div role="menu" aria-label="Tu cuenta" className="app-ui absolute right-0 top-full z-50 mt-2 max-h-[calc(100dvh-5rem)] w-[min(18rem,calc(100vw-2rem))] overflow-y-auto rounded-md border border-line bg-surface p-1.5 text-ui shadow-overlay">
          <div className="px-3 pb-2 pt-1.5">
            <p className="truncate font-medium text-ink">{user.name || user.email}</p>
            <p className="truncate text-caption text-muted">{user.email}</p>
            <p className="mt-0.5 truncate text-caption text-muted">
              {user.roleLabel} · {spaceName}
            </p>
          </div>
          <div className="my-1 border-t border-line" />
          <Link role="menuitem" href={links.account} className={row}>
            <KeyRound className="size-4 text-muted" strokeWidth={1.5} aria-hidden /> Mi cuenta
          </Link>
          {links.team && (
            <Link role="menuitem" href={links.team} className={row}>
              <Users className="size-4 text-muted" strokeWidth={1.5} aria-hidden /> Mi equipo
            </Link>
          )}
          {links.plan && (
            <Link role="menuitem" href={links.plan} className={row}>
              <Tags className="size-4 text-muted" strokeWidth={1.5} aria-hidden /> Plan y facturación
            </Link>
          )}
          {links.mcp && (
            <Link role="menuitem" href={links.mcp} className={row}>
              <Waypoints className="size-4 text-muted" strokeWidth={1.5} aria-hidden /> Accesos MCP
            </Link>
          )}
          <div className="flex items-center justify-between gap-2 px-3 py-1.5 text-ink">
            Tema
            <ThemeToggle withLabel className="h-8 rounded-md border border-line px-2 text-meta text-ink hover:border-muted" />
          </div>
          {spaces.length > 1 && (
            <>
              <button type="button" role="menuitem" aria-expanded={spacesOpen} onClick={() => setSpacesOpen((o) => !o)} className={row}>
                <ArrowLeftRight className="size-4 text-muted" strokeWidth={1.5} aria-hidden />
                <span className="flex-1">Cambiar de espacio</span>
                <ChevronDown className={cn("size-4 text-muted motion-safe:transition-transform", spacesOpen && "rotate-180")} aria-hidden />
              </button>
              {spacesOpen && (
                <div className="px-1 pb-1">
                  <SpaceList spaces={spaces} switchOrg={switchOrg} tone="light" onPick={() => setOpen(false)} />
                </div>
              )}
            </>
          )}
          <div className="my-1 border-t border-line" />
          <form action={signOut}>
            <button role="menuitem" type="submit" className={row}>
              <LogOut className="size-4 text-muted" strokeWidth={1.5} aria-hidden /> Salir
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
