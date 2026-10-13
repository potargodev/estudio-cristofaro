"use client";

import { KeyRound } from "lucide-react";
import { useActionState } from "react";
import { createTokenAction, createWebhookAction, type SecretState } from "@/app/admin/api-actions";
import { CodeLine } from "@/components/admin/mcp/CreateAccess";
import { Button } from "@/components/ui/button";
import { fieldClass } from "@/components/ds/primitives";
import { cn } from "@/lib/utils";

// Formularios que muestran el token o el secreto una sola vez (§2.p, B9)

function Shown({ state, what }: { state: SecretState; what: string }) {
  return (
    <div className="grid gap-3 [&>*]:min-w-0" role="status">
      <p className="flex items-center gap-2 text-body font-medium text-ink">
        <KeyRound className="size-4 text-rose-deep" aria-hidden /> {state.message} Copiá {what} ahora: no se vuelve a mostrar.
      </p>
      <CodeLine text={state.secret!} />
      <Button type="button" variant="outline" className="w-fit" onClick={() => window.location.reload()}>
        Listo, ya lo guardé
      </Button>
    </div>
  );
}

export function TokenForm({ scopes, orgs }: { scopes: Record<string, string>; orgs: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<SecretState, FormData>(createTokenAction, { ok: false });
  if (state.ok && state.secret) return <Shown state={state} what="el token" />;
  return (
    <form action={action} className="grid gap-4">
      <label className="text-meta text-muted">
        Nombre
        <input name="name" required maxLength={80} placeholder="Ej.: Tienda propia" className={cn(fieldClass, "mt-1 max-w-md")} />
      </label>
      <label className="text-meta text-muted">
        Organización
        <select name="org" defaultValue="" className={cn(fieldClass, "mt-1 max-w-md")}>
          <option value="">Todas las organizaciones</option>
          {orgs.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="grid gap-2">
        <legend className="text-meta text-muted">Permisos</legend>
        {Object.entries(scopes).map(([k, l]) => (
          <label key={k} className="flex items-start gap-2 text-ui">
            <input type="checkbox" name="scopes" value={k} defaultChecked={k.endsWith(":leer")} className="mt-0.5 size-4 accent-navy" />
            <span>
              <span className="num">{k}</span> · {l}
            </span>
          </label>
        ))}
      </fieldset>
      {state.message && (
        <p role="alert" className="text-ui text-danger">
          {state.message}
        </p>
      )}
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Creando…" : "Crear el token"}
      </Button>
    </form>
  );
}

export function WebhookForm({ events }: { events: Record<string, string> }) {
  const [state, action, pending] = useActionState<SecretState, FormData>(createWebhookAction, { ok: false });
  if (state.ok && state.secret) return <Shown state={state} what="el secreto para verificar las firmas" />;
  return (
    <form action={action} className="grid gap-4">
      <label className="text-meta text-muted">
        URL que recibe los eventos
        <input name="url" type="url" required placeholder="https://tu-sistema.com/faro/webhook" className={cn(fieldClass, "mt-1 max-w-xl")} />
      </label>
      <fieldset className="grid gap-2">
        <legend className="text-meta text-muted">Eventos</legend>
        {Object.entries(events).map(([k, l]) => (
          <label key={k} className="flex items-start gap-2 text-ui">
            <input type="checkbox" name="events" value={k} defaultChecked={k === "factura.emitida"} className="mt-0.5 size-4 accent-navy" />
            <span>
              <span className="num">{k}</span> · {l}
            </span>
          </label>
        ))}
      </fieldset>
      {state.message && (
        <p role="alert" className="text-ui text-danger">
          {state.message}
        </p>
      )}
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Creando…" : "Agregar el webhook"}
      </Button>
    </form>
  );
}
