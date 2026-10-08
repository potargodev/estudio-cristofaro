"use client";

import { useActionState } from "react";
import { adminInput } from "@/components/admin/ui";
import { Monogram } from "@/components/site/Logo";
import { signIn, type ActionState } from "../actions";

const initial: ActionState = { ok: false };

export function LoginForm() {
  const [state, action, pending] = useActionState(signIn, initial);
  return (
    <div className="grid min-h-dvh place-items-center bg-navy-deep px-4">
      <form action={action} className="w-full max-w-sm rounded-md bg-paper p-7 shadow-xl">
        <div className="mb-6 flex items-center gap-2.5">
          <span className="grid size-10 place-items-center rounded-full bg-navy text-rose-light">
            <Monogram className="size-7" />
          </span>
          <div>
            <h1 className="font-semibold leading-tight">Backoffice</h1>
            <p className="text-sm text-muted">Estudio Cristofaro</p>
          </div>
        </div>
        <label htmlFor="email" className="block text-sm font-medium">
          Email
        </label>
        <input id="email" name="email" type="email" autoComplete="email" required className={adminInput} />
        <label htmlFor="password" className="mt-4 block text-sm font-medium">
          Contraseña
        </label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className={adminInput} />
        {state.message && (
          <p role="alert" className="mt-4 text-sm text-danger">
            {state.message}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="mt-6 w-full rounded-md bg-navy px-4 py-2.5 font-medium text-paper hover:bg-navy-deep disabled:opacity-60"
        >
          {pending ? "Ingresando…" : "Ingresar"}
        </button>
      </form>
    </div>
  );
}
