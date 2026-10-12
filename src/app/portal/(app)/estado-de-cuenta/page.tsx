import type { Metadata } from "next";
import { portalPayAction } from "@/app/portal/cobros-actions";
import { SubmitButton } from "@/components/admin/ui";
import { EmpresaHeader } from "@/components/portal/EmpresaTabs";
import { Badge, Card, Empty, PageTitle } from "@/components/portal/ui";
import { requireMember } from "@/lib/auth";
import { hasModule } from "@/lib/faro/entitlements";
import { accountStatement } from "@/modules/billing/fees";
import { accountSummary } from "@/modules/billing/mp";
import { formatDate, formatMoney } from "@/lib/format";

export const metadata: Metadata = { title: "Estado de cuenta" };


/** Estado de cuenta con el estudio: lo pendiente (con el botón de pago) y lo pagado */
export default async function EstadoDeCuentaPage({ searchParams }: { searchParams: Promise<{ pago?: string; error?: string }> }) {
  const sp = await searchParams;
  const me = await requireMember("finanzas.ver");
  const [on, mp] = await Promise.all([hasModule(me.studioId, "billing"), accountSummary(me.studioId)]);
  const st = on ? await accountStatement(me.studioId, me.organizationId) : null;
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <EmpresaHeader me={me} />
      <PageTitle level={2} title="Estado de cuenta" intro="Los honorarios de tu estudio: qué está pendiente y qué ya pagaste." />
      {sp.pago && <p className="mb-4 rounded-md border border-line bg-navy-soft px-4 py-3 text-ui">Volviste de Mercado Pago. Cuando se acredite el pago lo vas a ver acá como pagado.</p>}
      {sp.error && <p role="alert" className="mb-4 rounded-md border border-[#efc4bd] bg-[#fbecea] px-4 py-3 text-ui text-[#8f2a1c]">{sp.error}</p>}
      {!st ? (
        <Empty>Tu estudio todavía no publica cobros en Faro.</Empty>
      ) : (
        <>
          <div className="mb-6 flex flex-wrap gap-3">
            <Card className="min-w-48">
              <p className="text-ui text-muted">Pendiente</p>
              <p className="num text-3xl">{formatMoney(st.pending)}</p>
              {st.overdue > 0 && <p className="text-ui text-[#8f2a1c]">{formatMoney(st.overdue)} vencido</p>}
            </Card>
            <Card className="min-w-48">
              <p className="text-ui text-muted">Pagado</p>
              <p className="num text-3xl">{formatMoney(st.paid)}</p>
            </Card>
          </div>
          <Card>
            {st.rows.length === 0 ? (
              <Empty>No hay cobros todavía.</Empty>
            ) : (
              <ul className="divide-y divide-line">
                {st.rows.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="font-medium">{r.concept}</p>
                      <p className="text-ui text-muted">
                        {r.status === "pagado" ? `Pagado el ${formatDate(r.paid_at, "numeric")}` : `Vence el ${formatDate(r.due_date, "numeric")}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="num">{formatMoney(r.amount)}</span>
                      {r.status === "pagado" ? (
                        <Badge tone="ok">Pagado</Badge>
                      ) : mp ? (
                        <form action={portalPayAction}>
                          <input type="hidden" name="id" value={r.id} />
                          <SubmitButton pendingText="…">Pagar</SubmitButton>
                        </form>
                      ) : (
                        <Badge tone={r.due_date < today ? "danger" : "warn"}>{r.due_date < today ? "Vencido" : "Pendiente"}</Badge>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </>
  );
}
