import type { Metadata } from "next";
import { Card, Empty, PageTitle } from "@/components/portal/ui";
import { requireMember } from "@/lib/auth";
import { categoryName, formatMoney } from "@/modules/gastos/constants";
import { orgExpenses } from "@/modules/gastos/server/reimbursements";

export const metadata: Metadata = { title: "Gastos de la empresa" };

const day = (d: string) => new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));

export default async function GastosEmpresaPage() {
  const me = await requireMember("finanzas.ver");
  const rows = await orgExpenses(me.studioId, me.organizationId);
  const totals: Record<string, number> = {};
  for (const r of rows) totals[r.currency] = (totals[r.currency] ?? 0) + r.amount;
  return (
    <>
      <PageTitle title="Gastos de la empresa" intro="Rendiciones aprobadas y grupos de gastos marcados como de la empresa o deducibles, con su comprobante. Tu estudio también los ve." />
      <div className="mb-6 flex flex-wrap gap-3">
        {Object.entries(totals).map(([c, v]) => (
          <Card key={c} className="min-w-48">
            <p className="text-sm text-muted">Total en {c}</p>
            <p className="font-display text-3xl tabular-nums">{formatMoney(v, c)}</p>
          </Card>
        ))}
      </div>
      <Card>
        {rows.length === 0 ? (
          <Empty>Todavía no hay gastos cargados.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((r) => (
              <li key={r.id} className="flex items-start justify-between gap-3 py-3" data-testid="gasto-empresa">
                <div className="min-w-0">
                  <p className="font-medium">{r.description}</p>
                  <p className="text-sm text-muted">
                    {day(r.date)} · {categoryName(r.category)} · {r.source === "rendicion" ? "Rendición" : "Gasto compartido"}
                    {r.deductible && " · deducible"}
                    {r.receipt_path && (
                      <>
                        {" · "}
                        <a href={`/api/gastos/archivo/contable/${r.id}`} target="_blank" className="text-rose-deep underline-offset-4 hover:underline">
                          comprobante
                        </a>
                      </>
                    )}
                  </p>
                </div>
                <p className="shrink-0 tabular-nums">{formatMoney(r.amount, r.currency)}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
