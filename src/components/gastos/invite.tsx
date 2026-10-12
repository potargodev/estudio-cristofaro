"use client";

import { Link2, MessageCircle, RefreshCw, Share2 } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { groupAccountAction, groupLinkAction, joinAsGuestAction, type JoinState } from "@/app/grupos/invitacion-actions";
import { cn } from "@/lib/utils";
import { CopyButton, inputCls } from "./forms";

const btn = "inline-flex h-(--control-h) items-center justify-center gap-2 rounded-md bg-navy px-5 text-paper hover:bg-navy-deep disabled:opacity-60";
const ghost = "inline-flex h-(--control-h) items-center justify-center gap-2 rounded-md border border-line px-4 text-ui hover:border-muted";

/** WhatsApp (sin depender del mail) y el menú de compartir del teléfono */
export function ShareLink({ link, text }: { link: string; text: string }) {
  const msg = `${text} ${link}`;
  const [canShare, setCanShare] = useState(false);
  useEffect(() => setCanShare(typeof navigator !== "undefined" && !!navigator.share), []);
  return (
    <div className="grid gap-2 rounded-md border border-gold/50 bg-rose-soft p-3">
      <code className="break-all text-meta" data-testid="share-link">
        {link}
      </code>
      <div className="flex flex-wrap gap-2">
        <a href={`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer" className="inline-flex h-(--control-h) items-center gap-1.5 rounded-md bg-[#1f7a4d] px-3 text-meta text-white hover:bg-[#186540]">
          <MessageCircle className="size-3.5" aria-hidden /> Mandar por WhatsApp
        </a>
        <CopyButton value={link} label="Copiar enlace" className="rounded-md" />
        {canShare && (
          <button type="button" onClick={() => navigator.share({ text, url: link }).catch(() => undefined)} className="inline-flex h-(--control-h) items-center gap-1.5 rounded-md border border-navy/30 px-3 text-meta text-navy hover:bg-navy-soft">
            <Share2 className="size-3.5" aria-hidden /> Compartir
          </button>
        )}
      </div>
    </div>
  );
}

/** Enlace del grupo: lo genera al tocar, y quien administra lo puede renovar */
export function GroupLink({ groupId, groupName, admin, active }: { groupId: string; groupName: string; admin: boolean; active: boolean }) {
  const [state, action, pending] = useActionState<JoinState, FormData>(groupLinkAction, {});
  return (
    <div className="grid gap-3">
      {!state.link && (
        <form action={action}>
          <input type="hidden" name="group" value={groupId} />
          <button disabled={pending} className={btn}>
            <Link2 className="size-4" aria-hidden /> {pending ? "Generando…" : active ? "Ver el enlace del grupo" : "Crear el enlace del grupo"}
          </button>
        </form>
      )}
      {state.link && <ShareLink link={state.link} text={`Sumate a «${groupName}» en Faro para dividir los gastos:`} />}
      {state.link && admin && (
        <form action={action}>
          <input type="hidden" name="group" value={groupId} />
          <input type="hidden" name="renew" value="1" />
          <button disabled={pending} className="inline-flex items-center gap-1.5 text-meta text-muted underline-offset-4 hover:text-ink hover:underline">
            <RefreshCw className="size-3.5" aria-hidden /> Renovar (el enlace anterior deja de servir)
          </button>
        </form>
      )}
      {state.message && (
        <p role="alert" className="text-ui text-danger">
          {state.message}
        </p>
      )}
      <p className="text-meta text-muted">Quien lo abra entra con Google, con un enlace por mail o sin cuenta, y queda en el grupo. No hace falta tener el mail configurado.</p>
    </div>
  );
}

/** Pantalla de invitación sin sesión: crear cuenta / entrar, o seguir sin cuenta */
export function JoinChoices({ token, google, next, error, accountOnly }: { token: string; google: boolean; next: string; error?: string | null; accountOnly?: boolean }) {
  const [mode, setMode] = useState<"cuenta" | "invitado">("cuenta");
  const [acc, accAction, accPending] = useActionState<JoinState, FormData>(groupAccountAction, {});
  const [guest, guestAction, guestPending] = useActionState<JoinState, FormData>(joinAsGuestAction, {});
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  return (
    <div className="grid gap-5">
      {error && (
        <p role="alert" className="rounded-md border border-danger/40 bg-danger/5 px-4 py-3 text-ui text-danger">
          {error}
        </p>
      )}
      {!accountOnly && (
      <div role="tablist" aria-label="Cómo querés entrar" className="grid grid-cols-2 rounded-md border border-line p-1">
        {(
          [
            ["cuenta", "Con mi cuenta"],
            ["invitado", "Sin cuenta"],
          ] as const
        ).map(([k, t]) => (
          <button key={k} type="button" role="tab" aria-selected={mode === k} onClick={() => setMode(k)} className={cn("h-(--control-h) rounded-md text-ui", mode === k ? "bg-navy text-paper" : "text-muted hover:text-ink")}>
            {t}
          </button>
        ))}
      </div>
      )}
      {mode === "cuenta" || accountOnly ? (
        acc.ok ? (
          <p role="status" className="rounded-md border border-gold/50 bg-rose-soft p-4 text-body">
            {acc.message}
          </p>
        ) : (
          <form action={accAction} className="grid gap-3">
            <input type="hidden" name="next" value={next} />
            <label className="grid gap-1.5 text-ui">
              Tu nombre
              <input name="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Como te conocen en el grupo" className={cn(inputCls, "rounded-md")} />
            </label>
            <label className="grid gap-1.5 text-ui">
              Tu email
              <input name="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="nombre@gmail.com" className={cn(inputCls, "rounded-md")} />
            </label>
            <label className="flex items-start gap-2 text-meta text-muted">
              <input type="checkbox" name="terms" required className="mt-0.5 size-4 accent-navy" />
              <span>
                Acepto los{" "}
                <a href="/legal/terminos" target="_blank" className="underline underline-offset-2">
                  términos
                </a>{" "}
                y la{" "}
                <a href="/legal/privacidad" target="_blank" className="underline underline-offset-2">
                  política de privacidad
                </a>
                .
              </span>
            </label>
            {acc.message && (
              <p role="alert" className="text-ui text-danger">
                {acc.message}
              </p>
            )}
            <div className="grid gap-2 sm:grid-cols-2">
              {google && (
                <button name="method" value="google" disabled={accPending} className={btn}>
                  Continuar con Google
                </button>
              )}
              <button name="method" value="enlace" disabled={accPending} className={google ? ghost : btn}>
                {accPending ? "Enviando…" : "Recibir enlace por mail"}
              </button>
            </div>
            <p className="text-meta text-muted">Si ya tenés cuenta de Faro, usá ese mail. Si no, te creamos una gratis (Personas · Gratis). Con Google, usá el mismo mail que escribiste.</p>
          </form>
        )
      ) : (
        <form action={guestAction} className="grid gap-3">
          <input type="hidden" name="token" value={token} />
          <label className="grid gap-1.5 text-ui">
            Tu nombre
            <input name="name" required minLength={2} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" className={cn(inputCls, "rounded-md")} />
          </label>
          {guest.message && (
            <p role="alert" className="text-ui text-danger">
              {guest.message}
            </p>
          )}
          <button disabled={guestPending} className={btn}>
            {guestPending ? "Entrando…" : "Entrar al grupo"}
          </button>
          <p className="text-meta text-muted">Entrás solo a este grupo, desde este teléfono. Cuando quieras, creás tu cuenta y el grupo queda guardado.</p>
        </form>
      )}
    </div>
  );
}
