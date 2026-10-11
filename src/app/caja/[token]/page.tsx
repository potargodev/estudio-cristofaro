import { Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { JoinChoices } from "@/components/gastos/invite";
import { getCurrentUser } from "@/lib/auth";
import { googleEnabled } from "@/lib/auth-server";
import { templateOf } from "@/modules/cajas/catalog";
import { boxByInvite } from "@/modules/cajas/shared";
import { joinBoxAction } from "@/app/cajas/actions";

export const metadata: Metadata = { title: "Sumate a la caja", robots: { index: false, follow: false } };

/**
 * Enlace de una caja compartida (el que se manda por WhatsApp). Muestra solo
 * el tipo de caja y quién invita. Para entrar hay que tener cuenta; sumarse
 * es siempre con un botón (las vistas previas de los chats abren el enlace).
 */
export default async function UnirsePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> }) {
  const [{ token }, sp] = await Promise.all([params, searchParams]);
  const inv = await boxByInvite(token);
  if (!inv)
    return (
      <div className="mx-auto max-w-md px-4 pt-10">
        <h1 className="font-display text-[28px] leading-tight text-ink">Ese enlace ya no sirve</h1>
        <p className="mt-3 text-muted">Puede que lo hayan renovado. Pedile a quien te invitó un enlace nuevo.</p>
        <Link href="/cajas" className="mt-6 inline-flex h-11 items-center rounded-md bg-navy px-5 text-paper">
          Ir a Mis cajas
        </Link>
      </div>
    );
  const t = templateOf(inv.box.purpose);
  const user = await getCurrentUser().catch(() => null);
  const next = `/caja/${token}`;
  return (
    <div className="mx-auto grid max-w-md gap-6 px-4 pt-10 pb-10">
      <header>
        <span className="grid size-12 place-items-center rounded-md bg-navy text-gold">
          <Users className="size-6" strokeWidth={1.5} aria-hidden />
        </span>
        <p className="mt-4 text-[13px] text-muted">{inv.inviter ? `${inv.inviter} te invita a una caja compartida` : "Te invitan a una caja compartida"}</p>
        <h1 className="font-display text-[28px] leading-tight text-ink sm:text-[32px]">{inv.box.name}</h1>
        <p className="mt-1 text-[14px] text-muted">
          {inv.members} {inv.members === 1 ? "integrante" : "integrantes"} · {t?.description} Llevan la cuenta juntos en Faro: quién puso qué, cuánto y cuándo.
        </p>
      </header>
      {sp.error && (
        <p role="alert" className="rounded-md border border-danger/40 bg-danger/5 px-4 py-3 text-[14px] text-danger">
          {sp.error}
        </p>
      )}
      {user ? (
        <form action={joinBoxAction} className="grid gap-3">
          <input type="hidden" name="token" value={token} />
          <button className="inline-flex h-12 items-center justify-center rounded-md bg-navy px-5 text-paper hover:bg-navy-deep">Sumarme como {user.name}</button>
          <p className="text-[13px] text-muted">La caja aparece en Mis cajas. Lo demás sigue siendo tuyo: nadie de esta caja ve tu caja personal.</p>
        </form>
      ) : (
        <>
          <p className="text-[14px] text-ink">Para entrar a una caja compartida necesitás una cuenta de Faro (es gratis).</p>
          <JoinChoices token={token} google={googleEnabled()} next={next} accountOnly />
        </>
      )}
    </div>
  );
}
