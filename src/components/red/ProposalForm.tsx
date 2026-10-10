"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestProposalAction, type ProposalState } from "@/app/red/actions";

const field = "mt-1 h-10 w-full rounded-md border border-line bg-canvas px-3 text-[14px] text-ink focus:border-navy focus:outline-none";

export function ProposalForm({ studio, name, email }: { studio: string; name: string; email: string }) {
  const [state, action, pending] = useActionState<ProposalState, FormData>(requestProposalAction, { ok: false });
  if (state.ok)
    return (
      <p role="status" className="mt-4 rounded-md border border-line bg-navy-soft px-3 py-3 text-[14px]">
        {state.message}
      </p>
    );
  return (
    <form key={state.message ?? "form"} action={action} className="mt-4 grid gap-3 text-[13px] text-muted">
      <input type="hidden" name="studio" value={studio} />
      <div aria-hidden className="absolute -left-[9999px]">
        <input name="empresa_web" tabIndex={-1} autoComplete="off" />
      </div>
      <label>
        Tu nombre
        <input name="name" defaultValue={state.values?.name ?? name} required maxLength={120} autoComplete="name" className={field} />
      </label>
      <label>
        Email
        <input name="email" type="email" defaultValue={state.values?.email ?? email} required autoComplete="email" className={field} />
      </label>
      <label>
        Teléfono (opcional)
        <input name="phone" type="tel" defaultValue={state.values?.phone} maxLength={40} autoComplete="tel" className={field} />
      </label>
      <label>
        ¿Qué sos?
        <select name="profile" className={field} defaultValue={state.values?.profile ?? ""}>
          <option value="">Elegí</option>
          <option value="monotributista">Monotributista</option>
          <option value="responsable_inscripto">Responsable inscripto</option>
          <option value="sociedad">Una sociedad</option>
          <option value="empleador">Empleador</option>
          <option value="relacion_dependencia">En relación de dependencia</option>
          <option value="otro">Otro</option>
        </select>
      </label>
      <label>
        ¿Qué necesitás?
        <textarea name="message" defaultValue={state.values?.message} rows={4} maxLength={2000} className={`${field} h-auto py-2`} />
      </label>
      <label className="flex items-start gap-2 text-[13px]">
        <input type="checkbox" name="consent" required defaultChecked={state.values?.consent === "on"} className="mt-0.5 size-4 accent-navy" />
        <span>
          Acepto compartir estos datos con el estudio para que me haga una propuesta. Lo puedo revocar cuando quiera (
          <Link href="/legal/red-de-estudios" className="underline underline-offset-4">
            condiciones de la Red
          </Link>
          ).
        </span>
      </label>
      {state.message && (
        <p role="alert" className="text-[14px] text-danger">
          {state.message}
        </p>
      )}
      <button type="submit" disabled={pending} className="h-11 rounded-md bg-navy px-5 text-[15px] font-medium text-paper hover:bg-night disabled:opacity-60">
        {pending ? "Enviando…" : "Pedir propuesta"}
      </button>
    </form>
  );
}
