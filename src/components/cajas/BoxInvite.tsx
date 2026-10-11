"use client";

import { Link2, RefreshCw } from "lucide-react";
import { useActionState } from "react";
import { boxLinkAction, type LinkState } from "@/app/cajas/actions";
import { ShareLink } from "@/components/gastos/invite";

/** Invitar a la caja compartida por enlace o WhatsApp (para entrar hay que tener cuenta) */
export function BoxInvite({ boxId, boxName, owner }: { boxId: string; boxName: string; owner: boolean }) {
  const [state, action, pending] = useActionState<LinkState, FormData>(boxLinkAction, {});
  return (
    <div className="grid gap-3">
      {!state.link && (
        <form action={action}>
          <input type="hidden" name="box" value={boxId} />
          <button disabled={pending} className="inline-flex h-10 items-center gap-2 rounded-md bg-navy px-4 text-ui text-paper hover:bg-navy-deep disabled:opacity-60">
            <Link2 className="size-4" aria-hidden /> {pending ? "Generando…" : "Invitar con un enlace"}
          </button>
        </form>
      )}
      {state.link && <ShareLink link={state.link} text={`Sumate a nuestra caja «${boxName}» en Faro para llevar la cuenta juntos:`} />}
      {state.link && owner && (
        <form action={action}>
          <input type="hidden" name="box" value={boxId} />
          <input type="hidden" name="renew" value="1" />
          <button disabled={pending} className="inline-flex items-center gap-1.5 text-meta text-muted underline-offset-4 hover:text-ink hover:underline">
            <RefreshCw className="size-3.5" aria-hidden /> Renovar (el enlace anterior deja de servir)
          </button>
        </form>
      )}
      {state.message && (
        <p role="alert" className="text-ui text-danger">
          {state.message}
        </p>
      )}
    </div>
  );
}
