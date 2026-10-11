import { eq } from "drizzle-orm";
import { payNowAction } from "@/app/suscripcion-actions";
import { SubmitButton } from "@/components/admin/ui";
import { getDb } from "@/db";
import { faro_subscriptions } from "@/db/schema";
import { accountSummary } from "@/modules/billing/mp";

/** Cuenta suspendida por falta de pago: el dueño puede reactivarla pagando con Mercado Pago */
export async function PayToReactivate({ studioId, owner, error }: { studioId: string; owner: boolean; error?: string }) {
  const [[sub], online] = await Promise.all([getDb().select().from(faro_subscriptions).where(eq(faro_subscriptions.studio_id, studioId)), accountSummary(null)]);
  if (!sub || !online || !owner || sub.amount <= 0) return null;
  return (
    <div className="mt-4 grid gap-2">
      {error && (
        <p role="alert" className="text-ui text-[#8f2a1c]">
          {error}
        </p>
      )}
      <form action={payNowAction}>
        <SubmitButton pendingText="…">Pagar y reactivar con Mercado Pago</SubmitButton>
      </form>
    </div>
  );
}
