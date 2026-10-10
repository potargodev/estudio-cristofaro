"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { createTenantAction, type CreateTenantState } from "@/app/faro-manager/actions";
import { AdminField } from "@/components/admin/AdminField";
import { CodeLine } from "@/components/admin/mcp/CreateAccess";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { plansFor, type TenantKind } from "@/lib/faro/plans";

export function CreateTenantForm() {
  const [state, action, pending] = useActionState<CreateTenantState, FormData>(createTenantAction, { ok: false });
  const [kind, setKind] = useState<TenantKind>("studio");
  if (state.ok && state.password) {
    return (
      <div className="grid max-w-xl gap-3 [&>*]:min-w-0" role="status">
        <p className="text-[15px] font-medium text-ink">Listo. Le mandamos el acceso a {state.email} (si el SMTP está configurado). Contraseña temporal, por si hay que dictarla:</p>
        <CodeLine text={state.password} />
        <p className="text-[13px] text-muted">Se muestra una sola vez. Al entrar se le pide cambiarla{kind === "studio" ? " y activar el segundo factor" : ""}.</p>
        <Link href={`/faro-manager/${state.studioId}`} className="text-[14px] font-medium underline underline-offset-4">
          Ver el tenant
        </Link>
      </div>
    );
  }
  return (
    <form action={action} className="grid max-w-2xl gap-4 sm:grid-cols-2">
      <fieldset className="sm:col-span-2">
        <legend className="text-sm font-medium text-ink/80">Tipo</legend>
        <div className="mt-2 flex gap-4 text-[15px]">
          {(
            [
              ["studio", "Estudio contable o contador"],
              ["personal", "Autónomo (Faro Personal)"],
              ["persona", "Persona (Bitácora)"],
            ] as const
          ).map(([k, label]) => (
            <label key={k} className="flex items-center gap-2">
              <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="accent-[#1c2235]" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <AdminField label={kind === "studio" ? "Nombre del estudio" : "Nombre y apellido o fantasía"} htmlFor="t-name">
        <Input id="t-name" name="name" required className="mt-1" />
      </AdminField>
      <AdminField label="Plan" htmlFor="t-plan">
        <select key={kind} id="t-plan" name="plan" className="mt-1 h-9 w-full border border-line bg-surface px-2 text-[15px]">
          {plansFor(kind).map((p) => (
            <option key={p.key} value={p.key}>
              {p.name}
            </option>
          ))}
        </select>
      </AdminField>
      <AdminField label={kind === "studio" ? "CUIT del estudio (opcional)" : "CUIT"} htmlFor="t-cuit">
        <Input id="t-cuit" name="cuit" inputMode="numeric" required={kind === "personal"} className="mt-1" />
      </AdminField>
      <span className="hidden sm:block" />
      <AdminField label="Dueño: nombre" htmlFor="t-on">
        <Input id="t-on" name="owner_name" required className="mt-1" />
      </AdminField>
      <AdminField label="Dueño: email" htmlFor="t-oe">
        <Input id="t-oe" name="owner_email" type="email" required className="mt-1" />
      </AdminField>
      {state.message && (
        <p role="alert" className="text-[14px] text-danger sm:col-span-2">
          {state.message}
        </p>
      )}
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending} className="h-9 px-4">
          {pending ? "Creando…" : "Crear y generar contraseña temporal"}
        </Button>
      </div>
    </form>
  );
}
