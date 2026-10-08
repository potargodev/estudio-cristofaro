"use client";

import { useActionState, useRef, useState } from "react";
import { submitLead, type LeadFormState } from "@/app/actions/leads";
import { CONTRIBUTOR_TYPES } from "@/lib/types";
import { Field, Honeypot, SentMessage, inputClass } from "./form-fields";

const NEEDS = [
  "Impuestos mensuales",
  "Contabilidad y balances",
  "Sueldos y empleados",
  "Alta en ARCA o monotributo",
  "Armar una sociedad",
  "Cambiar de contador",
  "Ponerme al día con deudas o presentaciones",
  "Una consulta puntual",
];

const EMPLOYEES = ["Ninguno", "1 a 5", "6 a 20", "Más de 20"];

const STEP_TITLES = ["Tu situación", "Tu actividad", "Qué necesitás", "Tus datos"];

const initial: LeadFormState = { ok: false };

export function DiagnosticForm({ defaultType, plan }: { defaultType?: string; plan?: string }) {
  const [state, action, pending] = useActionState(submitLead, initial);
  const [step, setStep] = useState(0);
  const [type, setType] = useState(defaultType && CONTRIBUTOR_TYPES[defaultType] ? defaultType : "");
  const [stepError, setStepError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const v = state.values;

  if (state.ok) {
    return (
      <SentMessage
        title="Listo, recibimos tu diagnóstico"
        text="Un contador del estudio lo revisa y te contacta en menos de 24 horas hábiles con una propuesta para tu caso."
      />
    );
  }

  function next() {
    const form = formRef.current;
    if (!form) return;
    if (step === 0 && !type) {
      setStepError("Elegí una opción para seguir.");
      return;
    }
    if (step === 2 && form.querySelectorAll('input[name="needs"]:checked').length === 0) {
      setStepError("Marcá al menos una opción.");
      return;
    }
    setStepError(null);
    setStep((s) => Math.min(s + 1, STEP_TITLES.length - 1));
  }

  const last = step === STEP_TITLES.length - 1;

  return (
    <form ref={formRef} action={action} className="relative" noValidate>
      <input type="hidden" name="source" value="diagnostico" />
      {plan && <input type="hidden" name="plan" value={plan} />}
      <Honeypot />

      {/* Progreso: es una secuencia real */}
      <ol className="mb-8 grid grid-cols-4 gap-2" aria-label="Pasos del diagnóstico">
        {STEP_TITLES.map((t, i) => (
          <li key={t} aria-current={i === step ? "step" : undefined}>
            <span className={`block h-1 rounded-full ${i <= step ? "bg-navy" : "bg-line"}`} />
            <span className={`mt-2 hidden text-[13px] sm:block ${i === step ? "font-medium text-ink" : "text-muted"}`}>
              {i + 1}. {t}
            </span>
          </li>
        ))}
      </ol>

      <fieldset className={step === 0 ? "block" : "hidden"}>
        <legend className="text-2xl font-semibold tracking-tight">¿Cómo estás inscripto hoy?</legend>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {Object.entries(CONTRIBUTOR_TYPES).map(([value, label]) => (
            <label
              key={value}
              className={`flex cursor-pointer items-center gap-3 rounded-md border px-4 py-3.5 ${
                type === value ? "border-navy bg-navy-soft" : "border-line bg-surface hover:border-navy/50"
              }`}
            >
              <input
                type="radio"
                name="contributor_type"
                value={value}
                checked={type === value}
                onChange={() => setType(value)}
                className="size-4 accent-[var(--color-navy)]"
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className={step === 1 ? "block space-y-5" : "hidden"}>
        <legend className="text-2xl font-semibold tracking-tight">Contanos de tu actividad</legend>
        <Field label="¿A qué te dedicás?" name="activity" hint="Ej: diseño gráfico, comercio de ropa, consultoría.">
          <input id="activity" name="activity" defaultValue={v?.activity} className={inputClass} />
        </Field>
        <Field label="Nombre de la empresa (si tenés)" name="company">
          <input id="company" name="company" defaultValue={v?.company} className={inputClass} />
        </Field>
        <div>
          <p className="text-[15px] font-medium">¿Cuántos empleados tenés?</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {EMPLOYEES.map((e) => (
              <label key={e} className="cursor-pointer">
                <input type="radio" name="employees" value={e} className="peer sr-only" defaultChecked={v?.employees ? v.employees === e : e === "Ninguno"} />
                <span className="inline-block rounded-md border border-line bg-surface px-4 py-2 peer-checked:border-navy peer-checked:bg-navy-soft peer-focus-visible:ring-2 peer-focus-visible:ring-navy">
                  {e}
                </span>
              </label>
            ))}
          </div>
        </div>
      </fieldset>

      <fieldset className={step === 2 ? "block" : "hidden"}>
        <legend className="text-2xl font-semibold tracking-tight">¿Qué necesitás resolver?</legend>
        <p className="mt-2 text-muted">Podés marcar varias.</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {NEEDS.map((n) => (
            <label key={n} className="flex cursor-pointer items-start gap-3 rounded-md border border-line bg-surface px-4 py-3.5 has-[:checked]:border-navy has-[:checked]:bg-navy-soft">
              <input type="checkbox" name="needs" value={n} defaultChecked={v?.needs.includes(n)} className="mt-1 size-4 accent-[var(--color-navy)]" />
              <span>{n}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className={step === 3 ? "block space-y-5" : "hidden"}>
        <legend className="text-2xl font-semibold tracking-tight">¿Cómo te contactamos?</legend>
        <Field label="Nombre y apellido" name="name" error={state.errors?.name}>
          <input id="name" name="name" autoComplete="name" defaultValue={v?.name} className={inputClass} aria-invalid={Boolean(state.errors?.name)} />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Email" name="email" error={state.errors?.email}>
            <input id="email" name="email" type="email" autoComplete="email" defaultValue={v?.email} className={inputClass} aria-invalid={Boolean(state.errors?.email)} />
          </Field>
          <Field label="WhatsApp o teléfono" name="phone">
            <input id="phone" name="phone" type="tel" autoComplete="tel" defaultValue={v?.phone} className={inputClass} />
          </Field>
        </div>
        <Field label="¿Algo más que quieras contarnos?" name="message">
          <textarea id="message" name="message" rows={4} defaultValue={v?.message} className={inputClass} />
        </Field>
      </fieldset>

      {(stepError || (state.message && !state.ok)) && (
        <p role="alert" className="mt-5 text-danger">
          {stepError ?? state.message}
        </p>
      )}

      <div className="mt-8 flex items-center justify-between gap-3">
        {step > 0 ? (
          <button type="button" onClick={() => setStep((s) => s - 1)} className="rounded-md px-4 py-3 font-medium text-muted hover:text-ink">
            Volver
          </button>
        ) : (
          <span />
        )}
        {last ? (
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-navy px-6 py-3 font-medium text-paper hover:bg-navy-deep disabled:opacity-60"
          >
            {pending ? "Enviando…" : "Enviar diagnóstico"}
          </button>
        ) : (
          <button type="button" onClick={next} className="rounded-md bg-navy px-6 py-3 font-medium text-paper hover:bg-navy-deep">
            Seguir
          </button>
        )}
      </div>
    </form>
  );
}
