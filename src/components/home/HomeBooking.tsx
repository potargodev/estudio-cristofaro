"use client";

import { CalendarPlus, Check, Video } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";
import { bookCall, type BookingState } from "@/app/actions/agenda";
import type { PickerDay } from "@/components/agenda/SlotPicker";
import { TextLink } from "@/components/web/ui";
import { SCHEDULE_HREF } from "@/lib/site";
import { cn } from "@/lib/utils";

const field = "mt-1.5 h-12 w-full border border-hair-strong bg-paper/[0.04] px-3.5 text-lead text-paper placeholder:text-paper/60 focus:border-rose-light focus:outline-none";

/**
 * Agenda real dentro de la home: días con horarios libres (la misma agenda de
 * /agendar, conectada a Google Calendar), horarios del día, datos mínimos y la
 * confirmación con el link de Google Meet, sin salir de la página.
 */
export function HomeBooking({ days }: { days: PickerDay[] }) {
  const [day, setDay] = useState(days[0]?.date ?? "");
  const [start, setStart] = useState("");
  const [state, action, pending] = useActionState<BookingState, FormData>(bookCall, { ok: false });
  const current = days.find((d) => d.date === day);
  const e = state.errors ?? {};

  if (state.ok && state.booking)
    return (
      <div role="status" className="border border-hair-strong p-6 sm:p-8">
        <p className="flex items-center gap-2 text-meta text-rose-light">
          <Check className="size-4" aria-hidden /> Llamada confirmada
        </p>
        <p className="mt-4 text-headline leading-snug text-paper first-letter:uppercase">
          {state.booking.when} a {state.booking.until}
        </p>
        <p className="mt-1 text-ui text-paper/60">Hora de Buenos Aires. Te mandamos la confirmación a {state.booking.email}.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          {state.booking.meetUrl && (
            <a href={state.booking.meetUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-12 items-center gap-2 bg-rose-light px-5 text-night transition-colors hover:bg-paper">
              <Video className="size-5" aria-hidden /> Link de Google Meet
            </a>
          )}
          <a href={state.booking.ics} className="inline-flex h-12 items-center gap-2 border border-hair-strong px-5 text-paper transition-colors hover:border-paper/60">
            <CalendarPlus className="size-5" aria-hidden /> Agregar a mi calendario
          </a>
        </div>
        {!state.booking.meetUrl && <p className="mt-3 text-meta text-paper/55">El link de la videollamada te llega por mail antes de la reunión.</p>}
        <p className="mt-6 text-meta text-paper/55">
          ¿Necesitás cambiarla?{" "}
          <Link href={state.booking.manage} className="text-paper underline underline-offset-4">
            Reprogramá o cancelá
          </Link>
          .
        </p>
      </div>
    );

  if (days.length === 0)
    return (
      <div className="border border-hair p-8 text-body leading-relaxed text-paper/65">
        No encontramos horarios libres en los próximos días. Escribinos por WhatsApp y lo coordinamos.
      </div>
    );

  return (
    <form action={action} className="relative border border-hair-strong">
      <input type="hidden" name="inline" value="1" />
      <input type="hidden" name="start" value={start} />
      <div aria-hidden className="absolute -left-[9999px]">
        <label>
          No completar
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      {/* 1. Día */}
      <fieldset className="min-w-0 border-b border-hair">
        <legend className="sr-only">Día</legend>
        <div role="radiogroup" aria-label="Día" className="flex snap-x overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {days.map((d) => {
            const wd = d.label.split(",")[0];
            const on = d.date === day;
            return (
              <button
                key={d.date}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => {
                  setDay(d.date);
                  setStart("");
                }}
                className={cn("relative min-w-[4.5rem] flex-1 shrink-0 snap-start border-r border-hair px-3 py-4 text-left transition-colors duration-300 last:border-r-0 motion-reduce:transition-none", on ? "bg-paper/[0.05] text-paper" : "text-paper/55 hover:text-paper")}
              >
                <span className="sr-only">{d.label}</span>
                <span aria-hidden className="block text-caption first-letter:uppercase">{wd.slice(0, 3)}</span>
                <span aria-hidden className="tabular mt-1 block text-headline font-medium leading-none">{Number(d.date.slice(8))}</span>
                <span aria-hidden className="mt-1 block text-micro text-paper/60">{d.slots.length} horarios</span>
                <span aria-hidden className={cn("absolute inset-x-0 bottom-[-1px] h-px bg-rose-light transition-transform duration-500 motion-reduce:transition-none", on ? "scale-x-100" : "scale-x-0")} />
              </button>
            );
          })}
        </div>
      </fieldset>
      {/* 2. Horario */}
      <div className="px-5 pt-5">
        <p id="home-slots" className="text-caption text-paper/55">
          Horarios del {current?.label ?? "día"} (hora de Buenos Aires)
        </p>
        <div role="radiogroup" aria-labelledby="home-slots" className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {current?.slots.map((sl) => (
            <button
              key={sl.iso}
              type="button"
              role="radio"
              aria-checked={start === sl.iso}
              onClick={() => setStart(sl.iso)}
              className={cn("tabular border py-3 text-center text-body transition-colors duration-300 motion-reduce:transition-none", start === sl.iso ? "border-rose-light bg-rose-light text-night" : "border-hair text-paper/85 hover:border-rose-light hover:text-paper")}
            >
              {sl.label}
            </button>
          ))}
        </div>
        {e.start && (
          <p role="alert" className="mt-2 text-ui text-[#f3c4ba]">
            {e.start}
          </p>
        )}
      </div>
      {/* 3. Datos */}
      <div className={cn("grid gap-4 px-5 pb-5 pt-6 sm:grid-cols-2", !start && "opacity-60")}>
        <label className="block text-meta text-paper/70">
          Nombre y apellido
          <input name="name" required autoComplete="name" className={field} />
          {e.name && <span className="mt-1 block text-meta text-[#f3c4ba]">{e.name}</span>}
        </label>
        <label className="block text-meta text-paper/70">
          Email
          <input name="email" type="email" required autoComplete="email" className={field} />
          {e.email && <span className="mt-1 block text-meta text-[#f3c4ba]">{e.email}</span>}
        </label>
        <label className="block text-meta text-paper/70">
          Empresa
          <input name="company" autoComplete="organization" className={field} />
        </label>
        <label className="block text-meta text-paper/70">
          Teléfono (opcional)
          <input name="phone" type="tel" autoComplete="tel" className={field} />
        </label>
      </div>
      {state.message && !state.ok && (
        <p role="alert" className="px-5 text-ui text-[#f3c4ba]">
          {state.message}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-hair px-5 py-4">
        <p className="text-caption text-paper/60">
          Al confirmar aceptás que usemos tus datos para coordinar la llamada (
          <Link href="/privacidad" className="underline">
            privacidad
          </Link>
          ).
        </p>
        <button type="submit" disabled={pending || !start} className="inline-flex h-12 items-center bg-rose-light px-6 text-body font-medium text-night transition-colors hover:bg-paper disabled:opacity-50">
          {pending ? "Agendando…" : start ? "Confirmar llamada" : "Elegí un horario"}
        </button>
      </div>
      <p className="border-t border-hair px-5 py-3 text-meta text-paper/55">
        <TextLink href={SCHEDULE_HREF}>Ver más días</TextLink>
      </p>
    </form>
  );
}
