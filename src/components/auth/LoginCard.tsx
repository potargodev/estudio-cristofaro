"use client";

import { useActionState } from "react";
import { Monogram } from "@/components/site/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface LoginState {
  ok: boolean;
  message?: string;
}

/** Login con email y contraseña (Better Auth). Lo usan el backoffice y el portal. */
export function LoginCard({
  action,
  title,
  subtitle,
  footer,
}: {
  action: (prev: LoginState, fd: FormData) => Promise<LoginState>;
  title: string;
  subtitle: string;
  footer?: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, { ok: false });
  return (
    <div className="grid min-h-dvh place-items-center bg-navy-deep px-4">
      <div className="w-full max-w-sm">
        <form action={formAction} className="rounded-md bg-paper p-7 shadow-xl">
          <div className="mb-6 flex items-center gap-2.5">
            <span className="grid size-10 place-items-center rounded-full bg-navy text-rose-light">
              <Monogram className="size-7" />
            </span>
            <div>
              <h1 className="font-semibold leading-tight">{title}</h1>
              <p className="text-sm text-muted">{subtitle}</p>
            </div>
          </div>
          <label htmlFor="email" className="block text-sm font-medium">
            Email
          </label>
          <Input id="email" name="email" type="email" autoComplete="email" required className="mt-1 h-11 bg-surface text-base" />
          <label htmlFor="password" className="mt-4 block text-sm font-medium">
            Contraseña
          </label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="mt-1 h-11 bg-surface text-base"
          />
          {state.message && (
            <p role="alert" className="mt-4 text-sm text-danger">
              {state.message}
            </p>
          )}
          <Button type="submit" disabled={pending} size="xl" className="mt-6 w-full">
            {pending ? "Ingresando…" : "Ingresar"}
          </Button>
        </form>
        {footer && <div className="mt-5 text-center text-sm text-paper/70">{footer}</div>}
      </div>
    </div>
  );
}
