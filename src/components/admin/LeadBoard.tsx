"use client";

import Link from "next/link";
import { useOptimistic, useTransition, useState } from "react";
import { moveLead } from "@/app/admin/actions";
import { CONTRIBUTOR_TYPES, LEAD_SOURCES, LEAD_STATUSES, type Lead, type LeadStatus } from "@/lib/types";

type BoardLead = Pick<
  Lead,
  "id" | "name" | "company" | "contributor_type" | "source" | "status" | "created_at" | "next_action" | "next_action_at"
>;

function ago(iso: string) {
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

  function move(id: string, status: LeadStatus) {
    startTransition(async () => {
      setOptimistic({ id, status });
      await moveLead(id, status);
    });
  }

  return (
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
              className={`flex min-h-[60vh] flex-col rounded-md border p-2 ${
                over === col.value ? "border-navy bg-navy-soft" : "border-line bg-paper"
              }`}
            >
              <h2 className="flex items-center justify-between px-2 py-1.5 text-sm font-semibold">
                {col.label}
                <span className="rounded-full bg-surface px-2 text-xs text-muted">{items.length}</span>
              </h2>
              <ul className="mt-1 space-y-2">
                {items.map((l) => {
                  const overdue = l.next_action_at && l.next_action_at < new Date().toISOString().slice(0, 10);
                  return (
                    <li
                      key={l.id}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData("text/plain", l.id)}
                      className="cursor-grab rounded-md border border-line bg-surface p-3 shadow-sm active:cursor-grabbing"
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
                      <label className="sr-only" htmlFor={`mv-${l.id}`}>
                        Mover a
                      </label>
                      <select
                        id={`mv-${l.id}`}
                        value={l.status}
                        onChange={(e) => move(l.id, e.target.value as LeadStatus)}
                        className="mt-2 w-full rounded border border-line bg-paper px-2 py-1 text-xs"
                      >
                        {LEAD_STATUSES.map((s) => (
                          <option key={s.value} value={s.value}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
