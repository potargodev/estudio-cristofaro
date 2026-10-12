import { CreditCard } from "lucide-react";
import { and, desc, eq } from "drizzle-orm";
import { cancelSubscriptionAction, payNowAction } from "@/app/suscripcion-actions";
import { Panel } from "@/components/admin/kit/Panel";
import { SubmitButton } from "@/components/admin/ui";
import { getDb } from "@/db";
import { mp_payments } from "@/db/schema";
import { getPlans } from "@/lib/faro/entitlements";
import { graceEnds } from "@/modules/billing/core";
import { accountSummary } from "@/modules/billing/mp";
import { ensureSubscription } from "@/modules/billing/subscriptions";
import { formatDate, formatMoney } from "@/lib/format";

// Suscripción del tenant a Faro (Plan y facturación): estado, próximo débito,
// cambios programados, pagos y acciones (autorizar débito, pagar, cancelar).

const STATUS: Record<string, string> = { prueba: "En prueba", activa: "Activa", morosa: "Pago pendiente", suspendida: "Suspendida", cancelada: "Cancelada" };

export async function SubscriptionPanel({ studioId }: { studioId: string }) {
  const [sub, faroMp, plans] = await Promise.all([ensureSubscription(studioId), accountSummary(null), getPlans()]);
  const payments = await getDb().select().from(mp_payments).where(and(eq(mp_payments.account, "faro"), eq(mp_payments.studio_id, studioId))).orderBy(desc(mp_payments.created_at)).limit(12);
  const name = (k: string | null) => plans.find((p) => p.key === k)?.name ?? k;
  // Plan gratis (Inicial incluido): sin prueba, sin vencimiento y sin débito
  const free = !!plans.find((p) => p.key === sub.plan_key)?.free && !sub.pending_plan_key;
  return (
    <Panel title="Suscripción y pagos" icon={CreditCard}>
      <dl className="grid gap-3 text-ui sm:grid-cols-3">
        <div>
          <dt className="text-caption text-muted">Estado</dt>
          <dd className="font-medium" data-estado={sub.status}>
            {STATUS[sub.status] ?? sub.status}
          </dd>
        </div>
        <div>
          <dt className="text-caption text-muted">{free ? "Precio" : sub.status === "prueba" ? "La prueba termina" : "Pagado hasta"}</dt>
          <dd className="num">{free ? "Gratis, sin vencimiento" : formatDate(sub.status === "prueba" ? sub.trial_ends_at : sub.current_period_end, "numeric")}</dd>
        </div>
        <div>
          <dt className="text-caption text-muted">Débito automático</dt>
          <dd>{free ? "Sin débito (plan gratis)" : sub.mp_status === "authorized" ? `Autorizado · ${formatMoney(sub.amount)} ${sub.interval === "anual" ? "por año" : "por mes"}` : sub.mp_status === "pending" ? "Falta autorizarlo" : sub.mp_status === "cancelled" ? "Cancelado" : "Sin débito"}</dd>
        </div>
      </dl>
      {sub.pending_plan_key && sub.pending_plan_key !== sub.plan_key && (
        <p className="mt-3 text-meta text-muted">
          Cambio programado: {name(sub.pending_plan_key)} ({sub.pending_interval ?? sub.interval}){sub.current_period_end ? ` desde el ${formatDate(sub.current_period_end, "numeric")}` : " al autorizar el débito"}.
        </p>
      )}
      {sub.cancel_at_period_end && sub.status === "activa" && <p className="mt-3 text-meta text-[#7a5410]">Cancelaste la suscripción: el plan sigue hasta el {formatDate(sub.current_period_end, "numeric")}.</p>}
      {sub.status === "morosa" && sub.past_due_since && (
        <p role="alert" className="mt-3 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-meta text-danger">
          Mercado Pago no pudo cobrar el plan. Regularizalo antes del {formatDate(graceEnds(sub.past_due_since), "numeric")} para que la cuenta no se suspenda.
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        {sub.mp_status === "pending" && sub.init_point && (
          <a href={sub.init_point} className="inline-flex h-(--control-h) items-center rounded-md bg-navy px-4 text-ui font-medium text-paper">
            Autorizar el débito en Mercado Pago
          </a>
        )}
        {(sub.status === "morosa" || sub.status === "suspendida") && (
          <form action={payNowAction}>
            <SubmitButton pendingText="…">Pagar ahora</SubmitButton>
          </form>
        )}
        {(sub.status === "activa" || sub.status === "prueba") && sub.amount > 0 && !sub.cancel_at_period_end && (
          <form action={cancelSubscriptionAction}>
            <SubmitButton variant="danger" pendingText="…" confirm="¿Cancelar la suscripción? Seguís con tu plan hasta el final del período pago." confirmLabel="Cancelar suscripción">
              Cancelar suscripción
            </SubmitButton>
          </form>
        )}
      </div>
      {!faroMp && <p className="mt-3 text-meta text-muted">El cobro en línea todavía no está configurado: elegí el plan y el equipo de Faro te contacta.</p>}
      {payments.length > 0 && (
        <ul className="mt-4 divide-y divide-line border-t border-line text-meta">
          {payments.map((p) => (
            <li key={p.id} className="flex justify-between gap-2 py-2">
              <span>
                {formatDate(p.created_at, "numeric")} · {p.status === "approved" ? "Aprobado" : p.status === "rejected" ? "Rechazado" : p.status}
              </span>
              <span className="num">{formatMoney(p.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
