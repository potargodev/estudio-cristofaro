import { PageHeader } from "@/components/admin/kit/PageHeader";
import type { Metadata } from "next";
import Link from "next/link";
import { SubmitButton } from "@/components/admin/ui";
import { Feedback } from "@/components/flotas/Feedback";
import { requirePersonal } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { profileLabel } from "@/modules/flotas/catalog";
import { finalSettlement, FleetError, myAgreements } from "@/modules/flotas/server";
import { requestEndAction } from "../actions";
import { fleetPayAction } from "../cobro-actions";
import { formatAmount, formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Mis servicios" };

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
      <PageHeader title="Mi estudio" description="Tus acuerdos con estudios y tu estado de cuenta con cada uno. Solo lo ves vos." className="mb-0" />
      {list.length === 0 ? (
        <p className="mt-6 text-body text-muted">
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
                  <p className="text-title font-semibold">{a.terms.studioName}</p>
                  <p className="text-meta text-muted">
                    Por la Flota «{a.terms.fleetName}» · {profileLabel(a.profile)} · firmado el {formatDate(a.signed_at.toISOString().slice(0, 10), "long")}
                  </p>
                </div>
                <span className={cn("rounded-md px-2.5 py-1 text-meta font-medium", account.state === "al_dia" ? "bg-navy-soft text-ink" : "bg-danger/10 text-danger")}>
                  {a.status === "finalizado" ? STATUS.finalizado : account.state === "al_dia" ? "Al día" : `Pendiente: ${formatAmount(account.pendingAmount, "ARS", { decimals: "none" })}`}
                </span>
              </div>
              <dl className="mt-3 grid gap-x-6 gap-y-1 text-ui sm:grid-cols-[180px_1fr]">
                <dt className="text-muted">Abono</dt>
                <dd>{formatAmount(a.monthly_price, "ARS", { decimals: "none" })} por mes</dd>
                <dt className="text-muted">Estado</dt>
                <dd>
                  {STATUS[a.status]}
                  {a.ends_on && ` · termina el ${formatDate(a.ends_on, "long")}`}
                </dd>
                {a.status !== "finalizado" && account.nextDue && (
                  <>
                    <dt className="text-muted">Próximo vencimiento</dt>
                    <dd>{formatDate(account.nextDue, "long")}</dd>
                  </>
                )}
                {a.group_price_until && (
                  <>
                    <dt className="text-muted">Precio grupal hasta</dt>
                    <dd>{formatDate(a.group_price_until, "long")} (la Flota quedó debajo del mínimo)</dd>
                  </>
                )}
                <dt className="text-muted">Pagos registrados</dt>
                <dd>{account.payments.length ? account.payments.map((p) => p.period).join(", ") : "Ninguno todavía"}</dd>
                <dt className="text-muted">Débito automático</dt>
                <dd>{a.debit_status === "autorizado" ? "Adherido (se debita solo tu cuota)" : a.debit_status === "pendiente" ? "Falta autorizarlo en Mercado Pago" : "No adherido"}</dd>
              </dl>
              {a.status !== "finalizado" && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {account.pendingAmount > 0 && (
                    <form action={fleetPayAction}>
                      <input type="hidden" name="agreement" value={a.id} />
                      <input type="hidden" name="op" value="saldo" />
                      <SubmitButton pendingText="…">Pagar {formatAmount(account.pendingAmount, "ARS", { decimals: "none" })}</SubmitButton>
                    </form>
                  )}
                  {a.status === "activo" && a.debit_status !== "autorizado" &&
                    (a.debit_status === "pendiente" && a.debit_url ? (
                      <a href={a.debit_url} className="inline-flex h-10 items-center rounded-md border border-line px-4 text-ui">
                        Autorizar el débito
                      </a>
                    ) : (
                      <form action={fleetPayAction}>
                        <input type="hidden" name="agreement" value={a.id} />
                        <input type="hidden" name="op" value="adherir" />
                        <SubmitButton variant="secondary" pendingText="…">Adherir débito automático</SubmitButton>
                      </form>
                    ))}
                  {a.debit_status === "autorizado" && (
                    <form action={fleetPayAction}>
                      <input type="hidden" name="agreement" value={a.id} />
                      <input type="hidden" name="op" value="cancelar" />
                      <SubmitButton variant="danger" pendingText="…">Cancelar el débito</SubmitButton>
                    </form>
                  )}
                </div>
              )}
              {a.status === "activo" && settlement?.agreement.id !== a.id && (
                <Link href={`/flotas/servicios?baja=${a.id}`} className="mt-4 inline-block text-ui font-medium underline underline-offset-4">
                  Dar de baja el acuerdo
                </Link>
              )}
              {settlement?.agreement.id === a.id && a.status === "activo" && (
                <form action={requestEndAction} className="mt-4 grid gap-3 rounded-md border border-navy bg-canvas p-4">
                  <input type="hidden" name="agreement" value={a.id} />
                  <p className="text-body font-semibold">Liquidación final</p>
                  <dl className="grid gap-x-6 gap-y-1 text-ui sm:grid-cols-[200px_1fr]">
                    <dt className="text-muted">Fin del servicio</dt>
                    <dd>
                      {formatDate(settlement.endsOn, "long")} ({a.terms.noticeDays} días de preaviso)
                    </dd>
                    <dt className="text-muted">Períodos pagados</dt>
                    <dd>{settlement.paidPeriods.length ? settlement.paidPeriods.join(", ") : "Ninguno"}</dd>
                    <dt className="text-muted">Queda por pagar hasta el fin</dt>
                    <dd className={settlement.pendingAmount ? "font-semibold text-danger" : ""}>
                      {settlement.pendingAmount ? `${formatAmount(settlement.pendingAmount, "ARS", { decimals: "none" })} (${settlement.pendingPeriods.join(", ")})` : "Nada"}
                    </dd>
                  </dl>
                  {settlement.pendingAmount > 0 && <p className="text-meta text-muted">Lo pendiente es solo tu parte: lo pagás con el botón «Pagar» (si el estudio cobra con Mercado Pago) o directo al estudio. Con la baja se corta el débito automático.</p>}
                  <label className="flex items-start gap-2 text-ui">
                    <input type="checkbox" name="confirm" required className="mt-0.5 size-4 accent-navy" /> Revisé la liquidación y quiero dar de baja el acuerdo.
                  </label>
                  <div className="flex gap-3">
                    <SubmitButton pendingText="…">Confirmar la baja</SubmitButton>
                    <Link href="/flotas/servicios" className="h-10 px-2 text-ui leading-10 text-muted underline-offset-4 hover:underline">
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
