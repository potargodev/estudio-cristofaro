"use client";

import { Camera } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { createRendicionAction, decideRendicionAction, reimburseAction, type RendicionState } from "@/app/portal/rendicion-actions";
import { CATEGORIES, CURRENCIES, todayAR } from "@/modules/gastos/constants";

const input = "h-11 w-full border border-line bg-surface px-3 text-[16px] focus:border-navy focus:outline-none";

function useResult(state: RendicionState, onOk?: () => void) {
  useEffect(() => {
    if (!state.message) return;
    if (state.ok) {
      toast.success(state.message);
      onOk?.();
    } else toast.error(state.message);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
}

export function RendicionForm() {
  const [state, action, pending] = useActionState<RendicionState, FormData>(createRendicionAction, {});
  const form = useRef<HTMLFormElement>(null);
  const [file, setFile] = useState("");
  useResult(state, () => {
    form.current?.reset();
    setFile("");
  });
  return (
    <form ref={form} action={action} className="grid gap-4">
      <label className="grid gap-1.5 text-[14px]">
        ¿En qué gastaste?
        <input name="description" required minLength={2} maxLength={140} placeholder="Taxi a lo de un cliente" className={input} />
      </label>
      <div className="grid grid-cols-[auto_1fr] gap-3">
        <select name="currency" aria-label="Moneda" className={input}>
          {CURRENCIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <input name="amount" inputMode="decimal" required placeholder="Importe" aria-label="Importe" className={`${input} text-[20px] tabular-nums`} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <input name="date" type="date" defaultValue={todayAR()} aria-label="Fecha" className={input} />
        <select name="category" aria-label="Categoría" defaultValue="transporte" className={input}>
          {Object.entries(CATEGORIES).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>
      <label className="flex cursor-pointer items-center gap-3 border border-dashed border-navy/40 bg-surface px-4 py-4 text-[15px]">
        <Camera className="size-5 text-rose-deep" aria-hidden />
        <span className="flex-1 truncate">{file || "Foto del ticket o la factura (obligatoria)"}</span>
        <input type="file" name="receipt" required accept="image/jpeg,image/png,application/pdf,.jpg,.jpeg,.png,.pdf" capture="environment" className="sr-only" onChange={(e) => setFile(e.target.files?.[0]?.name ?? "")} />
      </label>
      {state.message && !state.ok && (
        <p role="alert" className="text-[14px] text-danger">
          {state.message}
        </p>
      )}
      <button disabled={pending} className="h-12 bg-navy px-6 text-paper hover:bg-navy-deep disabled:opacity-60 sm:justify-self-start">
        {pending ? "Enviando…" : "Enviar a rendir"}
      </button>
    </form>
  );
}

export function DecideButtons({ id }: { id: string }) {
  const [state, action, pending] = useActionState<RendicionState, FormData>(decideRendicionAction, {});
  const [rejecting, setRejecting] = useState(false);
  useResult(state);
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="id" value={id} />
      {rejecting && <input name="reason" required placeholder="Motivo del rechazo" aria-label="Motivo del rechazo" className={input} />}
      <div className="flex flex-wrap gap-2">
        {!rejecting && (
          <button name="decision" value="aprobar" disabled={pending} className="h-10 bg-navy px-4 text-[14px] text-paper hover:bg-navy-deep">
            Aprobar
          </button>
        )}
        {rejecting ? (
          <>
            <button name="decision" value="rechazar" disabled={pending} className="h-10 bg-danger px-4 text-[14px] text-white">
              Confirmar rechazo
            </button>
            <button type="button" onClick={() => setRejecting(false)} className="h-10 px-3 text-[14px] text-muted">
              Cancelar
            </button>
          </>
        ) : (
          <button type="button" onClick={() => setRejecting(true)} className="h-10 border border-line px-4 text-[14px] hover:bg-navy-soft">
            Rechazar
          </button>
        )}
      </div>
    </form>
  );
}

export function ReimburseButton({ id }: { id: string }) {
  const [state, action, pending] = useActionState<RendicionState, FormData>(reimburseAction, {});
  useResult(state);
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <button disabled={pending} className="h-10 border border-navy/30 px-4 text-[14px] text-navy hover:bg-navy-soft">
        Marcar reintegrada
      </button>
    </form>
  );
}
