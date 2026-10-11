import { and, count, desc, eq, isNotNull } from "drizzle-orm";
import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/kit/PageHeader";
import { StatusBadge } from "@/components/admin/kit/StatusBadge";
import { SubmitButton } from "@/components/admin/ui";
import { Feedback } from "@/components/app/Feedback";
import { WaCredentialFields } from "@/components/whatsapp/AccountForm";
import { getDb } from "@/db";
import { webhook_events, whatsapp_accounts } from "@/db/schema";
import { requireFaro } from "@/lib/auth";
import { getSiteUrl } from "@/lib/runtime-config";
import { platformAccount, templatesOf } from "@/modules/whatsapp/server";
import { pauseFaroWaAction, saveFaroWaAction, syncFaroWaAction } from "../../whatsapp-actions";

export const metadata: Metadata = { title: "WhatsApp" };

/** Número de WhatsApp Business de Faro, sus plantillas y los últimos webhooks */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const me = await requireFaro();
  const owner = me.faroRole === "faro_owner";
  const a = await platformAccount();
  const db = getDb();
  const [templates, [shared], events] = await Promise.all([
    a ? templatesOf(a.id) : Promise.resolve([]),
    db.select({ n: count() }).from(whatsapp_accounts).where(and(eq(whatsapp_accounts.mode, "compartido"), isNotNull(whatsapp_accounts.studio_id))),
    db.select().from(webhook_events).where(eq(webhook_events.provider, "whatsapp")).orderBy(desc(webhook_events.created_at)).limit(20),
  ]);
  return (
    <div className="grid gap-5">
      <PageHeader level={2} title="WhatsApp" description={`El número de WhatsApp Business de Faro. Lo usan compartido ${shared?.n ?? 0} estudios; los que tienen número propio lo cargan en Configuración → Avanzado.`} className="mb-0" />
      <Feedback sp={sp} />
      <section className="rounded-md border border-line bg-surface p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[16px] font-semibold">Número de Faro</h2>
          {a && <StatusBadge status={a.status === "activa" ? "activa" : "pausada"} label={a.status === "activa" ? "Activo" : "Pausado"} />}
        </div>
        {owner ? (
          <form action={saveFaroWaAction} className="grid gap-3">
            <WaCredentialFields a={a} />
            <div>
              <SubmitButton>Guardar</SubmitButton>
            </div>
          </form>
        ) : (
          <p className="text-[14px] text-muted">{a ? `Número ${a.display_phone ?? a.phone_number_id}.` : "Sin configurar."} Solo el dueño de Faro lo cambia.</p>
        )}
        {a && (
          <p className="mt-3 text-[13px] text-muted">
            Webhook: <span className="break-all font-mono text-[12px] text-ink">{getSiteUrl()}/api/whatsapp/webhook</span> · token de verificación <span className="font-mono text-[12px] text-ink">{a.verify_token}</span>
          </p>
        )}
        {a?.last_error && <p className="mt-2 text-[13px] text-[#8f2a1c]">Último error: {a.last_error}</p>}
        {a && owner && (
          <div className="mt-3 flex flex-wrap gap-2">
            <form action={syncFaroWaAction}>
              <SubmitButton variant="secondary" pendingText="Sincronizando…">Sincronizar plantillas</SubmitButton>
            </form>
            <form action={pauseFaroWaAction}>
              <SubmitButton variant="secondary" pendingText="…">{a.status === "activa" ? "Pausar" : "Reanudar"}</SubmitButton>
            </form>
          </div>
        )}
      </section>
      <section aria-label="Plantillas" className="grid gap-2">
        <h2 className="text-[16px] font-semibold">Plantillas</h2>
        <p className="text-[13px] text-muted">Faro usa faro_codigo (verificación), faro_respuesta_solicitud y faro_aviso_general. Se crean y aprueban en Meta; acá solo se sincronizan.</p>
        {templates.length === 0 ? (
          <p className="text-[14px] text-muted">Sin plantillas sincronizadas.</p>
        ) : (
          <ul className="divide-y divide-line rounded-md border border-line bg-surface text-[13px]">
            {templates.map((t) => (
              <li key={t.id} className="flex flex-wrap justify-between gap-2 px-4 py-2">
                <span className="font-mono">{t.name}</span>
                <span className="text-muted">{t.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-label="Últimos webhooks" className="grid gap-2">
        <h2 className="text-[16px] font-semibold">Últimos webhooks</h2>
        {events.length === 0 ? (
          <p className="text-[14px] text-muted">Todavía no llegó ninguno.</p>
        ) : (
          <ul className="divide-y divide-line rounded-md border border-line bg-surface text-[13px]">
            {events.map((e) => (
              <li key={e.id} className="flex flex-wrap justify-between gap-2 px-4 py-2">
                <span>
                  {e.created_at.toLocaleString("es-AR", { dateStyle: "short", timeStyle: "medium" })} · {e.account === "faro" ? "Faro" : "estudio"} · {e.topic ?? "—"}
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
