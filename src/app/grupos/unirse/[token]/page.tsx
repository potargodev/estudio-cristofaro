import { Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { JoinChoices } from "@/components/gastos/invite";
import { googleEnabled } from "@/lib/auth-server";
import { getGastosActor } from "@/modules/gastos/server/session";
import { inviteByToken } from "@/modules/gastos/server/service";
import { joinGroupAction } from "../../invitacion-actions";

export const metadata: Metadata = { title: "Sumate al grupo", robots: { index: false, follow: false } };

const AUTH_ERROR: Record<string, string> = {
  SIN_INVITACION: "Ese mail no coincide con el que escribiste. Probá de nuevo con el mismo mail.",
  INVALID_TOKEN: "El enlace del mail venció o ya se usó. Pedí uno nuevo.",
  EXPIRED_TOKEN: "El enlace del mail venció o ya se usó. Pedí uno nuevo.",
  access_denied: "Cancelaste el ingreso con Google.",
};

/**
 * Enlace del grupo (el que se comparte por WhatsApp). Muestra solo el nombre
 * del grupo y quién invita. Sumarse siempre es con un botón (nunca al abrir
 * el enlace: lo abren también las vistas previas de los chats).
 */
export default async function JoinPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> }) {
  const [{ token }, sp] = await Promise.all([params, searchParams]);
  const inv = await inviteByToken(token);
  if (!inv)
    return (
      <div className="mx-auto max-w-md pt-6">
        <h1 className="font-display text-[28px] leading-tight text-ink sm:text-[32px]">Ese enlace ya no sirve</h1>
        <p className="mt-3 text-muted">Puede que lo hayan renovado o que el grupo esté cerrado. Pedile a quien te invitó un enlace nuevo.</p>
        <Link href="/grupos" className="mt-6 inline-flex h-11 items-center rounded-md bg-navy px-5 text-paper">
          Ir a mis grupos
        </Link>
      </div>
    );
  const actor = await getGastosActor();
  const error = sp.error ? (AUTH_ERROR[sp.error] ?? (sp.error.length < 200 ? sp.error : "No pudimos completar el ingreso.")) : null;
  return (
    <div className="mx-auto grid max-w-md gap-6 pt-2">
      <header>
        <span className="grid size-12 place-items-center rounded-md bg-navy text-gold">
          <Users className="size-6" strokeWidth={1.5} aria-hidden />
        </span>
        <p className="mt-4 text-meta text-muted">{inv.inviter ? `${inv.inviter} te invita a` : "Te invitan a"}</p>
        <h1 className="font-display text-[28px] leading-tight text-ink sm:text-[32px]">{inv.name}</h1>
        <p className="mt-1 text-ui text-muted">
          {inv.members} {inv.members === 1 ? "integrante" : "integrantes"} · un grupo de gastos de Faro: quién pagó qué y cuánto debe cada uno.
        </p>
      </header>
      {actor?.kind === "user" ? (
        <form action={joinGroupAction} className="grid gap-3">
          <input type="hidden" name="token" value={token} />
          {error && (
            <p role="alert" className="rounded-md border border-danger/40 bg-danger/5 px-4 py-3 text-ui text-danger">
              {error}
            </p>
          )}
          <button className="inline-flex h-12 items-center justify-center rounded-md bg-navy px-5 text-paper hover:bg-navy-deep">Sumarme como {actor.name}</button>
          <p className="text-meta text-muted">El grupo va a aparecer en tus Grupos de gastos. Tu Bitácora sigue siendo privada: ahí solo se suma tu parte.</p>
        </form>
      ) : (
        <JoinChoices token={token} google={googleEnabled()} next={`/grupos/unirse/${token}`} error={error} />
      )}
    </div>
  );
}
