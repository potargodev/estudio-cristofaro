import { and, desc, eq } from "drizzle-orm";
import { Paperclip } from "lucide-react";
import { getDb } from "@/db";
import { reimbursements, users } from "@/db/schema";
import { Badge } from "@/components/portal/ui";
import { REIMBURSEMENT_STATUS, categoryName, formatMoney } from "@/modules/gastos/constants";
import { orgExpenses } from "@/modules/gastos/server/reimbursements";

const day = (d: string) => new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));
const tone = { pendiente: "warn", aprobada: "neutral", rechazada: "danger", reintegrada: "ok" } as const;

/** Ficha de la organización → Gastos: gastos contables (con comprobante) y rendiciones del equipo */
export async function OrgExpensesTab({ orgId, studioId }: { orgId: string; studioId: string }) {
  const [rows, rends] = await Promise.all([
    orgExpenses(studioId, orgId),
    getDb()
      .select({ r: reimbursements, employee: users.name })
      .from(reimbursements)
      .innerJoin(users, eq(users.id, reimbursements.user_id))
      .where(and(eq(reimbursements.organization_id, orgId), eq(reimbursements.studio_id, studioId)))
      .orderBy(desc(reimbursements.created_at))
      .limit(100),
  ]);
  const totals: Record<string, number> = {};
  for (const r of rows) totals[r.currency] = (totals[r.currency] ?? 0) + r.amount;
  return (
    <div className="grid gap-8">
      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-display text-2xl">Gastos de la organización</h2>
          <p className="text-[14px] text-muted">{Object.entries(totals).map(([c, v]) => formatMoney(v, c)).join(" · ") || "Sin gastos"}</p>
        </div>
        <p className="mt-1 text-[14px] text-muted">Rendiciones aprobadas y grupos de gastos marcados como de la empresa o deducibles.</p>
        <ul className="mt-4 divide-y divide-line border-y border-line">
          {rows.map((r) => (
            <li key={r.id} className="flex items-start justify-between gap-3 py-3 text-[14px]">
              <div className="min-w-0">
                <p className="font-medium text-ink">{r.description}</p>
                <p className="text-muted">
                  {day(r.date)} · {categoryName(r.category)} · {r.source === "rendicion" ? "Rendición" : "Gasto compartido"}
                  {r.deductible && " · deducible"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="tabular-nums">{formatMoney(r.amount, r.currency)}</span>
                {r.receipt_path && (
                  <a href={`/api/gastos/archivo/contable/${r.id}`} target="_blank" aria-label="Ver comprobante" className="text-rose-deep">
                    <Paperclip className="size-4" />
                  </a>
                )}
              </div>
            </li>
          ))}
          {rows.length === 0 && <li className="py-4 text-muted">Todavía no hay gastos.</li>}
        </ul>
      </section>
      <section>
        <h2 className="font-display text-2xl">Rendiciones del equipo</h2>
        <ul className="mt-4 divide-y divide-line border-y border-line">
          {rends.map(({ r, employee }) => (
            <li key={r.id} className="flex items-start justify-between gap-3 py-3 text-[14px]">
              <div className="min-w-0">
                <p className="font-medium text-ink">{r.description}</p>
                <p className="text-muted">
                  {employee} · {day(r.date)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="tabular-nums">{formatMoney(r.amount, r.currency)}</span>
                <Badge tone={tone[r.status]}>{REIMBURSEMENT_STATUS[r.status]}</Badge>
              </div>
            </li>
          ))}
          {rends.length === 0 && <li className="py-4 text-muted">Sin rendiciones.</li>}
        </ul>
      </section>
    </div>
  );
}
