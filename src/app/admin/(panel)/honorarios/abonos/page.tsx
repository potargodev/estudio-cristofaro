import { asc, eq } from "drizzle-orm";
import { savePlanAction } from "@/app/admin/honorarios-actions";
import { SubmitButton } from "@/components/admin/ui";
import { Feedback } from "@/components/app/Feedback";
import { getDb } from "@/db";
import { organizations } from "@/db/schema";
import { requireOperator } from "@/lib/auth";
import { listPlans, planAmount } from "@/modules/billing/fees";
import { fieldClass } from "@/components/ds/primitives";
import { formatMoney } from "@/lib/format";

export const metadata = { title: "Abonos" };

const field = `mt-1 ${fieldClass}`;
const ADJ: Record<string, string> = { ninguno: "Sin ajuste", porcentaje: "Porcentaje fijo", ipc: "Por IPC" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const me = await requireOperator();
  const [plans, orgs] = await Promise.all([listPlans(me.studioId), getDb().select({ id: organizations.id, name: organizations.name }).from(organizations).where(eq(organizations.studio_id, me.studioId)).orderBy(asc(organizations.name))]);
  const period = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 7);
  const current = await Promise.all(plans.map(({ p }) => planAmount(p, period)));
  return (
    <div className="grid gap-5">
      <Feedback sp={sp} />
      {plans.length > 0 && (
        <ul className="divide-y divide-line rounded-md border border-line bg-surface">
          {plans.map(({ p, org }, i) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-ui font-medium">
                  {org} {!p.active && <span className="text-caption font-normal text-muted">· pausado</span>}
                </p>
                <p className="text-meta text-muted">
                  {p.concept} · desde {p.start_month} · {ADJ[p.adjust_kind]}
                  {p.adjust_kind !== "ninguno" && ` cada ${p.adjust_every} meses`}
                  {p.adjust_kind === "porcentaje" && ` (${Number(p.adjust_percent)}%)`}
                </p>
              </div>
              <span className="text-right text-meta">
                <span className="num block text-body">{formatMoney(current[i])}</span>
                {current[i] !== p.amount && <span className="text-muted">base {formatMoney(p.amount)}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      <form action={savePlanAction} className="grid gap-2 rounded-md border border-line bg-surface p-4 sm:grid-cols-3 sm:items-end">
        <p className="text-ui font-medium sm:col-span-3">Nuevo abono</p>
        <label className="text-meta text-muted">
          Organización
          <select name="org" required className={field}>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        </label>
        <label className="text-meta text-muted">
          Concepto
          <input name="concept" defaultValue="Honorarios mensuales" className={field} />
        </label>
        <label className="text-meta text-muted">
          Importe mensual
          <input name="amount" inputMode="decimal" required className={field} />
        </label>
        <label className="text-meta text-muted">
          Desde
          <input name="start" type="month" required defaultValue={period} className={field} />
        </label>
        <label className="text-meta text-muted">
          Ajuste
          <select name="adjust_kind" className={field}>
            <option value="ninguno">Sin ajuste</option>
            <option value="porcentaje">Porcentaje fijo</option>
            <option value="ipc">Por IPC (INDEC)</option>
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-meta text-muted">
            Cada (meses)
            <input name="adjust_every" type="number" min={1} max={12} defaultValue={3} className={field} />
          </label>
          <label className="text-meta text-muted">
            Porcentaje
            <input name="adjust_percent" inputMode="decimal" placeholder="Ej.: 10" className={field} />
          </label>
        </div>
        <div className="sm:col-span-3">
          <SubmitButton pendingText="…">Guardar abono</SubmitButton>
        </div>
      </form>
    </div>
  );
}
