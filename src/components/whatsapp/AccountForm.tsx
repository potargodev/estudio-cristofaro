import { SubmitButton } from "@/components/admin/ui";

const field = "mt-1 block h-10 w-full rounded-md border border-line bg-surface px-3 text-[14px] text-ink";

/** Datos de un número de WhatsApp Business (Meta → WhatsApp → Configuración de la API) */
export function WaCredentialFields({ a }: { a: { phone_number_id: string | null; waba_id: string | null; display_phone: string | null; access_token_enc: string | null; app_secret_enc: string | null } | null }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-[13px] text-muted">
        Phone number ID
        <input name="phone_number_id" inputMode="numeric" defaultValue={a?.phone_number_id ?? ""} className={field} />
      </label>
      <label className="text-[13px] text-muted">
        ID de la cuenta de WhatsApp Business (WABA)
        <input name="waba_id" inputMode="numeric" defaultValue={a?.waba_id ?? ""} className={field} />
      </label>
      <label className="text-[13px] text-muted">
        Número que ven los clientes
        <input name="display_phone" defaultValue={a?.display_phone ?? ""} placeholder="+54 9 11 5555-0000" className={field} />
      </label>
      <label className="text-[13px] text-muted">
        Token de acceso permanente {a?.access_token_enc && <span className="text-[12px]">(guardado: dejalo vacío para no cambiarlo)</span>}
        <input name="access_token" type="password" autoComplete="off" className={field} />
      </label>
      <label className="text-[13px] text-muted sm:col-span-2">
        Secreto de la app (valida los webhooks) {a?.app_secret_enc && <span className="text-[12px]">(guardado)</span>}
        <input name="app_secret" type="password" autoComplete="off" className={field} />
      </label>
    </div>
  );
}

export function WaSubmit({ label = "Guardar" }: { label?: string }) {
  return <SubmitButton pendingText="Guardando…">{label}</SubmitButton>;
}
