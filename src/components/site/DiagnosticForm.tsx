"use client";

import { animate, m, useReducedMotion } from "motion/react";
import { useActionState, useEffect, useRef, useState } from "react";
import { submitLead, type LeadFormState } from "@/app/actions/leads";
import { Button } from "@/components/ui/button";
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
  const stepRefs = useRef<(HTMLFieldSetElement | null)[]>([]);
  const direction = useRef(1);
  const mounted = useRef(false);
  const reduce = useReducedMotion();
  const v = state.values;

  // Transición deslizante: el paso nuevo entra desde el lado hacia el que se avanza.
  // Los cuatro pasos quedan siempre montados para no perder lo que se cargó.
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const el = stepRefs.current[step];
    if (!el) return;
    el.querySelector<HTMLElement>("legend")?.focus({ preventScroll: true });
    if (reduce) return;
    const controls = animate(
      el,
      { opacity: [0, 1], x: [direction.current * 32, 0] },
      { duration: 0.38, ease: [0.22, 1, 0.36, 1] },
    );
    return () => controls.stop();
  }, [step, reduce]);

  function goTo(next: number) {
    direction.current = next > step ? 1 : -1;
    setStep(next);
  }

  if (state.ok) {
    return (
      <SentMessage
        title="Listo, recibimos tu diagnóstico"
        text="Un contador del estudio lo revisa y te contacta en menos de 24 horas hábiles con una propuesta para tu caso."
      >
        <p className="mt-4">
          <a href="/agendar" className="inline-flex h-11 items-center rounded-[2px] bg-rose-light px-5 text-[15px] font-medium text-night hover:bg-paper">
            ¿Preferís hablar ya? Agendá una llamada
          </a>
        </p>
      </SentMessage>
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
    goTo(Math.min(step + 1, STEP_TITLES.length - 1));
  }

  const last = step === STEP_TITLES.length - 1;

  return (
    <form ref={formRef} action={action} className="relative -mx-1 overflow-x-clip px-1" noValidate>
      <input type="hidden" name="source" value="diagnostico" />
      {plan && <input type="hidden" name="plan" value={plan} />}
      <Honeypot />

      {/* Progreso: es una secuencia real */}
      <ol className="mb-8 grid grid-cols-4 gap-2" aria-label="Pasos del diagnóstico">
        {STEP_TITLES.map((t, i) => (
          <li key={t} aria-current={i === step ? "step" : undefined}>
            <span className="block h-px overflow-hidden bg-line">
              <m.span
                className="block h-full origin-left bg-rose-light"
                initial={false}
                animate={{ scaleX: i <= step ? 1 : 0 }}
                transition={{ duration: reduce ? 0 : 0.5, ease: [0.22, 1, 0.36, 1] }}
              />
            </span>
            <span className={`mt-2 hidden text-[13px] sm:block ${i === step ? "font-medium text-ink" : "text-muted"}`}>
              {i + 1}. {t}
            </span>
          </li>
        ))}
      </ol>

      <fieldset ref={(el) => { stepRefs.current[0] = el; }} className={step === 0 ? "block" : "hidden"}>
        <legend tabIndex={-1} className="font-display text-3xl outline-none">¿Cómo estás inscripto hoy?</legend>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {Object.entries(CONTRIBUTOR_TYPES).map(([value, label]) => (
            <label
              key={value}
              className={`flex cursor-pointer items-center gap-3 border px-4 py-3.5 ${
                type === value ? "border-rose-light bg-rose-soft" : "border-line bg-surface hover:border-paper/40"
              }`}
            >
              <input
                type="radio"
                name="contributor_type"
                value={value}
                checked={type === value}
                onChange={() => setType(value)}
                className="size-4 accent-[var(--color-rose-light)]"
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset ref={(el) => { stepRefs.current[1] = el; }} className={step === 1 ? "block space-y-5" : "hidden"}>
        <legend tabIndex={-1} className="font-display text-3xl outline-none">Contanos de tu actividad</legend>
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
                <span className="inline-block border border-line bg-surface px-4 py-2 peer-checked:border-rose-light peer-checked:bg-rose-soft peer-focus-visible:outline peer-focus-visible:outline-1 peer-focus-visible:outline-rose-light">
                  {e}
                </span>
              </label>
            ))}
          </div>
        </div>
      </fieldset>

      <fieldset ref={(el) => { stepRefs.current[2] = el; }} className={step === 2 ? "block" : "hidden"}>
        <legend tabIndex={-1} className="font-display text-3xl outline-none">¿Qué necesitás resolver?</legend>
        <p className="mt-2 text-muted">Podés marcar varias.</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {NEEDS.map((n) => (
            <label key={n} className="flex cursor-pointer items-start gap-3 border border-line bg-surface px-4 py-3.5 has-[:checked]:border-rose-light has-[:checked]:bg-rose-soft">
              <input type="checkbox" name="needs" value={n} defaultChecked={v?.needs.includes(n)} className="mt-1 size-4 accent-[var(--color-rose-light)]" />
              <span>{n}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset ref={(el) => { stepRefs.current[3] = el; }} className={step === 3 ? "block space-y-5" : "hidden"}>
        <legend tabIndex={-1} className="font-display text-3xl outline-none">¿Cómo te contactamos?</legend>
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
          <Button type="button" variant="ghost" size="xl" onClick={() => goTo(step - 1)} className="text-muted hover:text-ink">
            Volver
          </Button>
        ) : (
          <span />
        )}
        {/* Keys distintas: si React reusara el mismo <button> y le cambiara el type a
            "submit" durante el clic en "Seguir", el navegador enviaría el formulario. */}
        {last ? (
          <Button key="enviar" type="submit" size="xl" disabled={pending} className="px-6">
            {pending ? "Enviando…" : "Enviar diagnóstico"}
          </Button>
        ) : (
          <Button key="seguir" type="button" size="xl" onClick={next} className="px-6">
            Seguir
          </Button>
        )}
      </div>
    </form>
  );
}
