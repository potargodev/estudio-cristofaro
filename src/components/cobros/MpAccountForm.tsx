import { SubmitButton } from "@/components/admin/ui";
import type { accountSummary } from "@/modules/billing/mp";

// Credenciales de Mercado Pago de una cuenta (Faro o un tenant). El access
// token y el secreto de webhooks se guardan cifrados y nunca se muestran.

const field = "mt-1 block h-9 w-full rounded-md border border-line bg-surface px-2 text-[14px] text-ink";

export function MpAccountForm({ summary, save, remove, webhookUrl, canEdit = true }: { summary: Awaited<ReturnType<typeof accountSummary>>; save: (fd: FormData) => Promise<void>; remove: (fd: FormData) => Promise<void>; webhookUrl: string; canEdit?: boolean }) {
  return (
    <div className="grid gap-3 rounded-md border border-line bg-surface p-4">
      <p className="text-[14px]">
        {summary ? (
          <>
            Cuenta de Mercado Pago: <strong>{summary.nickname ?? "conectada"}</strong> · {summary.status === "ok" ? "funciona" : summary.status === "error" ? <span className="text-[#8f2a1c]">con error</span> : "sin probar"}
            {summary.testedAt && ` · probada el ${summary.testedAt.toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}`}
            {!summary.hasSecret && <span className="text-[#8f2a1c]"> · falta la clave secreta de webhooks (sin ella no se acreditan los pagos)</span>}
          </>
        ) : (
          "Todavía no hay una cuenta de Mercado Pago conectada."
        )}
      </p>
      {summary?.lastError && <p className="text-[13px] text-[#8f2a1c]">{summary.lastError}</p>}
      <p className="text-[13px] text-muted">
        En Mercado Pago → Tus integraciones → tu aplicación: copiá el <strong>Access Token</strong> de producción y, en Webhooks, configurá la URL <code className="break-all">{webhookUrl}</code> con los eventos «Pagos» y «Planes y suscripciones», y copiá la <strong>clave secreta</strong>.
      </p>
      {canEdit && !summary?.fromEnv && (
        <form action={save} className="grid gap-2 sm:grid-cols-3 sm:items-end">
          <label className="text-[13px] text-muted">
            Access token
            <input name="access_token" required autoComplete="off" placeholder="APP_USR-…" className={field} />
          </label>
          <label className="text-[13px] text-muted">
            Clave secreta de webhooks
            <input name="webhook_secret" autoComplete="off" placeholder={summary?.hasSecret ? "(sin cambios)" : ""} className={field} />
          </label>
          <label className="text-[13px] text-muted">
            Public key (opcional)
            <input name="public_key" autoComplete="off" placeholder="APP_USR-…" className={field} />
          </label>
          <div className="sm:col-span-3">
            <SubmitButton pendingText="Probando…">Guardar y probar</SubmitButton>
          </div>
        </form>
      )}
      {canEdit && summary && !summary.fromEnv && (
        <form action={remove}>
          <SubmitButton variant="danger" pendingText="…" confirm="¿Desconectar la cuenta de Mercado Pago? Los links ya enviados dejan de acreditarse en Faro." confirmLabel="Desconectar">
            Desconectar
          </SubmitButton>
        </form>
      )}
    </div>
  );
}
