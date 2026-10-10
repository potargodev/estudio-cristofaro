import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DecideButtons, ReimburseButton, RendicionForm } from "@/components/gastos/Rendiciones";
import { Badge, Card, Empty, PageTitle } from "@/components/portal/ui";
import { requireMember } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { REIMBURSEMENT_STATUS, categoryName, formatMoney } from "@/modules/gastos/constants";
import { canApprove, listReimbursements } from "@/modules/gastos/server/reimbursements";

export const metadata: Metadata = { title: "Rendiciones" };

const tone = { pendiente: "warn", aprobada: "neutral", rechazada: "danger", reintegrada: "ok" } as const;
const day = (d: string) => new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));

export default async function RendicionesPage() {
  const me = await requireMember();
  const approver = canApprove(me);
  const rinde = can(me.orgRole, "gastos.rendir");
  if (!approver && !rinde) redirect("/portal/sin-permiso");
  const rows = await listReimbursements(me);
  const pending = rows.filter((r) => r.status === "pendiente" && approver && r.user_id !== me.id);
  const rest = rows.filter((r) => !pending.includes(r));
  return (
    <>
      <PageTitle title="Rendiciones" intro={approver ? "Los gastos que rinde el equipo: aprobá, rechazá y marcá los reintegros. Lo aprobado pasa a los gastos de la empresa." : "Cargá lo que gastaste para la empresa con su ticket. Administración lo revisa y te avisa."}>
        {me.orgRole === "empleado" && (
          <Link href="/gastos" className="text-[14px] text-rose-deep underline-offset-4 hover:underline">
            Gastos compartidos →
          </Link>
        )}
      </PageTitle>
      <div className="grid gap-6 md:grid-cols-[1fr_1.15fr]">
        {rinde && (
          <Card>
            <h2 className="mb-4 font-semibold">Nuevo gasto a rendir</h2>
            <RendicionForm />
          </Card>
        )}
        <div className="grid content-start gap-6">
          {approver && (
            <Card>
              <h2 className="font-semibold">Para revisar ({pending.length})</h2>
              {pending.length === 0 ? (
                <div className="mt-3">
                  <Empty>No hay rendiciones pendientes.</Empty>
                </div>
              ) : (
                <ul className="mt-3 divide-y divide-line">
                  {pending.map((r) => (
                    <li key={r.id} className="grid gap-3 py-4" data-testid="rendicion-pendiente">
                      <div className="flex justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium">{r.description}</p>
                          <p className="text-sm text-muted">
                            {r.employee} · {day(r.date)} · {categoryName(r.category)} ·{" "}
                            <a href={`/api/gastos/archivo/rendicion/${r.id}`} target="_blank" className="text-rose-deep underline-offset-4 hover:underline">
                              ticket
                            </a>
                          </p>
                        </div>
                        <p className="shrink-0 font-display text-xl tabular-nums">{formatMoney(r.amount, r.currency)}</p>
                      </div>
                      <DecideButtons id={r.id} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
          <Card>
            <h2 className="font-semibold">{approver ? "Historial" : "Tus rendiciones"}</h2>
            {rest.length === 0 ? (
              <div className="mt-3">
                <Empty>Todavía no hay rendiciones.</Empty>
              </div>
            ) : (
              <ul className="mt-3 divide-y divide-line">
                {rest.map((r) => (
                  <li key={r.id} className="grid gap-2 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium">{r.description}</p>
                        <p className="text-sm text-muted">
                          {approver && `${r.employee} · `}
                          {day(r.date)} · {categoryName(r.category)}
                          {r.reason && ` · ${r.reason}`}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="tabular-nums">{formatMoney(r.amount, r.currency)}</p>
                        <Badge tone={tone[r.status]}>{REIMBURSEMENT_STATUS[r.status]}</Badge>
                      </div>
                    </div>
                    {approver && r.status === "aprobada" && <ReimburseButton id={r.id} />}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
