"use client";

import { useActionState } from "react";
import { requestDemo, type DemoState } from "@/app/faro/demo/actions";

const field = "mt-1.5 h-11 w-full rounded-[2px] border border-hair-strong bg-night px-3 text-[15px] text-paper placeholder:text-paper/35 focus:border-gold focus:outline-none";
const label = "text-[13px] text-paper/70";

export function DemoForm() {
  const [state, action, pending] = useActionState<DemoState, FormData>(requestDemo, { ok: false });
  if (state.ok)
    return (
      <p role="status" className="border border-gold/40 bg-gold/10 px-4 py-4 text-[15px] text-paper">
        {state.message}
      </p>
    );
  return (
    <form action={action} className="grid gap-4">
      <div aria-hidden className="absolute -left-[9999px]">
        <input name="empresa_web" tabIndex={-1} autoComplete="off" />
      </div>
      <label className={label}>
        Tu nombre
        <input name="name" required maxLength={120} autoComplete="name" className={field} />
      </label>
      <label className={label}>
        Email
        <input name="email" type="email" required autoComplete="email" className={field} />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={label}>
          Sos
          <select name="kind" className={field} defaultValue="estudio">
            <option value="estudio">Un estudio contable</option>
            <option value="contador">Contador independiente</option>
            <option value="empresa">Una empresa</option>
            <option value="otro">Otro</option>
          </select>
        </label>
        <label className={label}>
          Clientes o personas (aprox.)
          <input name="size" maxLength={40} placeholder="Ej.: 60 clientes" className={field} />
        </label>
      </div>
      <label className={label}>
        ¿Qué te gustaría ver?
        <textarea name="message" rows={3} maxLength={1500} className={`${field} h-auto py-2`} />
      </label>
      {state.message && (
        <p role="alert" className="text-[14px] text-[#f0a493]">
          {state.message}
        </p>
      )}
      <button type="submit" disabled={pending} className="h-12 rounded-[2px] bg-gold px-6 text-[15px] font-medium text-night transition-colors duration-300 hover:bg-paper disabled:opacity-60">
        {pending ? "Enviando…" : "Agendar una demo"}
      </button>
    </form>
  );
}
