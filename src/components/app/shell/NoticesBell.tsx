"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Popover } from "@/components/ds/Popover";
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
  const btn = useRef<HTMLButtonElement>(null);
  const router = useRouter();
  const close = useCallback(() => setOpen(false), []);
  useEffect(() => setCount(unread), [unread]);
  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && count > 0) {
      setCount(0);
      void markNoticesReadAction().then(() => router.refresh());
    }
  };
  return (
    <div className="relative">
      <button ref={btn} type="button" onClick={toggle} aria-expanded={open} aria-label={count ? `Avisos: ${count} sin leer` : "Avisos"} className={cn("relative grid size-9 place-items-center", className)}>
        <Bell className="size-4" aria-hidden />
        {count > 0 && <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-gold px-1 text-micro font-semibold text-night">{count > 9 ? "9+" : count}</span>}
      </button>
      <Popover open={open} onClose={close} anchor={btn} role="dialog" label="Avisos" className="w-[min(22rem,calc(100vw-1rem))] border border-line bg-surface">
          <p className="border-b border-line px-4 py-2.5 text-meta font-semibold">Avisos</p>
          {items.length === 0 ? (
            <p className="px-4 py-6 text-center text-ui text-muted">No tenés avisos.</p>
          ) : (
            <ul className="divide-y divide-line">
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
      </Popover>
    </div>
  );
}
