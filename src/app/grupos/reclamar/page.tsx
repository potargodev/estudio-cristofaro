import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { JoinChoices } from "@/components/gastos/invite";
import { googleEnabled } from "@/lib/auth-server";
import { getSessionUser } from "@/lib/auth";
import { GUEST_COOKIE, guestByToken } from "@/modules/gastos/server/actor";
import { claimGuestAction } from "../invitacion-actions";
import { pageTitleClass } from "@/components/ds/primitives";

export const metadata: Metadata = { title: "Guardá el grupo en tu cuenta", robots: { index: false, follow: false } };

/** Invitado sin cuenta → crea su cuenta (o entra) y su lugar en el grupo pasa a ella */
export default async function ClaimPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  const token = (await cookies()).get(GUEST_COOKIE)?.value ?? "";
  const g = token ? await guestByToken(token) : null;
  const user = await getSessionUser().catch(() => null);
  if (!g)
    return (
      <div className="mx-auto max-w-md pt-6">
        <h1 className={pageTitleClass}>No hay un grupo para guardar</h1>
        <p className="mt-3 text-muted">Abrí primero el enlace personal que te pasaron y después volvé acá.</p>
        <Link href="/grupos" className="mt-6 inline-flex h-(--control-h) items-center rounded-md bg-navy px-5 text-paper">
          Ir a mis grupos
        </Link>
      </div>
    );
  return (
    <div className="mx-auto grid max-w-md gap-6 pt-2">
      <header>
        <h1 className={pageTitleClass}>Guardá el grupo en tu cuenta</h1>
        <p className="mt-2 text-muted">Entrás como {g.name}. Con una cuenta, ves el grupo desde cualquier dispositivo y tus gastos se suman a tu Bitácora.</p>
      </header>
      {sp.error && (
        <p role="alert" className="rounded-md border border-danger/40 bg-danger/5 px-4 py-3 text-ui text-danger">
          {sp.error.slice(0, 200)}
        </p>
      )}
      {user ? (
        <form action={claimGuestAction} className="grid gap-3">
          <button className="inline-flex h-(--control-h) items-center justify-center rounded-md bg-navy px-5 text-paper hover:bg-navy-deep">Guardar en la cuenta de {user.name}</button>
          <p className="text-meta text-muted">Tus gastos y saldos en el grupo quedan igual.</p>
        </form>
      ) : (
        <JoinChoices token="" google={googleEnabled()} next="/grupos/reclamar" accountOnly />
      )}
    </div>
  );
}
