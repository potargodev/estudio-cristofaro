"use client";

import { Maximize2, WandSparkles, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { askFaroContext } from "@/components/admin/shell/nav";
import { cn } from "@/lib/utils";
import { OPEN_VIGIA } from "./events";
import { SPACE_PARAM, type SpaceKey } from "./space-param";
import { isInternalPath } from "@/lib/paths";

/**
 * Panel del Vigía (docs/faro-producto.md §2.o, regla 5): el mismo botón en
 * todos los espacios abre un panel al costado (pantalla completa en el
 * celular) sin salir de la pantalla. Adentro va /vigia-panel, que el servidor
 * arma según el espacio y la sesión (sus herramientas, permisos y claves); acá
 * solo se elige qué espacio pedir y el contexto de la pantalla (IDs que el
 * servidor vuelve a validar). "Abrir en pantalla completa" lleva a /vigia.
 */
export function VigiaPanel({ space, label }: { space: SpaceKey; label: string }) {
  const [open, setOpen] = useState(false);
  const [src, setSrc] = useState<string | null>(null);
  const [tab, setTab] = useState<string | null>(null);
  const pathname = usePathname();
  const search = useSearchParams();
  const router = useRouter();
  const closeBtn = useRef<HTMLButtonElement>(null);
  const opener = useRef<Element | null>(null);
  const param = SPACE_PARAM[space];

  // El panel es de un espacio: si cambia el espacio, se arma de nuevo
  useEffect(() => {
    setSrc(null);
    setOpen(false);
  }, [param]);

  const show = useCallback(
    (wanted?: string) => {
      const ctx = space === "studio" ? askFaroContext(pathname, search) : null;
      const q = new URLSearchParams({ espacio: param });
      if (wanted) q.set("tab", wanted);
      if (ctx) {
        q.set("contexto", ctx);
        q.set("nueva", "1");
      }
      const next = `/vigia-panel?${q.toString()}`;
      opener.current = document.activeElement;
      setSrc((cur) => (cur && !ctx && !wanted ? cur : next));
      setOpen(true);
    },
    [space, param, pathname, search],
  );

  useEffect(() => {
    window.__faroVigiaPanel = true;
    const h = (e: Event) => show((e as CustomEvent<{ tab?: string } | undefined>).detail?.tab);
    window.addEventListener(OPEN_VIGIA, h);
    return () => {
      window.__faroVigiaPanel = false;
      window.removeEventListener(OPEN_VIGIA, h);
    };
  }, [show]);

  const close = useCallback(() => {
    setOpen(false);
    router.refresh(); // badges al día (propuestas aprobadas, respuestas leídas)
    (opener.current as HTMLElement | null)?.focus?.();
  }, [router]);

  // Mensajes del panel: ir a otra pantalla (lo hace esta ventana) y la pestaña activa
  useEffect(() => {
    const h = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || typeof e.data !== "object" || !e.data) return;
      const d = e.data as { type?: string; href?: string; tab?: string | null };
      if (d.type === "faro:navigate" && isInternalPath(d.href)) {
        setOpen(false);
        router.push(d.href);
      } else if (d.type === "faro:tab") setTab(d.tab ?? null);
    };
    window.addEventListener("message", h);
    return () => window.removeEventListener("message", h);
  }, [router]);

  useEffect(() => {
    if (!open) return;
    closeBtn.current?.focus();
    const k = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, close]);

  const full = space === "studio" ? `/admin/vigia${tab ? `?tab=${tab}` : ""}` : `/vigia?${new URLSearchParams({ espacio: param, ...(tab ? { tab } : {}) }).toString()}`;
  return (
    <>
      {open && <button type="button" aria-label="Cerrar el Vigía" tabIndex={-1} onClick={close} className="fixed inset-0 z-[55] bg-night/40 lg:hidden" />}
      <aside
        role="dialog"
        aria-modal="false"
        aria-label={`Vigía · ${label}`}
        aria-hidden={!open}
        inert={!open}
        className={cn(
          "app-ui fixed inset-0 z-[60] flex flex-col bg-canvas text-ink shadow-overlay lg:inset-y-0 lg:left-auto lg:right-0 lg:w-[480px] lg:border-l lg:border-line",
          "motion-safe:transition-[transform,visibility] motion-safe:duration-300 motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)]",
          open ? "visible translate-x-0" : "invisible translate-x-full",
        )}
      >
        <div className="flex h-[var(--header-h)] shrink-0 items-center gap-2 border-b border-line px-3 pt-[env(safe-area-inset-top)] sm:px-4">
          <span aria-hidden className="grid size-8 place-items-center rounded-md bg-navy text-gold">
            <WandSparkles className="size-4" strokeWidth={1.6} />
          </span>
          <p className="min-w-0 flex-1 leading-tight">
            <span className="block text-body font-semibold">Vigía</span>
            <span className="block truncate text-caption text-muted">{label}</span>
          </p>
          <Link href={full} onClick={() => setOpen(false)} className="inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-meta text-ink hover:bg-surface" title="Abrir en pantalla completa">
            <Maximize2 className="size-4" aria-hidden />
            <span className="hidden sm:inline">Abrir en pantalla completa</span>
            <span className="sr-only sm:hidden">Abrir en pantalla completa</span>
          </Link>
          <button ref={closeBtn} type="button" onClick={close} aria-label="Cerrar el Vigía" className="grid size-9 place-items-center rounded-md hover:bg-surface">
            <X className="size-5" aria-hidden />
          </button>
        </div>
        {src && <iframe key={src} src={src} title={`Vigía · ${label}`} className="min-h-0 w-full flex-1 border-0 bg-canvas" />}
      </aside>
    </>
  );
}
