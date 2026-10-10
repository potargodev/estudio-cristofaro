"use client";

import { ExternalLink } from "lucide-react";
import { useActionState, useState } from "react";
import { settleAction, type FormState } from "@/app/gastos/actions";
import { cn } from "@/lib/utils";
import { CURRENCIES, SETTLEMENT_METHODS, type SettlementMethodKey } from "@/modules/gastos/constants";
import { CopyButton } from "./forms";

interface Member {
  id: string;
  name: string;
  alias: string | null;
  cvu: string | null;
}

const input = "h-12 w-full border border-line bg-surface px-3 text-[16px] focus:border-navy focus:outline-none";

export function SettleForm({ groupId, members, meId, initial }: { groupId: string; members: Member[]; meId: string; initial: { from: string; to: string; amount: string; currency: string } }) {
  const [state, action, pending] = useActionState<FormState, FormData>(settleAction, {});
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [method, setMethod] = useState<SettlementMethodKey>("transferencia");
  const creditor = members.find((m) => m.id === to);
  const label = (m: Member) => (m.id === meId ? `${m.name} (vos)` : m.name);

  if (state.ok && state.link)
    return (
      <div className="grid gap-4 border border-gold/60 bg-[#fbf7ee] p-5">
        <p className="text-[15px]">{state.message}</p>
        <a href={state.link} target="_blank" rel="noopener noreferrer" className="inline-flex h-12 items-center justify-center gap-2 bg-[#009ee3] px-5 text-white hover:opacity-90" data-testid="mp-link">
          Pagar con Mercado Pago
          <ExternalLink className="size-4" aria-hidden />
        </a>
        <p className="text-[13px] text-muted">Integración de prueba: el cobro real con Mercado Pago llega más adelante. El pago queda informado hasta que la otra persona lo confirme.</p>
        <a href={`/gastos/g/${groupId}?tab=saldos`} className="text-[14px] text-rose-deep underline-offset-4 hover:underline">
          Volver a los saldos
        </a>
      </div>
    );

  return (
    <form action={action} className="grid gap-6">
      <input type="hidden" name="group" value={groupId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1.5 text-[14px]">
          Paga
          <select name="from" value={from} onChange={(e) => setFrom(e.target.value)} className={input}>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {label(m)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5 text-[14px]">
          Cobra
          <select name="to" value={to} onChange={(e) => setTo(e.target.value)} className={input}>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {label(m)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex items-center gap-2 border border-line bg-surface p-3">
        <select name="currency" defaultValue={initial.currency} aria-label="Moneda" className="h-14 border border-line bg-paper px-2">
          {CURRENCIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <input name="amount" inputMode="decimal" required defaultValue={initial.amount} aria-label="Importe" placeholder="0" className="h-14 min-w-0 flex-1 bg-transparent font-display text-[36px] tabular-nums focus:outline-none" />
      </div>
      <fieldset>
        <legend className="mb-2 text-[14px] font-medium">¿Cómo?</legend>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(SETTLEMENT_METHODS) as SettlementMethodKey[]).map((k) => (
            <label key={k} className={cn("cursor-pointer border px-4 py-2.5 text-[14px]", method === k ? "border-navy bg-navy text-paper" : "border-line bg-surface")}>
              <input type="radio" name="method" value={k} checked={method === k} onChange={() => setMethod(k)} className="sr-only" />
              {SETTLEMENT_METHODS[k]}
            </label>
          ))}
        </div>
      </fieldset>
      {method === "transferencia" && creditor && (
        <div className="grid gap-2 border-l-2 border-gold bg-[#fbf7ee] px-4 py-3 text-[14px]">
          {creditor.alias || creditor.cvu ? (
            <>
              <p>Datos de {creditor.name} para transferir:</p>
              {creditor.alias && (
                <p className="flex flex-wrap items-center gap-2">
                  Alias <code className="font-medium">{creditor.alias}</code> <CopyButton value={creditor.alias} label="Copiar alias" />
                </p>
              )}
              {creditor.cvu && (
                <p className="flex flex-wrap items-center gap-2">
                  CVU <code className="font-medium">{creditor.cvu}</code> <CopyButton value={creditor.cvu} label="Copiar CVU" />
                </p>
              )}
            </>
          ) : (
            <p className="text-muted">{creditor.name} todavía no cargó su alias o CVU en el grupo.</p>
          )}
        </div>
      )}
      <label className="grid gap-1.5 text-[14px]">
        Comprobante (opcional)
        <input type="file" name="receipt" accept="image/jpeg,image/png,application/pdf,.jpg,.jpeg,.png,.pdf" className="text-[14px]" />
      </label>
      <label className="grid gap-1.5 text-[14px]">
        Nota (opcional)
        <input name="note" maxLength={500} className={input} />
      </label>
      {state.message && !state.ok && (
        <p role="alert" className="text-[14px] text-danger">
          {state.message}
        </p>
      )}
      <button disabled={pending} className="h-14 bg-navy text-[17px] text-paper hover:bg-navy-deep disabled:opacity-60 sm:w-auto sm:justify-self-start sm:px-10">
        {pending ? "Registrando…" : method === "mercado_pago" ? "Generar link de pago" : "Registrar pago"}
      </button>
    </form>
  );
}
