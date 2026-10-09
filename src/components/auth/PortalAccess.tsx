"use client";

import { useActionState } from "react";
import { requestMagicLink, signInWithGoogle, type PortalLoginState } from "@/app/portal/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function GoogleIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-5">
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.2 3.5-8.8Z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.4 14.4a7.2 7.2 0 0 1 0-4.7V6.6h-4a12 12 0 0 0 0 10.9l4-3.1Z" />
      <path fill="#EA4335" d="M12 4.8c1.7 0 3.3.6 4.5 1.8l3.4-3.4A12 12 0 0 0 1.4 6.6l4 3.1C6.3 6.9 8.9 4.8 12 4.8Z" />
    </svg>
  );
}

/**
 * Acceso de clientes: "Continuar con Google" (si hay credenciales) y enlace
 * mágico por mail. No hay contraseña ni registro: el email tiene que estar
 * invitado. `next` es a dónde volver después de entrar.
 */
export function PortalAccess({
  google,
  next = "/portal",
  email,
  error,
}: {
  google: boolean;
  next?: string;
  /** Email fijo (invitación): el enlace sale solo a esa dirección */
  email?: string;
  error?: string | null;
}) {
  const [state, action, pending] = useActionState<PortalLoginState, FormData>(requestMagicLink, { ok: false });
  return (
    <div>
      {error && (
        <p role="alert" className="mb-4 rounded-md bg-danger/5 p-3 text-sm text-danger">
          {error}
        </p>
      )}
      {google && (
        <>
          <form action={signInWithGoogle}>
            <input type="hidden" name="next" value={next} />
            <Button type="submit" variant="outline" size="xl" className="w-full gap-3 bg-surface">
              <GoogleIcon />
              Continuar con Google
            </Button>
          </form>
          <div className="my-5 flex items-center gap-3 text-xs text-muted">
            <span className="h-px flex-1 bg-line" />o con un enlace por mail
            <span className="h-px flex-1 bg-line" />
          </div>
        </>
      )}
      {state.ok ? (
        <p role="status" className="rounded-md bg-[#e3efe6] p-4 text-[15px] text-[#24583a]">
          {state.message}
        </p>
      ) : (
        <form action={action}>
          <input type="hidden" name="next" value={next} />
          <label htmlFor="email" className="block text-sm font-medium">
            Email
          </label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            defaultValue={email}
            readOnly={Boolean(email)}
            className="mt-1 h-11 bg-surface text-base read-only:bg-paper"
          />
          {state.message && (
            <p role="alert" className="mt-3 text-sm text-danger">
              {state.message}
            </p>
          )}
          <Button type="submit" disabled={pending} size="xl" className="mt-4 w-full">
            {pending ? "Enviando…" : "Recibir enlace para entrar"}
          </Button>
        </form>
      )}
    </div>
  );
}
