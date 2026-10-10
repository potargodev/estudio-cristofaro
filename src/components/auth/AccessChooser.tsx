"use client";

import { KeyRound, Mail } from "lucide-react";
import { useActionState, useState } from "react";
import { signIn } from "@/app/admin/actions";
import { requestMagicLink, signInWithGoogle, type PortalLoginState } from "@/app/portal/actions";
import { cn } from "@/lib/utils";

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

const field = "mt-1.5 h-12 w-full border border-paper/20 bg-paper/[0.06] px-3.5 text-[16px] text-paper placeholder:text-paper/40 focus:border-rose-light focus:outline-none";
const label = "block text-[13px] text-paper/70";
const primary = "mt-5 inline-flex h-12 w-full items-center justify-center bg-rose-light text-[15px] font-medium text-night transition-colors hover:bg-paper disabled:opacity-60";

/**
 * Ingreso único (sitio y app instalada): Google, enlace por mail o usuario y
 * contraseña. Google y el enlace son el acceso de los clientes invitados;
 * usuario y contraseña, el del equipo del estudio (después pide el 2FA).
 */
export function AccessChooser({ google, error }: { google: boolean; error?: string | null }) {
  const [method, setMethod] = useState<"link" | "password">("link");
  // Controlado: el email no se borra si el ingreso falla (los forms con action se resetean)
  const [email, setEmail] = useState("");
  const [linkState, linkAction, linkPending] = useActionState<PortalLoginState, FormData>(requestMagicLink, { ok: false });
  const [pwState, pwAction, pwPending] = useActionState(signIn, { ok: false });

  return (
    <div>
      {error && (
        <p role="alert" className="mb-5 border border-[#e8a598]/40 bg-[#e8a598]/10 p-3 text-[14px] text-[#f3c4ba]">
          {error}
        </p>
      )}

      {google && (
        <form action={signInWithGoogle}>
          <input type="hidden" name="next" value="/portal" />
          <button type="submit" className="inline-flex h-12 w-full items-center justify-center gap-3 bg-paper text-[15px] font-medium text-night transition-colors hover:bg-white">
            <GoogleIcon />
            Continuar con Google
          </button>
        </form>
      )}

      <div className={cn("flex items-center gap-3 text-[12px] text-paper/50", google ? "my-6" : "mb-6")}>
        <span className="h-px flex-1 bg-paper/15" />
        {google ? "o entrá con" : "Entrá con"}
        <span className="h-px flex-1 bg-paper/15" />
      </div>

      <div role="tablist" aria-label="Forma de ingreso" className="grid grid-cols-2 border border-paper/20 p-1">
        {(
          [
            ["link", "Enlace por mail", Mail],
            ["password", "Usuario y contraseña", KeyRound],
          ] as const
        ).map(([key, text, Icon]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={method === key}
            onClick={() => setMethod(key)}
            className={cn(
              "inline-flex h-10 items-center justify-center gap-2 text-[13px] transition-colors",
              method === key ? "bg-paper/10 text-paper" : "text-paper/60 hover:text-paper",
            )}
          >
            <Icon className="size-4" strokeWidth={1.5} aria-hidden />
            {text}
          </button>
        ))}
      </div>

      <div role="tabpanel" className="mt-6">
        {method === "link" ? (
          linkState.ok ? (
            <p role="status" className="border border-rose-light/40 bg-rose-light/10 p-4 text-[15px] leading-relaxed text-paper">
              {linkState.message}
            </p>
          ) : (
            <form action={linkAction}>
              <input type="hidden" name="next" value="/portal" />
              <label htmlFor="link-email" className={label}>
                Tu email
              </label>
              <input id="link-email" name="email" type="email" autoComplete="email" required placeholder="nombre@empresa.com" value={email} onChange={(e) => setEmail(e.target.value)} className={field} />
              {linkState.message && (
                <p role="alert" className="mt-3 text-[14px] text-[#f3c4ba]">
                  {linkState.message}
                </p>
              )}
              <button type="submit" disabled={linkPending} className={primary}>
                {linkPending ? "Enviando…" : "Recibir enlace para entrar"}
              </button>
              <p className="mt-3 text-[13px] leading-relaxed text-paper/55">Te llega un mail con un botón para entrar, sin contraseña.</p>
            </form>
          )
        ) : (
          <form action={pwAction}>
            <label htmlFor="pw-email" className={label}>
              Email
            </label>
            <input id="pw-email" name="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} className={field} />
            <label htmlFor="pw-password" className={cn(label, "mt-4")}>
              Contraseña
            </label>
            <input id="pw-password" name="password" type="password" autoComplete="current-password" required className={field} />
            {pwState.message && (
              <p role="alert" className="mt-3 text-[14px] text-[#f3c4ba]">
                {pwState.message}
              </p>
            )}
            <button type="submit" disabled={pwPending} className={primary}>
              {pwPending ? "Ingresando…" : "Ingresar"}
            </button>
            <p className="mt-3 text-[13px] leading-relaxed text-paper/55">Después te pedimos el código de tu app de autenticación.</p>
          </form>
        )}
      </div>
    </div>
  );
}
