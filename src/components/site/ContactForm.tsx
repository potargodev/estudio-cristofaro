"use client";

import { useActionState } from "react";
import { submitLead, type LeadFormState } from "@/app/actions/leads";
import { Field, Honeypot, SentMessage, inputClass } from "./form-fields";

const initial: LeadFormState = { ok: false };

export function ContactForm() {
  const [state, action, pending] = useActionState(submitLead, initial);
  const v = state.values;

  if (state.ok) {
    return <SentMessage title="Mensaje enviado" text="Te respondemos en menos de 24 horas hábiles." />;
  }

  return (
    <form action={action} className="relative space-y-5" noValidate>
      <input type="hidden" name="source" value="contacto" />
      <Honeypot />
      <Field label="Nombre y apellido" name="name" error={state.errors?.name}>
        <input id="name" name="name" autoComplete="name" defaultValue={v?.name} className={inputClass} />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Email" name="email" error={state.errors?.email}>
          <input id="email" name="email" type="email" autoComplete="email" defaultValue={v?.email} className={inputClass} />
        </Field>
        <Field label="WhatsApp o teléfono" name="phone">
          <input id="phone" name="phone" type="tel" autoComplete="tel" defaultValue={v?.phone} className={inputClass} />
        </Field>
      </div>
      <Field label="Tu consulta" name="message">
        <textarea id="message" name="message" rows={5} defaultValue={v?.message} className={inputClass} />
      </Field>
      {state.message && !state.ok && (
        <p role="alert" className="text-danger">
          {state.message}
        </p>
      )}
      <button type="submit" disabled={pending} className="rounded-md bg-navy px-6 py-3 font-medium text-paper hover:bg-navy-deep disabled:opacity-60">
        {pending ? "Enviando…" : "Enviar consulta"}
      </button>
    </form>
  );
}
