"use client";

import { useActionState } from "react";
import { Monogram } from "@/components/site/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { changeTemporaryPassword, type ChangeState } from "./actions";

export function ChangePasswordForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState(changeTemporaryPassword, { ok: false } as ChangeState);
  const field = "mt-1 h-11 bg-surface text-base";
  return (
    <div className="grid min-h-dvh place-items-center bg-navy-deep px-4">
      <form action={action} className="w-full max-w-sm border-t border-rose-light bg-canvas p-7">
        <div className="mb-5 flex items-center gap-2.5">
          <span className="grid size-10 place-items-center bg-navy text-rose-light">
            <Monogram className="size-7" />
          </span>
          <div>
            <h1 className="font-semibold leading-tight">Elegí una contraseña nueva</h1>
            <p className="text-sm text-muted">{email}</p>
          </div>
        </div>
        <p className="mb-4 text-sm leading-relaxed text-muted">Entraste con una contraseña temporal. Para seguir, reemplazala por una propia.</p>
        <label htmlFor="current" className="block text-sm font-medium">
          Contraseña temporal
        </label>
        <Input id="current" name="current" type="password" autoComplete="current-password" required className={field} />
        <label htmlFor="password" className="mt-4 block text-sm font-medium">
          Contraseña nueva (mínimo 10 caracteres)
        </label>
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={10} className={field} />
        <label htmlFor="confirm" className="mt-4 block text-sm font-medium">
          Repetila
        </label>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required className={field} />
        {state.message && (
          <p role="alert" className="mt-4 text-sm text-danger">
            {state.message}
          </p>
        )}
        <Button type="submit" size="xl" disabled={pending} className="mt-6 w-full">
          {pending ? "Guardando…" : "Guardar y entrar"}
        </Button>
      </form>
    </div>
  );
}
