import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/admin/kit/PageHeader";
import { SubmitButton } from "@/components/admin/ui";
import { Feedback } from "@/components/app/Feedback";
import { confirmWaAction, optInWaAction, removeWaAction, startWaAction } from "@/app/portal/whatsapp-actions";
import { requireMember } from "@/lib/auth";
import { maskPhone } from "@/modules/whatsapp/core";
import { accountFor, contactOf } from "@/modules/whatsapp/server";

export const metadata: Metadata = { title: "WhatsApp" };

const field = "mt-1 block h-11 w-full rounded-md border border-line bg-surface px-3 text-[15px] text-ink";

/** WhatsApp del cliente: verificar su número, recibir avisos y mandar comprobantes */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const me = await requireMember();
  const [account, contact] = await Promise.all([accountFor(me.studioId), contactOf({ id: me.id, email: me.email, studioId: me.studioId, organizationId: me.organizationId })]);
  return (
    <div className="max-w-2xl">
      <Link href="/portal/mas" className="text-[13px] text-muted hover:text-ink">
        ← Mi cuenta
      </Link>
      <PageHeader title="WhatsApp" description="Recibí los avisos del estudio y mandá fotos o PDF de tus comprobantes por WhatsApp." className="mt-2" />
      <Feedback sp={sp} />
      {!account ? (
        <p className="rounded-md border border-line bg-surface p-4 text-[15px] text-muted">Tu estudio todavía no activó WhatsApp. Mientras tanto, te avisamos por mail.</p>
      ) : contact?.verified_at ? (
        <div className="grid gap-4">
          <div className="rounded-md border border-line bg-surface p-4 text-[15px]">
            <p>
              Tu número verificado: <span className="num">{maskPhone(contact.phone)}</span>
            </p>
            <p className="mt-2 text-[14px] text-muted">
              Escribí o mandá una foto del comprobante a <span className="num text-ink">{account.display_phone ?? "el número del estudio"}</span>. Los mensajes llegan como solicitud y los comprobantes, a tus documentos para que el estudio los revise.
            </p>
          </div>
          <form action={optInWaAction} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-surface p-4">
            <input type="hidden" name="on" value={contact.opt_in_avisos ? "0" : "1"} />
            <p className="text-[15px]">
              Avisos por WhatsApp (vencimientos, documentos y respuestas): <span className="font-medium">{contact.opt_in_avisos ? "prendidos" : "apagados"}</span>
            </p>
            <SubmitButton variant="secondary" pendingText="…">{contact.opt_in_avisos ? "Apagar" : "Prender"}</SubmitButton>
          </form>
          <form action={removeWaAction}>
            <SubmitButton variant="danger" pendingText="…" confirm="¿Quitar tu número? Dejás de recibir avisos por WhatsApp.">Quitar mi número</SubmitButton>
          </form>
        </div>
      ) : (
        <div className="grid gap-4">
          <form action={startWaAction} className="grid gap-3 rounded-md border border-line bg-surface p-4">
            <label className="text-[14px] text-muted">
              Tu celular (con código de área, sin 0 ni 15)
              <input name="phone" type="tel" inputMode="tel" required autoComplete="tel" defaultValue={contact ? `+${contact.phone}` : ""} placeholder="11 2233 4455" className={field} />
            </label>
            <div>
              <SubmitButton pendingText="Enviando…">{contact?.code_expires_at ? "Mandar otro código" : "Mandarme un código"}</SubmitButton>
            </div>
          </form>
          {contact?.code_expires_at && (
            <form action={confirmWaAction} className="grid gap-3 rounded-md border border-line bg-surface p-4">
              <label className="text-[14px] text-muted">
                Código que te llegó por WhatsApp
                <input name="code" inputMode="numeric" autoComplete="one-time-code" required maxLength={6} pattern="\d{6}" className={`${field} num tracking-[0.3em]`} />
              </label>
              <div>
                <SubmitButton pendingText="Verificando…">Verificar</SubmitButton>
              </div>
            </form>
          )}
          <p className="text-[13px] text-muted">Al verificar aceptás recibir avisos del estudio por WhatsApp. Los podés apagar cuando quieras.</p>
        </div>
      )}
    </div>
  );
}
