"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { markNoticesReadAction } from "@/app/actions/notices";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";

export interface Notice {
  id: string;
  title: string;
  body: string | null;
  href: string | null;
  read: boolean;
  at: string;
}

const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "recién";
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  return formatDate(iso, "short");
};

/** Campanita: avisos dentro de la app (gastos que te cargaron, pagos, grupos) */
export function NoticesBell({ items, unread, className }: { items: Notice[]; unread: number; className?: string }) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(unread);
  const box = useRef<HTMLDivElement>(null);
  const router = useRouter();
  useEffect(() => setCount(unread), [unread]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && count > 0) {
      setCount(0);
      void markNoticesReadAction().then(() => router.refresh());
    }
  };
  return (
    <div ref={box} className="relative">
      <button type="button" onClick={toggle} aria-expanded={open} aria-label={count ? `Avisos: ${count} sin leer` : "Avisos"} className={cn("relative grid size-9 place-items-center", className)}>
        <Bell className="size-4" aria-hidden />
        {count > 0 && <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-gold px-1 text-micro font-semibold text-night">{count > 9 ? "9+" : count}</span>}
      </button>
      {open && (
        <div role="dialog" aria-label="Avisos" className="absolute right-0 top-full z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-md border border-line bg-surface shadow-overlay">
          <p className="border-b border-line px-4 py-2.5 text-meta font-semibold">Avisos</p>
          {items.length === 0 ? (
            <p className="px-4 py-6 text-center text-ui text-muted">No tenés avisos.</p>
          ) : (
            <ul className="max-h-[60vh] divide-y divide-line overflow-y-auto">
              {items.map((n) => {
                const body = (
                  <>
                    <span className={cn("block text-ui", !n.read && "font-medium")}>{n.title}</span>
                    {n.body && <span className="block text-meta text-muted">{n.body}</span>}
                    <span className="block text-caption text-muted">{ago(n.at)}</span>
                  </>
                );
                return (
                  <li key={n.id} className={cn(!n.read && "bg-navy-soft/60")}>
                    {n.href ? (
                      <Link href={n.href} onClick={() => setOpen(false)} className="block px-4 py-3 hover:bg-navy-soft">
                        {body}
                      </Link>
                    ) : (
                      <div className="px-4 py-3">{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
