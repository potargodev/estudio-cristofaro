"use client";

import { Building2, CornerDownLeft, FileText, Inbox, Loader2, MessageSquare, Search, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { adminSearch, type SearchHit } from "@/app/admin/search-actions";
import { cn } from "@/lib/utils";
import { COMERCIAL_TABS, CONFIG_TABS, visibleGroups, visibleTabs, type NavAccess } from "./nav";

const GROUP_ICON = { Organizaciones: Building2, "Razones sociales": FileText, Consultas: UserRound, Solicitudes: MessageSquare } as const;

/**
 * Buscador global (lupa de la barra o Cmd/Ctrl+K), centrado en la pantalla.
 * En todos los espacios lleva a las secciones del menú; en el estudio busca
 * además organizaciones, CUIT, consultas y solicitudes. Flechas para moverse,
 * Enter para abrir y Escape para cerrar.
 */
export function CommandPalette({ open, onClose, access, items }: { open: boolean; onClose: () => void; access?: NavAccess | null; items: { label: string; href: string; detail: string }[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(0);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const restore = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    restore.current = document.activeElement as HTMLElement | null;
    setQ("");
    setHits([]);
    setActive(0);
    requestAnimationFrame(() => input.current?.focus());
    return () => restore.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const term = q.trim();
    if (term.length < 2 || !access) {
      setHits([]);
      return;
    }
    const t = window.setTimeout(() => start(async () => setHits(await adminSearch(term))), 180);
    return () => window.clearTimeout(t);
  }, [q, open, access]);

  const sections = useMemo(() => {
    const all = access
      ? [
          ...visibleGroups(access).flatMap((g) => g.items.map((i) => ({ ...i, detail: "" }))),
          ...visibleTabs(COMERCIAL_TABS, access).map((i) => ({ ...i, detail: "Comercial" })),
          ...visibleTabs(CONFIG_TABS, access).map((i) => ({ ...i, detail: "Configuración" })),
        ]
      : items;
    const seen = new Set<string>();
    return all.filter((i) => !seen.has(i.href) && seen.add(i.href)).map((i) => ({ group: "Ir a", id: i.href, title: i.label, detail: i.detail, href: i.href }));
  }, [access, items]);
  const term = q.trim().toLocaleLowerCase("es");
  const plain = (t: string) => t.toLocaleLowerCase("es").normalize("NFD").replace(/\p{M}/gu, "");
  const matching = term ? sections.filter((i) => plain(`${i.title} ${i.detail}`).includes(plain(term))) : sections;
  const list = term.length >= 2 && access ? [...hits, ...matching] : matching;

  const go = (href: string) => {
    onClose();
    router.push(href);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(list.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter" && list[active]) {
      e.preventDefault();
      go(list[active].href);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  if (!open) return null;
  let lastGroup = "";
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-night/50 p-4 backdrop-blur-[2px]" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Buscar" className="w-full max-w-xl overflow-hidden rounded-md border border-line bg-surface shadow-overlay" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-line px-4">
          {pending ? <Loader2 className="size-4 animate-spin text-muted" aria-hidden /> : <Search className="size-4 text-muted" aria-hidden />}
          <input
            ref={input}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKey}
            data-free
            // El cuadro entero ya marca el foco: sin el contorno global
            style={{ outline: "none" }}
            role="combobox"
            aria-expanded="true"
            aria-controls="cmdk-list"
            aria-activedescendant={list[active] ? `cmdk-${active}` : undefined}
            placeholder={access ? "Buscar organización, CUIT, consulta o solicitud…" : "Buscar una sección…"}
            className="h-(--control-h) flex-1 bg-transparent text-body text-ink placeholder:text-muted focus:outline-none"
          />
          <kbd className="rounded border border-line px-1.5 py-0.5 text-micro text-muted">Esc</kbd>
        </div>
        {/* Alto fijo: el cuadro queda quieto en el centro mientras cambian los resultados */}
        <ul id="cmdk-list" role="listbox" className="h-[min(26rem,55dvh)] overflow-y-auto py-2">
          {list.length === 0 && (
            <li className="flex flex-col items-center gap-2 px-4 py-8 text-center text-ui text-muted">
              <Inbox className="size-5" aria-hidden />
              {pending ? "Buscando…" : access ? "No encontramos resultados. Probá con otro nombre o con el CUIT sin guiones." : "No hay ninguna sección con ese nombre."}
            </li>
          )}
          {list.map((h, i) => {
            const header = h.group !== lastGroup ? h.group : null;
            lastGroup = h.group;
            const Icon = GROUP_ICON[h.group as keyof typeof GROUP_ICON] ?? CornerDownLeft;
            return (
              <li key={`${h.group}-${h.id}`} role="presentation">
                {header && <p className="px-4 pb-1 pt-3 text-caption text-muted">{header}</p>}
                <button
                  id={`cmdk-${i}`}
                  role="option"
                  aria-selected={i === active}
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(h.href)}
                  className={cn("flex w-full items-center gap-3 px-4 py-2.5 text-left text-ui", i === active ? "bg-navy-soft" : "")}
                >
                  <Icon className="size-4 shrink-0 text-rose-deep" strokeWidth={1.5} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-ink">{h.title}</span>
                    {h.detail && <span className="block truncate text-meta text-muted">{h.detail}</span>}
                  </span>
                  {i === active && <CornerDownLeft className="size-3.5 text-muted" aria-hidden />}
                </button>
              </li>
            );
          })}
        </ul>
        <p className="flex gap-4 border-t border-line px-4 py-2 text-caption text-muted">
          <span>↑ ↓ para moverte</span>
          <span>Enter para abrir</span>
        </p>
      </div>
    </div>
  );
}
