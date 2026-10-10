"use client";

import { LayoutGroup, LazyMotion, domMax, m, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useOptimistic, useTransition, useState } from "react";
import { moveLead } from "@/app/admin/actions";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CONTRIBUTOR_TYPES, LEAD_SOURCES, LEAD_STATUSES, type Lead, type LeadStatus } from "@/lib/types";

type BoardLead = Pick<
  Lead,
  "id" | "name" | "company" | "contributor_type" | "source" | "status" | "created_at" | "next_action" | "next_action_at"
>;

function ago(iso: string | Date) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return "hoy";
  if (days === 1) return "ayer";
  return `hace ${days} días`;
}

export function LeadBoard({ leads }: { leads: BoardLead[] }) {
  const [optimistic, setOptimistic] = useOptimistic(leads, (state, { id, status }: { id: string; status: LeadStatus }) =>
    state.map((l) => (l.id === id ? { ...l, status } : l)),
  );
  const [, startTransition] = useTransition();
  const [over, setOver] = useState<LeadStatus | null>(null);
  const reduce = useReducedMotion();

  function move(id: string, status: LeadStatus) {
    startTransition(async () => {
      setOptimistic({ id, status });
      await moveLead(id, status);
    });
  }

  // domMax suma las animaciones de layout: la tarjeta se desliza a su nueva columna
  return (
    <LazyMotion features={domMax}>
    <LayoutGroup>
    <div className="-mx-4 overflow-x-auto px-4 pb-4 sm:-mx-8 sm:px-8">
      <div className="grid min-w-[1100px] grid-cols-5 gap-3">
        {LEAD_STATUSES.map((col) => {
          const items = optimistic.filter((l) => l.status === col.value);
          return (
            <section
              key={col.value}
              aria-label={col.label}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(col.value);
              }}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                const id = e.dataTransfer.getData("text/plain");
                if (id) move(id, col.value);
              }}
              className={`flex min-h-[60vh] flex-col rounded-md border p-2 transition-colors duration-200 ${
                over === col.value ? "border-navy bg-navy-soft" : "border-line bg-paper"
              }`}
            >
              <h2 className="flex items-center justify-between px-2 py-1.5 text-sm font-semibold">
                {col.label}
                <span className="rounded-[2px] bg-surface px-2 text-xs text-muted">{items.length}</span>
              </h2>
              <ul className="mt-1 space-y-2">
                {items.map((l) => {
                  const overdue = l.next_action_at && l.next_action_at < new Date().toISOString().slice(0, 10);
                  return (
                    <m.li
                      key={l.id}
                      layoutId={reduce ? undefined : l.id}
                      layout={reduce ? false : "position"}
                      transition={{ type: "spring", stiffness: 520, damping: 42 }}
                      className="rounded-md"
                    >
                    {/* Arrastre nativo (HTML5) en un div interno: motion usa onDragStart para su propio gesto */}
                    <div
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData("text/plain", l.id)}
                      className="cursor-grab rounded-md border border-line bg-surface p-3 transition-shadow hover:active:cursor-grabbing"
                    >
                      <Link href={`/admin/consultas/${l.id}`} className="block font-medium leading-snug hover:text-rose-deep">
                        {l.name}
                      </Link>
                      {(l.company || l.contributor_type) && (
                        <p className="mt-0.5 text-sm text-muted">
                          {l.company ?? CONTRIBUTOR_TYPES[l.contributor_type ?? ""] ?? l.contributor_type}
                        </p>
                      )}
                      {l.next_action && (
                        <p className={`mt-2 text-xs ${overdue ? "font-medium text-danger" : "text-ink/70"}`}>
                          {l.next_action}
                          {l.next_action_at ? ` · ${l.next_action_at.split("-").reverse().slice(0, 2).join("/")}` : ""}
                        </p>
                      )}
                      <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted">
                        <span>{LEAD_SOURCES[l.source]}</span>
                        <span>{ago(l.created_at)}</span>
                      </div>
                      <Select value={l.status} onValueChange={(v) => move(l.id, v as LeadStatus)}>
                        <SelectTrigger size="sm" aria-label={`Estado de ${l.name}`} className="mt-2 h-7 w-full bg-paper text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {LEAD_STATUSES.map((s) => (
                            <SelectItem key={s.value} value={s.value} className="text-xs">
                              {s.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    </m.li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
    </LayoutGroup>
    </LazyMotion>
  );
}
