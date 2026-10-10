import type { Metadata } from "next";
import Link from "next/link";
import { SubmitButton } from "@/components/admin/ui";
import { Feedback } from "@/components/flotas/Feedback";
import { requirePersonal } from "@/lib/auth";
import { formatArs } from "@/lib/faro/plans";
import { cn } from "@/lib/utils";
import { profileLabel } from "@/modules/flotas/catalog";
import { finalSettlement, FleetError, myAgreements } from "@/modules/flotas/server";
import { requestEndAction } from "../actions";

export const metadata: Metadata = { title: "Mis servicios" };

const day = (d: string | null) => (d ? new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`)) : "—");
const STATUS = { activo: "Activo", baja_solicitada: "Baja pedida", finalizado: "Finalizado" } as const;

/** "Mis servicios": cada acuerdo con su estado de cuenta (solo lo propio) y la baja con liquidación final */
export default async function ServiciosPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; baja?: string }> }) {
  const sp = await searchParams;
  const u = await requirePersonal();
  const me = { id: u.id, name: u.name, email: u.email };
  const list = await myAgreements(me);
  let settlement: Awaited<ReturnType<typeof finalSettlement>> | null = null;
  if (sp.baja) {
    try {
      settlement = await finalSettlement(me, sp.baja);
    } catch (e) {
      if (!(e instanceof FleetError)) throw e;
    }
  }
  return (
    <>
      <Feedback ok={sp.ok} error={sp.error} />
      <h1 className="font-display text-[34px] leading-tight sm:text-[44px]">Mis servicios</h1>
      <p className="mt-2 text-[15px] text-muted">Tus acuerdos con estudios y tu estado de cuenta con cada uno. Solo lo ves vos.</p>
      {list.length === 0 ? (
        <p className="mt-6 text-[15px] text-muted">
          Todavía no tenés acuerdos.{" "}
          <Link href="/flotas" className="underline underline-offset-4">
            Ir a Flotas
          </Link>
        </p>
      ) : (
        <ul className="mt-6 grid gap-4">
          {list.map(({ a, account }) => (
            <li key={a.id} className="rounded-lg border border-line bg-surface p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-[17px] font-semibold">{a.terms.studioName}</p>
                  <p className="text-[13px] text-muted">
                    Por la Flota «{a.terms.fleetName}» · {profileLabel(a.profile)} · firmado el {day(a.signed_at.toISOString().slice(0, 10))}
                  </p>
                </div>
                <span className={cn("rounded-md px-2.5 py-1 text-[13px] font-medium", account.state === "al_dia" ? "bg-navy-soft text-ink" : "bg-danger/10 text-danger")}>
                  {a.status === "finalizado" ? STATUS.finalizado : account.state === "al_dia" ? "Al día" : `Pendiente: ${formatArs(account.pendingAmount)}`}
                </span>
              </div>
              <dl className="mt-3 grid gap-x-6 gap-y-1 text-[14px] sm:grid-cols-[180px_1fr]">
                <dt className="text-muted">Abono</dt>
                <dd>{formatArs(a.monthly_price)} por mes</dd>
                <dt className="text-muted">Estado</dt>
                <dd>
                  {STATUS[a.status]}
                  {a.ends_on && ` · termina el ${day(a.ends_on)}`}
                </dd>
                {a.status !== "finalizado" && account.nextDue && (
                  <>
                    <dt className="text-muted">Próximo vencimiento</dt>
                    <dd>{day(account.nextDue)}</dd>
                  </>
                )}
                {a.group_price_until && (
                  <>
                    <dt className="text-muted">Precio grupal hasta</dt>
                    <dd>{day(a.group_price_until)} (la Flota quedó debajo del mínimo)</dd>
                  </>
                )}
                <dt className="text-muted">Pagos registrados</dt>
                <dd>{account.payments.length ? account.payments.map((p) => p.period).join(", ") : "Ninguno todavía"}</dd>
              </dl>
              {a.status === "activo" && settlement?.agreement.id !== a.id && (
                <Link href={`/flotas/servicios?baja=${a.id}`} className="mt-4 inline-block text-[14px] font-medium underline underline-offset-4">
                  Dar de baja el acuerdo
                </Link>
              )}
              {settlement?.agreement.id === a.id && a.status === "activo" && (
                <form action={requestEndAction} className="mt-4 grid gap-3 rounded-md border border-navy bg-canvas p-4">
                  <input type="hidden" name="agreement" value={a.id} />
                  <p className="text-[15px] font-semibold">Liquidación final</p>
                  <dl className="grid gap-x-6 gap-y-1 text-[14px] sm:grid-cols-[200px_1fr]">
                    <dt className="text-muted">Fin del servicio</dt>
                    <dd>
                      {day(settlement.endsOn)} ({a.terms.noticeDays} días de preaviso)
                    </dd>
                    <dt className="text-muted">Períodos pagados</dt>
                    <dd>{settlement.paidPeriods.length ? settlement.paidPeriods.join(", ") : "Ninguno"}</dd>
                    <dt className="text-muted">Queda por pagar hasta el fin</dt>
                    <dd className={settlement.pendingAmount ? "font-semibold text-danger" : ""}>
                      {settlement.pendingAmount ? `${formatArs(settlement.pendingAmount)} (${settlement.pendingPeriods.join(", ")})` : "Nada"}
                    </dd>
                  </dl>
                  {settlement.pendingAmount > 0 && <p className="text-[13px] text-muted">Lo pendiente lo pagás directo al estudio, como siempre. Si ya lo pagaste, pedile que lo registre.</p>}
                  <label className="flex items-start gap-2 text-[14px]">
                    <input type="checkbox" name="confirm" required className="mt-0.5 size-4 accent-navy" /> Revisé la liquidación y quiero dar de baja el acuerdo.
                  </label>
                  <div className="flex gap-3">
                    <SubmitButton pendingText="…">Confirmar la baja</SubmitButton>
                    <Link href="/flotas/servicios" className="h-10 px-2 text-[14px] leading-10 text-muted underline-offset-4 hover:underline">
                      Cancelar
                    </Link>
                  </div>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
