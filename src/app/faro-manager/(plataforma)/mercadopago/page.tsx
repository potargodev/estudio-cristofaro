import { desc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/kit/PageHeader";
import { Feedback } from "@/components/app/Feedback";
import { MpAccountForm } from "@/components/cobros/MpAccountForm";
import { getDb } from "@/db";
import { webhook_events } from "@/db/schema";
import { requireFaro } from "@/lib/auth";
import { accountSummary, notificationUrl } from "@/modules/billing/mp";
import { deleteFaroMpAction, saveFaroMpAction } from "../../mp-actions";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Mercado Pago" };

/** Cuenta de Mercado Pago de Faro (cobra las suscripciones) y los últimos webhooks */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const me = await requireFaro();
  const [summary, events] = await Promise.all([accountSummary(null), getDb().select().from(webhook_events).where(eq(webhook_events.provider, "mercadopago")).orderBy(desc(webhook_events.created_at)).limit(30)]);
  return (
    <div className="grid gap-5">
      <PageHeader level={2} title="Mercado Pago" description="La cuenta con la que Faro cobra las suscripciones de los planes. Cada estudio conecta la suya para sus honorarios." className="mb-0" />
      <Feedback sp={sp} />
      <MpAccountForm summary={summary} save={saveFaroMpAction} remove={deleteFaroMpAction} webhookUrl={notificationUrl(null)} canEdit={me.faroRole === "faro_owner"} />
      <section aria-label="Últimos webhooks" className="grid gap-2">
        <h2 className="text-lead font-semibold">Últimos webhooks</h2>
        {events.length === 0 ? (
          <p className="text-ui text-muted">Todavía no llegó ninguno.</p>
        ) : (
          <ul className="divide-y divide-line rounded-md border border-line bg-surface text-meta">
            {events.map((e) => (
              <li key={e.id} className="flex flex-wrap justify-between gap-2 px-4 py-2">
                <span>
                  {formatDate(e.created_at, "timestamp")} · {e.account === "faro" ? "Faro" : "estudio"} · {e.topic ?? "—"} {e.data_id ?? ""}
                </span>
                <span className={e.result === "rechazado" || e.result === "error" ? "text-[#8f2a1c]" : "text-muted"}>
                  {e.result}
                  {e.error ? ` · ${e.error}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
