import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import { addChargeAction, chargeAction, generateAction } from "@/app/admin/honorarios-actions";
import { SubmitButton } from "@/components/admin/ui";
import { Feedback } from "@/components/app/Feedback";
import { getDb } from "@/db";
import { organizations } from "@/db/schema";
import { requireOperator } from "@/lib/auth";
import { hasModule } from "@/lib/faro/entitlements";
import { getBillingSettings, listCharges } from "@/modules/billing/fees";
import { accountSummary } from "@/modules/billing/mp";
import { fieldClass } from "@/components/ds/primitives";
import { formatDate, formatMoney } from "@/lib/format";

export const metadata = { title: "Honorarios" };

const field = `mt-1 ${fieldClass}`;
const STATUS: Record<string, string> = { pendiente: "Pendiente", pagado: "Pagado", anulado: "Anulado" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const me = await requireOperator();
  if (!(await hasModule(me.studioId, "billing"))) return <p className="rounded-md border border-line bg-surface p-4 text-ui">La cobranza de honorarios viene con el plan Profesional.</p>;
  const estado = ["pendiente", "pagado", "anulado"].includes(sp.estado ?? "") ? sp.estado : "pendiente";
  const [rows, orgs, mp, settings] = await Promise.all([listCharges(me.studioId, { status: estado, organizationId: sp.org }), getDb().select({ id: organizations.id, name: organizations.name }).from(organizations).where(eq(organizations.studio_id, me.studioId)).orderBy(asc(organizations.name)), accountSummary(me.studioId), getBillingSettings(me.studioId)]);
  const today = new Date().toISOString().slice(0, 10);
  const total = rows.reduce((s, r) => s + r.c.amount, 0);
  const period = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 7);
  return (
    <div className="grid gap-5">
      <Feedback sp={sp} />
      {!mp && (
        <p className="rounded-md border border-line bg-surface p-4 text-ui">
          Conectá la cuenta de Mercado Pago del estudio en <Link href="/admin/honorarios/configuracion" className="underline">Configuración</Link> para mandar links de pago. Mientras tanto podés registrar los pagos a mano.
        </p>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <form action={generateAction} className="flex items-end gap-2">
          <label className="text-meta text-muted">
            Generar cargos de
            <input type="month" name="period" defaultValue={period} className={field} />
          </label>
          <SubmitButton variant="secondary" pendingText="…">Generar</SubmitButton>
        </form>
        <nav aria-label="Filtrar" className="ml-auto flex flex-wrap gap-1.5 text-meta">
          {["pendiente", "pagado", "anulado"].map((st) => (
            <Link key={st} href={`?estado=${st}`} aria-current={estado === st ? "page" : undefined} className={`rounded-full px-3 py-1 ${estado === st ? "bg-navy text-paper" : "border border-line"}`}>
              {STATUS[st]}
            </Link>
          ))}
        </nav>
      </div>
      <p className="text-ui text-muted">
        {rows.length} cargo{rows.length === 1 ? "" : "s"} · <span className="num">{formatMoney(total)}</span>
      </p>
      <ul className="divide-y divide-line rounded-md border border-line bg-surface">
        {rows.map(({ c, org }) => (
          <li key={c.id} className="grid gap-2 px-4 py-3" aria-label={`${org} · ${c.concept}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-ui font-medium">{org}</p>
                <p className="text-meta text-muted">
                  {c.concept} · vence el {formatDate(c.due_date, "numeric")}
                  {c.status === "pendiente" && c.due_date < today && <span className="text-[#8f2a1c]"> · vencido</span>}
                  {c.reminders_sent.length > 0 && ` · ${c.reminders_sent.length} recordatorio${c.reminders_sent.length === 1 ? "" : "s"}`}
                  {c.status === "pagado" && c.paid_at && ` · pagado el ${formatDate(c.paid_at, "numeric")} (${c.payment_method})`}
                </p>
              </div>
              <span className="num text-body">{formatMoney(c.amount)}</span>
            </div>
            {c.status === "pendiente" && (
              <div className="flex flex-wrap gap-1.5">
                {[
                  ["enviar", "Enviar cobro", "primary"],
                  ...(mp && !c.payment_url ? [["link", "Crear link", "secondary"]] : []),
                  ...(settings.issuer_organization_id ? [["factura", c.invoice_id ? "Ver factura" : "Preparar factura", "secondary"]] : []),
                ].map(([op, label, variant]) => (
                  <form key={op} action={chargeAction}>
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="op" value={op} />
                    <SubmitButton variant={variant as "primary" | "secondary"} pendingText="…">{label}</SubmitButton>
                  </form>
                ))}
                <form action={chargeAction} className="flex items-center gap-1.5">
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="op" value="pagado" />
                  <select name="method" aria-label="Medio de pago" className="h-9 rounded-md border border-line bg-surface px-2 text-meta">
                    <option value="transferencia">Transferencia</option>
                    <option value="efectivo">Efectivo</option>
                    <option value="otro">Otro</option>
                  </select>
                  <SubmitButton variant="secondary" pendingText="…">Marcar pagado</SubmitButton>
                </form>
                <form action={chargeAction}>
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="op" value="anular" />
                  <SubmitButton variant="danger" pendingText="…" confirm="¿Anular este cargo?" confirmLabel="Anular">Anular</SubmitButton>
                </form>
              </div>
            )}
            {c.payment_url && c.status === "pendiente" && <p className="break-all text-caption text-muted">Link: {c.payment_url}</p>}
          </li>
        ))}
      </ul>
      <form action={addChargeAction} className="grid gap-2 rounded-md border border-line bg-surface p-4 sm:grid-cols-[1.2fr_1.2fr_9rem_10rem_auto] sm:items-end">
        <p className="text-ui font-medium sm:col-span-5">Cobro suelto</p>
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
          <input name="concept" required placeholder="Ej.: DDJJ Ganancias" className={field} />
        </label>
        <label className="text-meta text-muted">
          Importe
          <input name="amount" inputMode="decimal" required className={field} />
        </label>
        <label className="text-meta text-muted">
          Vence
          <input name="due" type="date" required defaultValue={today} className={field} />
        </label>
        <SubmitButton pendingText="…">Agregar</SubmitButton>
      </form>
    </div>
  );
}
