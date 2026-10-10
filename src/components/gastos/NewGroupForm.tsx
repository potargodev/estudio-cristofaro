"use client";

import { useActionState, useState } from "react";
import { createGroupAction, type FormState } from "@/app/gastos/actions";
import { CURRENCIES, GROUP_COLORS, GROUP_TYPES } from "@/modules/gastos/constants";
import { cn } from "@/lib/utils";

const field = "h-12 w-full border border-line bg-surface px-3 text-[16px] focus:border-navy focus:outline-none";

export function NewGroupForm({ contexts }: { contexts: { value: string; label: string }[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createGroupAction, {});
  const [type, setType] = useState("viaje");
  const [color, setColor] = useState<string>(GROUP_COLORS[0]);
  return (
    <form action={action} className="grid gap-6">
      <label className="grid gap-2">
        <span className="text-[14px] font-medium">Nombre del grupo</span>
        <input name="name" required minLength={2} maxLength={80} placeholder="Ej.: Viaje a Mendoza" className={field} autoFocus />
      </label>

      <fieldset className="grid gap-2">
        <legend className="mb-2 text-[14px] font-medium">Tipo</legend>
        <div className="flex flex-wrap gap-2">
          {Object.entries(GROUP_TYPES).map(([k, label]) => (
            <label key={k} className={cn("cursor-pointer border px-4 py-2 text-[14px] transition-colors", type === k ? "border-navy bg-navy text-paper" : "border-line bg-surface hover:border-navy/50")}>
              <input type="radio" name="type" value={k} checked={type === k} onChange={() => setType(k)} className="sr-only" />
              {label}
            </label>
          ))}
        </div>
        {type === "socios" && <p className="text-[13px] text-muted">En los grupos de socios además registrás aportes y retiros, con el saldo de cada socio.</p>}
      </fieldset>

      <div className="grid gap-6 sm:grid-cols-2">
        <label className="grid gap-2">
          <span className="text-[14px] font-medium">Moneda base</span>
          <select name="currency" defaultValue="ARS" className={field}>
            {CURRENCIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <fieldset>
          <legend className="mb-2 text-[14px] font-medium">Color</legend>
          <div className="flex gap-2">
            {GROUP_COLORS.map((c) => (
              <label key={c} className={cn("size-10 cursor-pointer rounded-full ring-offset-2 ring-offset-paper", color === c && "ring-2 ring-navy")} style={{ background: c }}>
                <input type="radio" name="color" value={c} checked={color === c} onChange={() => setColor(c)} className="sr-only" aria-label={`Color ${c}`} />
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      {contexts.length > 0 && (
        <label className="grid gap-2">
          <span className="text-[14px] font-medium">Conectar con la contabilidad (opcional)</span>
          <select name="context" defaultValue="" className={field}>
            <option value="">No, es un grupo personal</option>
            {contexts.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <span className="text-[13px] text-muted">Los gastos que marques &quot;de la empresa&quot; o &quot;deducible&quot; van a los gastos de esa contabilidad, con su comprobante.</span>
        </label>
      )}

      <label className="flex items-start gap-3">
        <input type="checkbox" name="simplify" defaultChecked className="mt-1 size-4 accent-navy" />
        <span>
          <span className="block text-[14px] font-medium">Simplificar deudas</span>
          <span className="block text-[13px] text-muted">Calcula la menor cantidad de transferencias para quedar a mano. Lo podés cambiar después.</span>
        </span>
      </label>

      {state.message && (
        <p role="alert" className="text-[14px] text-danger">
          {state.message}
        </p>
      )}
      <button type="submit" disabled={pending} className="h-12 bg-navy px-6 text-[16px] text-paper hover:bg-navy-deep disabled:opacity-60 sm:justify-self-start">
        {pending ? "Creando…" : "Crear grupo"}
      </button>
    </form>
  );
}
