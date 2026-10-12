"use client";

import { Building2, Check, ChevronsUpDown, Compass, Store, UserRound, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Popover } from "@/components/ds/Popover";
import { cn } from "@/lib/utils";

// Selector de espacio (docs/faro-producto.md §2.o): arriba de la barra lateral,
// con el nombre y el tipo del espacio activo; el cambio es de un toque. El
// servidor valida cada cambio (la organización, contra las membresías).

export interface ShellSpace {
  key: string;
  label: string;
  /** Tipo de espacio: Estudio, Organización · rol, Personal, Plataforma */
  kind: string;
  href: string;
  current: boolean;
  icon: "studio" | "org" | "personal" | "faro";
  /** Cambiar de organización del portal (form con el id; el servidor valida la membresía) */
  orgId?: string;
}

const ICON: Record<ShellSpace["icon"], LucideIcon> = { studio: Building2, org: Store, personal: UserRound, faro: Compass };

/** Abre el selector desde otro lugar (menú de la cuenta) */
const OPEN_SPACES = "faro:espacios";

/** Lista de espacios (selector y menú de la cuenta) */
export function SpaceList({ spaces, switchOrg, onPick, tone = "dark" }: { spaces: ShellSpace[]; switchOrg?: (fd: FormData) => void | Promise<void>; onPick?: () => void; tone?: "dark" | "light" }) {
  const row = (on: boolean) =>
    cn(
      "flex w-full min-w-0 items-center gap-3 rounded-md px-2.5 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset",
      tone === "dark" ? "focus-visible:ring-rose-light" : "focus-visible:ring-ring",
      tone === "dark" ? (on ? "bg-paper/[0.08] text-paper" : "text-paper/80 hover:bg-paper/[0.06] hover:text-paper") : on ? "bg-canvas text-ink" : "text-ink hover:bg-canvas",
    );
  const body = (s: ShellSpace) => {
    const Icon = ICON[s.icon];
    return (
      <>
        <span className={cn("grid size-8 shrink-0 place-items-center rounded-md", tone === "dark" ? "bg-paper/[0.08] text-rose-light" : "bg-navy-soft text-rose-deep")}>
          <Icon className="size-4" strokeWidth={1.5} aria-hidden />
        </span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-ui" title={s.label}>
            {s.label}
          </span>
          <span className={cn("block truncate text-caption", tone === "dark" ? "text-paper/50" : "text-muted")} title={s.kind}>
            {s.kind}
          </span>
        </span>
        {s.current && <Check className={cn("size-4 shrink-0", tone === "dark" ? "text-rose-light" : "text-rose-deep")} aria-label="Espacio actual" />}
      </>
    );
  };
  return (
    <ul className="grid min-w-0 gap-0.5">
      {spaces.map((s) => (
        <li key={s.key} className="min-w-0">
          {s.orgId && switchOrg && !s.current ? (
            <form action={switchOrg} onSubmit={onPick} className="min-w-0">
              <input type="hidden" name="organization_id" value={s.orgId} />
              <button type="submit" role="menuitemradio" aria-checked={s.current} className={row(s.current)}>
                {body(s)}
              </button>
            </form>
          ) : (
            <Link href={s.href} role="menuitemradio" aria-checked={s.current} onClick={onPick} className={row(s.current)}>
              {body(s)}
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Botón del espacio activo con su lista desplegable */
export function SpaceSwitcher({ spaces, switchOrg, compact = false, className }: { spaces: ShellSpace[]; switchOrg?: (fd: FormData) => void | Promise<void>; compact?: boolean; className?: string }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const current = spaces.find((s) => s.current) ?? spaces[0];
  const close = useCallback(() => setOpen(false), []);
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(OPEN_SPACES, show);
    return () => window.removeEventListener(OPEN_SPACES, show);
  }, []);
  if (!current) return null;
  const Icon = ICON[current.icon];
  const single = spaces.length < 2;
  const face = (
    <>
      <span className="grid size-8 shrink-0 place-items-center rounded-md bg-paper/[0.08] text-rose-light">
        <Icon className="size-4" strokeWidth={1.5} aria-hidden />
      </span>
      <span className={cn("min-w-0 flex-1 text-left leading-tight", compact && "hidden xl:block")}>
        <span className="block truncate text-ui font-medium text-paper" title={current.label}>
          {current.label}
        </span>
        <span className="block truncate text-caption text-paper/55" title={current.kind}>
          {current.kind}
        </span>
      </span>
      {!single && <ChevronsUpDown className={cn("size-4 shrink-0 text-paper/50", compact && "hidden xl:block")} aria-hidden />}
    </>
  );
  return (
    <div className={cn("relative min-w-0", className)} data-tour="espacio">
      {single ? (
        <div className="flex min-w-0 items-center gap-3 rounded-md border border-paper/10 px-2 py-1.5">{face}</div>
      ) : (
        <button
          ref={btn}
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          data-free
          aria-label={`Espacio: ${current.label} (${current.kind}). Cambiar de espacio`}
          onClick={() => setOpen((o) => !o)}
          className={cn("flex w-full min-w-0 items-center gap-3 rounded-md border px-2 py-1.5 outline-none transition-colors hover:border-paper/25 hover:bg-paper/[0.04] focus-visible:border-rose-light", open ? "border-paper/25 bg-paper/[0.04]" : "border-paper/10")}
        >
          {face}
        </button>
      )}
      <Popover open={open} onClose={close} anchor={btn} align={compact ? "start" : "match"} minWidth={compact ? 256 : 0} offset={4} label="Cambiar de espacio" className="keep-dark w-64 border border-paper/15 bg-night p-1 text-paper">
        <p className="px-2.5 pb-1 pt-1.5 text-caption text-paper/60">Tus espacios</p>
        <SpaceList spaces={spaces} switchOrg={switchOrg} onPick={close} />
      </Popover>
    </div>
  );
}
