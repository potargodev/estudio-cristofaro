import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SubmitButton } from "@/components/admin/ui";
import { Feedback, FleetLabel } from "@/components/flotas/Feedback";
import { requirePersonal } from "@/lib/auth";
import { formatArs } from "@/lib/faro/plans";
import { BELOW_MIN_NOTICE_DAYS, INFORMAL_NOTICE, profileLabel } from "@/modules/flotas/catalog";
import { FleetError, proposalForMember } from "@/modules/flotas/server";
import { signAgreementAction } from "../../actions";

export const metadata: Metadata = { title: "Tu acuerdo de servicio" };

/** Acuerdo de servicio individual: entre vos y el estudio, con la tarifa grupal de tu perfil */
export default async function AcuerdoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const u = await requirePersonal();
  let x: Awaited<ReturnType<typeof proposalForMember>>;
  try {
    x = await proposalForMember({ id: u.id, name: u.name, email: u.email }, id);
  } catch (e) {
    if (e instanceof FleetError) notFound();
    throw e;
  }
  return (
    <>
      <Feedback error={sp.error} />
      <Link href={`/flotas/${x.fleet.id}`} className="text-[13px] text-muted hover:text-ink">
        ← {x.fleet.name}
      </Link>
      <h1 className="mt-3 font-display text-[32px] leading-tight sm:text-[42px]">Acuerdo de servicio con {x.studio}</h1>
      <p className="mt-2 text-[15px] text-muted">
        Es un acuerdo <strong className="font-semibold text-ink">individual</strong> entre vos y el estudio. La Flota no firma nada ni tiene un pozo común.
      </p>
      <article className="mt-6 grid gap-4 rounded-lg border border-line bg-surface p-5 text-[15px]">
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[180px_1fr]">
          <dt className="text-muted">Partes</dt>
          <dd>
            {u.name} ({u.email}) y {x.studio}
          </dd>
          <dt className="text-muted">Origen</dt>
          <dd>
            Propuesta grupal para <FleetLabel /> {x.fleet.name}
          </dd>
          <dt className="text-muted">Tu perfil</dt>
          <dd>{profileLabel(x.member.profile)}</dd>
          <dt className="text-muted">Abono mensual</dt>
          <dd className="font-semibold">{x.price != null ? `${formatArs(x.price)} por mes, por adelantado` : "Esta propuesta no incluye tu perfil"}</dd>
          <dt className="text-muted">Qué incluye</dt>
          <dd className="whitespace-pre-line">{x.p.includes}</dd>
          <dt className="text-muted">Mínimo de la Flota</dt>
          <dd>
            {x.p.min_members} integrantes con acuerdo. Si quedan menos, el estudio avisa con {BELOW_MIN_NOTICE_DAYS} días antes de pasar a su tarifa normal.
          </dd>
          <dt className="text-muted">Baja</dt>
          <dd>Cuando quieras, con {x.p.notice_days} días de preaviso y sin penalidades. Antes de confirmar ves tu liquidación final.</dd>
          <dt className="text-muted">Pagos</dt>
          <dd>Pagás solo tu abono, directo al estudio, por el medio que acuerden (el estudio lo registra). Nadie paga ni debe por otro.</dd>
        </dl>
        <p className="rounded-md bg-canvas px-3 py-2 text-[13px] text-muted">{INFORMAL_NOTICE}</p>
      </article>
      {x.price != null && (
        <form action={signAgreementAction} className="mt-6 grid max-w-xl gap-4">
          <input type="hidden" name="proposal" value={x.p.id} />
          <label className="flex items-start gap-2 text-[14px]">
            <input type="checkbox" name="consent" required className="mt-0.5 size-4 accent-navy" />
            <span>Acepto compartir mi nombre y mail con {x.studio} y quedar como cliente del estudio en Faro. Lo puedo revocar dando de baja el acuerdo.</span>
          </label>
          <label className="text-[13px] text-muted">
            Firmá escribiendo tu nombre completo ({u.name})
            <input name="signed_name" required autoComplete="name" className="mt-1.5 h-11 w-full rounded-md border border-line bg-surface px-3 text-[15px] text-ink" />
          </label>
          <div>
            <SubmitButton pendingText="Firmando…">Firmar mi acuerdo</SubmitButton>
          </div>
          <p className="text-[12px] text-muted">
            Guardamos la fecha, la hora y la IP de la firma. Texto en borrador, pendiente de revisión legal (
            <Link href="/legal/flotas" className="underline underline-offset-4">
              condiciones de Flotas
            </Link>
            ).
          </p>
        </form>
      )}
    </>
  );
}
