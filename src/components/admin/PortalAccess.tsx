"use client";

import { Check, Copy, KeyRound } from "lucide-react";
import { useActionState, useState } from "react";
import { inviteClientUser, resetClientPassword, type CredentialsState } from "@/app/admin/portal-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initial: CredentialsState = { ok: false };

/** Muestra las credenciales una sola vez (no quedan guardadas en ningún lado visible). */
function Credentials({ email, password }: { email: string; password: string }) {
  const [copied, setCopied] = useState(false);
  const text = `Portal de clientes: ${window.location.origin}/portal/login\nUsuario: ${email}\nContraseña: ${password}`;
  return (
    <div role="status" className="mt-4 rounded-md border border-rose/40 bg-rose-soft/50 p-4">
      <p className="text-sm font-semibold">Pasale estos datos al cliente. La contraseña no se vuelve a mostrar.</p>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[15px]">
        <dt className="text-muted">Usuario</dt>
        <dd className="font-medium">{email}</dd>
        <dt className="text-muted">Contraseña</dt>
        <dd className="font-mono text-base font-semibold tracking-wide">{password}</dd>
      </dl>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-3"
        onClick={async () => {
          await navigator.clipboard.writeText(text);
          setCopied(true);
        }}
      >
        {copied ? <Check /> : <Copy />}
        {copied ? "Copiado" : "Copiar acceso"}
      </Button>
    </div>
  );
}

export function InviteClientForm({ clientId, defaultName, defaultEmail }: { clientId: string; defaultName: string; defaultEmail: string }) {
  const [state, action, pending] = useActionState(inviteClientUser, initial);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="client_id" value={clientId} />
      <div>
        <Label htmlFor="invite-name" className="mb-1 text-sm">
          Nombre
        </Label>
        <Input id="invite-name" name="name" defaultValue={defaultName} className="bg-surface" />
      </div>
      <div>
        <Label htmlFor="invite-email" className="mb-1 text-sm">
          Email del cliente
        </Label>
        <Input id="invite-email" name="email" type="email" required defaultValue={defaultEmail} className="bg-surface" />
      </div>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending} className="h-9 px-4 text-[15px]">
          {pending ? "Creando…" : "Invitar al portal"}
        </Button>
        {state.message && !state.ok && (
          <p role="alert" className="mt-2 text-sm text-danger">
            {state.message}
          </p>
        )}
        {state.ok && state.email && state.password && <Credentials email={state.email} password={state.password} />}
      </div>
    </form>
  );
}

export function ResetPasswordButton({ clientId, userId }: { clientId: string; userId: string }) {
  const [state, action, pending] = useActionState(resetClientPassword, initial);
  return (
    <form action={action}>
      <input type="hidden" name="client_id" value={clientId} />
      <input type="hidden" name="user_id" value={userId} />
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        <KeyRound />
        {pending ? "Generando…" : "Nueva contraseña"}
      </Button>
      {state.message && !state.ok && <p className="mt-2 text-sm text-danger">{state.message}</p>}
      {state.ok && state.email && state.password && <Credentials email={state.email} password={state.password} />}
    </form>
  );
}
