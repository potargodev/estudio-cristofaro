"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthShell } from "./AuthShell";

interface LoginState {
  ok: boolean;
  message?: string;
}

/** Login con email y contraseña del estudio (después pide el segundo factor). */
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
    <AuthShell title={title} subtitle={subtitle} footer={footer}>
      <form action={formAction}>
        <label htmlFor="email" className="block text-sm font-medium">
          Email
        </label>
        <Input id="email" name="email" type="email" autoComplete="email" required className="mt-1 h-11 bg-surface text-base" />
        <label htmlFor="password" className="mt-4 block text-sm font-medium">
          Contraseña
        </label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required className="mt-1 h-11 bg-surface text-base" />
        {state.message && (
          <p role="alert" className="mt-4 text-sm text-danger">
            {state.message}
          </p>
        )}
        <Button type="submit" disabled={pending} size="xl" className="mt-6 w-full">
          {pending ? "Ingresando…" : "Ingresar"}
        </Button>
      </form>
    </AuthShell>
  );
}
