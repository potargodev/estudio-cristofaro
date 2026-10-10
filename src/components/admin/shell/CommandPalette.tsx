"use client";

import { Building2, CornerDownLeft, FileText, Inbox, Loader2, MessageSquare, Search, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { adminSearch, type SearchHit } from "@/app/admin/search-actions";
import { cn } from "@/lib/utils";
import { NAV_GROUPS } from "./nav";

const GROUP_ICON = { Organizaciones: Building2, "Razones sociales": FileText, Consultas: UserRound, Solicitudes: MessageSquare } as const;

/**
 * Buscador global (Cmd/Ctrl+K): organizaciones, CUIT, consultas y solicitudes.
 * Sin texto, muestra accesos directos a las secciones. Flechas para moverse,
 * Enter para abrir y Escape para cerrar.
 */
export function CommandPalette({ open, onClose, isAdmin }: { open: boolean; onClose: () => void; isAdmin: boolean }) {
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
    if (term.length < 2) {
      setHits([]);
      return;
    }
    const t = window.setTimeout(() => start(async () => setHits(await adminSearch(term))), 180);
    return () => window.clearTimeout(t);
  }, [q, open]);

  const sections = useMemo(
    () =>
      NAV_GROUPS.filter((g) => !g.adminOnly || isAdmin)
        .flatMap((g) => g.items)
        .map((i) => ({ group: "Ir a", id: i.href, title: i.label, detail: "", href: i.href })),
    [isAdmin],
  );
  const list = q.trim().length >= 2 ? hits : sections;

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
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-night/50 px-4 pt-[12vh] backdrop-blur-[2px]" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Buscar en el backoffice" className="w-full max-w-xl border border-line bg-surface shadow-[0_24px_60px_-20px_rgba(15,19,32,0.5)]" onMouseDown={(e) => e.stopPropagation()}>
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
            role="combobox"
            aria-expanded="true"
            aria-controls="cmdk-list"
            aria-activedescendant={list[active] ? `cmdk-${active}` : undefined}
            placeholder="Buscar organización, CUIT, consulta o solicitud…"
            className="h-12 flex-1 bg-transparent text-[15px] text-ink placeholder:text-muted focus:outline-none"
          />
          <kbd className="border border-line px-1.5 py-0.5 text-[11px] text-muted">Esc</kbd>
        </div>
        <ul id="cmdk-list" role="listbox" className="max-h-[50vh] overflow-y-auto py-2">
          {list.length === 0 && (
            <li className="flex flex-col items-center gap-2 px-4 py-8 text-center text-[14px] text-muted">
              <Inbox className="size-5" aria-hidden />
              {pending ? "Buscando…" : "No encontramos resultados. Probá con otro nombre o con el CUIT sin guiones."}
            </li>
          )}
          {list.map((h, i) => {
            const header = h.group !== lastGroup ? h.group : null;
            lastGroup = h.group;
            const Icon = GROUP_ICON[h.group as keyof typeof GROUP_ICON] ?? CornerDownLeft;
            return (
              <li key={`${h.group}-${h.id}`} role="presentation">
                {header && <p className="px-4 pb-1 pt-3 text-[12px] text-muted">{header}</p>}
                <button
                  id={`cmdk-${i}`}
                  role="option"
                  aria-selected={i === active}
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(h.href)}
                  className={cn("flex w-full items-center gap-3 px-4 py-2.5 text-left text-[14px]", i === active ? "bg-navy-soft" : "")}
                >
                  <Icon className="size-4 shrink-0 text-gold-ink" strokeWidth={1.5} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-ink">{h.title}</span>
                    {h.detail && <span className="block truncate text-[13px] text-muted">{h.detail}</span>}
                  </span>
                  {i === active && <CornerDownLeft className="size-3.5 text-muted" aria-hidden />}
                </button>
              </li>
            );
          })}
        </ul>
        <p className="flex gap-4 border-t border-line px-4 py-2 text-[12px] text-muted">
          <span>↑ ↓ para moverte</span>
          <span>Enter para abrir</span>
        </p>
      </div>
    </div>
  );
}
