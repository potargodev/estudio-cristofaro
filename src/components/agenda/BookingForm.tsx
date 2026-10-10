"use client";

import { useActionState } from "react";
import { bookCall, type BookingState } from "@/app/actions/agenda";
import { Field, Honeypot, inputClass } from "@/components/site/form-fields";
import { Button } from "@/components/ui/button";
import { SlotPicker, type PickerDay } from "./SlotPicker";

/** Formulario de /agendar: horario + datos de contacto */
export function BookingForm({ days, initial }: { days: PickerDay[]; initial?: string }) {
  const [state, action, pending] = useActionState<BookingState, FormData>(bookCall, { ok: false });
  const e = state.errors ?? {};
  return (
    <form action={action} className="relative grid gap-8">
      <Honeypot />
      <section className="border-t border-line pt-8">
        <h2 className="mb-6 flex items-baseline gap-4 font-display text-3xl"><span className="tabular text-[13px] font-sans text-rose-deep">01</span>Elegí día y horario</h2>
        <SlotPicker days={days} error={e.start} initial={initial} />
      </section>
      <section className="border-t border-line pt-8">
        <h2 className="mb-6 flex items-baseline gap-4 font-display text-3xl"><span className="tabular text-[13px] font-sans text-rose-deep">02</span>Tus datos</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre y apellido" name="name" error={e.name}>
            <input id="name" name="name" required autoComplete="name" className={inputClass} />
          </Field>
          <Field label="Email" name="email" error={e.email} hint="Ahí te llega la confirmación con el link de la videollamada.">
            <input id="email" name="email" type="email" required autoComplete="email" className={inputClass} />
          </Field>
          <Field label="Teléfono (opcional)" name="phone">
            <input id="phone" name="phone" type="tel" autoComplete="tel" className={inputClass} />
          </Field>
          <Field label="Empresa (opcional)" name="company">
            <input id="company" name="company" autoComplete="organization" className={inputClass} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="¿De qué querés hablar?" name="reason">
              <textarea id="reason" name="reason" rows={3} maxLength={500} className={inputClass} />
            </Field>
          </div>
        </div>
      </section>
      {state.message && !state.ok && (
        <p role="alert" className="text-danger">
          {state.message}
        </p>
      )}
      <div>
        <Button type="submit" size="xl" disabled={pending || days.length === 0}>
          {pending ? "Agendando…" : "Confirmar llamada"}
        </Button>
        <p className="mt-3 text-sm text-muted">
          Al confirmar aceptás que usemos tus datos para coordinar la llamada (ver{" "}
          <a href="/privacidad" className="underline">
            privacidad
          </a>
          ).
        </p>
      </div>
    </form>
  );
}
