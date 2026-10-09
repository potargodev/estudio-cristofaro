"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export interface PickerDay {
  date: string;
  label: string;
  slots: { iso: string; label: string }[];
}

/**
 * Elegir día y horario. Deja el horario elegido en un input oculto "start"
 * (ISO): el servidor lo vuelve a validar al confirmar.
 */
export function SlotPicker({ days, error, initial }: { days: PickerDay[]; error?: string; initial?: string }) {
  // `initial`: horario elegido en la home (?inicio=ISO), si sigue libre
  const pre = initial ? days.find((d) => d.slots.some((s) => s.iso === initial)) : undefined;
  const [day, setDay] = useState(pre?.date ?? days[0]?.date ?? "");
  const [start, setStart] = useState(pre ? initial! : "");
  const current = days.find((d) => d.date === day);
  if (days.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-line p-5 text-muted">
        No hay horarios libres en las próximas semanas. Escribinos por WhatsApp y lo coordinamos.
      </p>
    );
  }
  return (
    <fieldset>
      <legend className="text-sm font-medium">Día</legend>
      <div className="-mx-1 mt-2 flex gap-2 overflow-x-auto px-1 pb-2" role="radiogroup" aria-label="Día">
        {days.map((d) => (
          <button
            key={d.date}
            type="button"
            role="radio"
            aria-checked={d.date === day}
            onClick={() => {
              setDay(d.date);
              setStart("");
            }}
            className={cn(
              "shrink-0 rounded-md border px-3 py-2 text-left text-sm transition-colors",
              d.date === day ? "border-navy bg-navy text-paper" : "border-line bg-surface hover:border-navy/40",
            )}
          >
            <span className="block whitespace-nowrap first-letter:uppercase">{d.label}</span>
            <span className={cn("block text-xs", d.date === day ? "text-paper/70" : "text-muted")}>{d.slots.length} horarios</span>
          </button>
        ))}
      </div>
      <p className="mt-4 text-sm font-medium" id="slot-label">
        Horario (hora de Buenos Aires)
      </p>
      <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5" role="radiogroup" aria-labelledby="slot-label">
        {current?.slots.map((sl) => (
          <button
            key={sl.iso}
            type="button"
            role="radio"
            aria-checked={sl.iso === start}
            onClick={() => setStart(sl.iso)}
            className={cn(
              "rounded-md border py-2.5 text-[15px] tabular-nums transition-colors",
              sl.iso === start ? "border-rose-deep bg-rose-soft font-semibold text-rose-deep" : "border-line bg-surface hover:border-navy/40",
            )}
          >
            {sl.label}
          </button>
        ))}
      </div>
      <input type="hidden" name="start" value={start} />
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </fieldset>
  );
}
