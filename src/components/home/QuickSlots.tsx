"use client";

import Link from "next/link";
import { useState } from "react";
import type { PickerDay } from "@/components/agenda/SlotPicker";
import { TextLink } from "@/components/web/ui";
import { SCHEDULE_HREF } from "@/lib/site";
import { cn } from "@/lib/utils";

/** Días y horarios libres; cada horario lleva a /agendar con ese horario elegido */
export function QuickSlots({ days }: { days: PickerDay[] }) {
  const [day, setDay] = useState(days[0]?.date ?? "");
  const current = days.find((d) => d.date === day);
  if (days.length === 0)
    return (
      <div className="border border-hair p-8 text-[15px] leading-relaxed text-paper/65">
        No encontramos horarios libres en los próximos días.{" "}
        <TextLink href={SCHEDULE_HREF} className="text-paper">
          Ver la agenda completa
        </TextLink>
      </div>
    );
  return (
    <div className="border border-hair-strong">
      <div role="radiogroup" aria-label="Día" className="grid grid-cols-5 border-b border-hair">
        {days.map((d) => {
          const wd = d.label.split(",")[0];
          return (
            <button
              key={d.date}
              type="button"
              role="radio"
              aria-checked={d.date === day}
              onClick={() => setDay(d.date)}
              className={cn(
                "relative border-r border-hair px-2 py-4 text-left transition-colors duration-300 last:border-r-0 sm:px-4",
                d.date === day ? "bg-paper/[0.04] text-paper" : "text-paper/50 hover:text-paper",
              )}
            >
              <span className="sr-only">{d.label}</span>
              <span aria-hidden className="block text-[12px] first-letter:uppercase">{wd.slice(0, 3)}</span>
              <span aria-hidden className="tabular mt-1 block font-display text-[22px] leading-none">{Number(d.date.slice(8))}</span>
              <span aria-hidden className={cn("absolute inset-x-0 bottom-[-1px] h-px bg-rose-light transition-transform duration-500", d.date === day ? "scale-x-100" : "scale-x-0")} />
            </button>
          );
        })}
      </div>
      <p id="quick-slots" className="px-5 pt-5 text-[12px] text-paper/50">
        Horarios (hora de Buenos Aires)
      </p>
      <ul aria-labelledby="quick-slots" className="grid grid-cols-3 gap-px p-5 sm:grid-cols-4">
        {current?.slots.slice(0, 12).map((s) => (
          <li key={s.iso}>
            <Link
              href={`${SCHEDULE_HREF}?inicio=${encodeURIComponent(s.iso)}`}
              className="tabular block border border-hair py-3 text-center text-[15px] text-paper/85 transition-colors duration-300 hover:border-rose-light hover:text-paper"
            >
              {s.label}
            </Link>
          </li>
        ))}
      </ul>
      <p className="border-t border-hair px-5 py-4 text-[13px] text-paper/50">
        <TextLink href={SCHEDULE_HREF}>Ver más días</TextLink>
      </p>
    </div>
  );
}
