import type { Metadata } from "next";
import { Badge, Empty, PageTitle, obligationTone } from "@/components/portal/ui";
import { requireClient } from "@/lib/auth";
import { getObligations } from "@/lib/portal-data";
import { OBLIGATION_STATUS, dateLabel, moneyLabel, periodLabel, todayISO } from "@/lib/portal-types";

export const metadata: Metadata = { title: "Vencimientos y pagos" };

function PayLink({ url }: { url: string | null }) {
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center rounded-md bg-navy px-3 py-1.5 text-sm font-medium text-paper transition-colors hover:bg-navy-deep"
    >
      Pagar
    </a>
  );
}

export default async function VencimientosPage() {
  const me = await requireClient();
  const rows = await getObligations(me);
  const today = todayISO();
  const pending = rows.filter((r) => r.status !== "pagado" && r.status !== "presentado").reverse();
  const done = rows.filter((r) => r.status === "pagado" || r.status === "presentado");

  return (
    <>
      <PageTitle title="Vencimientos y pagos" intro="Lo que cargó el estudio para vos. Si hay link de pago o VEP, lo tenés en cada uno." />
      {rows.length === 0 && <Empty>Todavía no hay vencimientos cargados.</Empty>}
      {[
        { title: "Pendientes", items: pending },
        { title: "Presentados y pagados", items: done },
      ].map(
        (group) =>
          group.items.length > 0 && (
            <section key={group.title} className="mb-8">
              <h2 className="mb-3 text-lg font-semibold">{group.title}</h2>
              {/* Celular: tarjetas */}
              <ul className="space-y-3 md:hidden">
                {group.items.map((o) => (
                  <li key={o.id} className="rounded-md border border-line bg-surface p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{o.tax}</p>
                        <p className="text-sm text-muted">{periodLabel(o.period)}</p>
                      </div>
                      <Badge tone={obligationTone(o.status, o.due_date, today)}>{OBLIGATION_STATUS[o.status]}</Badge>
                    </div>
                    <div className="mt-3 flex items-end justify-between gap-3">
                      <div className="text-sm">
                        <p className="text-muted">Vence el {dateLabel(o.due_date)}</p>
                        <p className="text-base font-semibold tabular-nums">{moneyLabel(o.amount)}</p>
                      </div>
                      <PayLink url={o.payment_url} />
                    </div>
                  </li>
                ))}
              </ul>
              {/* Escritorio: tabla */}
              <div className="hidden overflow-hidden rounded-md border border-line bg-surface md:block">
                <table className="w-full text-left text-[15px]">
                  <thead className="border-b border-line bg-paper text-sm text-muted">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">Impuesto</th>
                      <th className="px-4 py-2.5 font-medium">Período</th>
                      <th className="px-4 py-2.5 font-medium">Vencimiento</th>
                      <th className="px-4 py-2.5 text-right font-medium">Monto</th>
                      <th className="px-4 py-2.5 font-medium">Estado</th>
                      <th className="px-4 py-2.5">
                        <span className="sr-only">Pago</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {group.items.map((o) => (
                      <tr key={o.id}>
                        <td className="px-4 py-3 font-medium">{o.tax}</td>
                        <td className="px-4 py-3">{periodLabel(o.period)}</td>
                        <td className="px-4 py-3 tabular-nums">{dateLabel(o.due_date)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{moneyLabel(o.amount)}</td>
                        <td className="px-4 py-3">
                          <Badge tone={obligationTone(o.status, o.due_date, today)}>{OBLIGATION_STATUS[o.status]}</Badge>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <PayLink url={o.payment_url} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ),
      )}
    </>
  );
}
