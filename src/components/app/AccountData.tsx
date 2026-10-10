import { Download, LogOut } from "lucide-react";
import { requestAccountClosureAction } from "@/app/actions/account";

/** Mis datos: exportarlos y pedir la baja de la cuenta (términos §10, Ley 25.326) */
export function AccountData({ status }: { status?: string }) {
  return (
    <section aria-labelledby="mis-datos" className="rounded-lg border border-line bg-surface p-5">
      <h2 id="mis-datos" className="text-[17px] font-semibold text-ink">
        Tus datos
      </h2>
      <p className="mt-1 text-[14px] text-muted">Podés descargar una copia de tus datos cuando quieras y pedir la baja de la cuenta.</p>
      {status === "1" && <p role="status" className="mt-3 rounded-md bg-navy-soft px-3 py-2 text-[14px]">Recibimos tu pedido de baja. Te escribimos para confirmarlo; antes podés descargar tus datos.</p>}
      {status === "error" && <p role="alert" className="mt-3 text-[14px] text-danger">Confirmá que querés dar de baja la cuenta.</p>}
      <a href="/api/cuenta/exportar" className="mt-4 inline-flex h-10 items-center gap-2 rounded-md border border-line px-4 text-[14px] font-medium hover:border-muted">
        <Download className="size-4" aria-hidden /> Descargar mis datos
      </a>
      <details className="mt-4">
        <summary className="cursor-pointer text-[14px] text-muted">Dar de baja la cuenta</summary>
        <form action={requestAccountClosureAction} className="mt-3 grid gap-3">
          <label className="text-[13px] text-muted">
            ¿Por qué te vas? (opcional)
            <textarea name="reason" rows={2} maxLength={1000} className="mt-1 w-full rounded-md border border-line bg-canvas px-3 py-2 text-[14px] text-ink" />
          </label>
          <label className="flex items-start gap-2 text-[14px]">
            <input type="checkbox" name="confirm" required className="mt-0.5 size-4 accent-navy" /> Quiero dar de baja mi cuenta. Entiendo que después se borran mis datos, salvo lo que la ley obliga a conservar.
          </label>
          <div>
            <button type="submit" className="inline-flex h-10 items-center gap-2 rounded-md border border-danger/40 px-4 text-[14px] font-medium text-danger hover:bg-danger/10">
              <LogOut className="size-4" aria-hidden /> Pedir la baja
            </button>
          </div>
        </form>
      </details>
    </section>
  );
}
