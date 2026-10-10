"use client";

import { CalendarClock, Hourglass } from "lucide-react";
import { LayoutGroup, LazyMotion, domMax, m, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useOptimistic, useTransition, useState } from "react";
import { moveLead } from "@/app/admin/actions";
import { daysLabel, leadSourceIcon } from "@/components/admin/kit/leadIcons";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CONTRIBUTOR_TYPES, LEAD_SOURCES, LEAD_STATUSES, type Lead, type LeadStatus } from "@/lib/types";

export type BoardLead = Pick<
  Lead,
  "id" | "name" | "company" | "contributor_type" | "source" | "status" | "created_at" | "next_action" | "next_action_at"
> & { stageDays: number };

const COLUMN_ACCENT: Record<LeadStatus, string> = {
  nuevo: "before:bg-[#1c2235]",
  contactado: "before:bg-[#6b7a99]",
  presupuesto: "before:bg-[#a57c6d]",
  ganado: "before:bg-[#3f7f57]",
  perdido: "before:bg-[#a57c6d]",
};

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
              className={`relative flex min-h-[60vh] flex-col border p-2 pt-3 transition-colors duration-200 before:absolute before:inset-x-0 before:top-0 before:h-0.5 ${COLUMN_ACCENT[col.value]} ${
                over === col.value ? "border-navy bg-navy-soft" : "border-line bg-canvas"
              }`}
            >
              <h2 className="flex items-center justify-between px-2 py-1.5 text-[14px] font-medium text-ink">
                {col.label}
                <span className="tabular rounded-md border border-line bg-surface px-1.5 text-[12px] text-muted">{items.length}</span>
              </h2>
              <ul className="mt-1 space-y-2">
                {items.map((l) => {
                  const overdue = l.next_action_at && l.next_action_at < new Date().toISOString().slice(0, 10);
                  const active = l.status === "nuevo" || l.status === "contactado" || l.status === "presupuesto";
                  const Source = leadSourceIcon(l.source);
                  return (
                    <m.li
                      key={l.id}
                      layoutId={reduce ? undefined : l.id}
                      layout={reduce ? false : "position"}
                      transition={{ type: "spring", stiffness: 520, damping: 42 }}
                      className=""
                    >
                    {/* Arrastre nativo (HTML5) en un div interno: motion usa onDragStart para su propio gesto */}
                    <div
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData("text/plain", l.id)}
                      className="cursor-grab border border-line bg-surface p-3 transition-colors hover:border-muted active:cursor-grabbing"
                    >
                      <Link href={`/admin/consultas/${l.id}`} className="block text-[14px] font-medium leading-snug text-ink underline-offset-4 hover:underline">
                        {l.name}
                      </Link>
                      {(l.company || l.contributor_type) && (
                        <p className="mt-0.5 truncate text-[13px] text-muted">
                          {l.company ?? CONTRIBUTOR_TYPES[l.contributor_type ?? ""] ?? l.contributor_type}
                        </p>
                      )}
                      {l.next_action ? (
                        <p className={`mt-2 flex items-start gap-1.5 text-[12px] ${overdue ? "font-medium text-[#8f2a1c]" : "text-ink/80"}`}>
                          <CalendarClock className="mt-px size-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
                          <span>
                            {l.next_action}
                            {l.next_action_at ? ` · ${l.next_action_at.split("-").reverse().slice(0, 2).join("/")}` : ""}
                            {overdue && " (atrasada)"}
                          </span>
                        </p>
                      ) : (
                        active && <p className="mt-2 text-[12px] text-rose-deep">Sin próxima acción</p>
                      )}
                      <div className="mt-2 flex items-center justify-between gap-2 text-[12px] text-muted">
                        <span className="inline-flex min-w-0 items-center gap-1.5">
                          <Source className="size-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
                          <span className="truncate">{LEAD_SOURCES[l.source]}</span>
                        </span>
                        <span className="tabular inline-flex shrink-0 items-center gap-1" title="Tiempo en esta etapa">
                          <Hourglass className="size-3.5" strokeWidth={1.5} aria-hidden />
                          {daysLabel(l.stageDays)}
                        </span>
                      </div>
                      <Select value={l.status} onValueChange={(v) => move(l.id, v as LeadStatus)}>
                        <SelectTrigger size="sm" aria-label={`Estado de ${l.name}`} className="mt-2.5 h-7 w-full rounded-md bg-canvas text-[12px]">
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
