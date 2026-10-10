"use client";

import { Camera, Plus, Sparkles, Trash2 } from "lucide-react";
import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createExpenseAction, fxAction, readReceiptAction, type FormState } from "@/app/grupos/actions";
import { cn } from "@/lib/utils";
import { CATEGORIES, CURRENCIES, FX_SOURCES, RECURRENCES, SPLIT_METHODS, formatMoney, todayAR, type FxSource } from "@/modules/gastos/constants";
import { parseAmount, splitExpense, type SplitMethod, type SplitSpec } from "@/modules/gastos/core/split";

// Formulario rápido de gasto, pensado para el celular: importe grande con
// teclado numérico, quién pagó (uno o varios), cómo se divide con vista
// previa en vivo y foto del ticket. Los importes viajan en centavos; el
// servidor vuelve a validar todo.

interface Member {
  id: string;
  name: string;
}

const input = "h-11 w-full border border-line bg-surface px-3 text-[16px] focus:border-navy focus:outline-none";
const chip = (on: boolean) => cn("border px-3.5 py-2 text-[14px] transition-colors", on ? "border-navy bg-navy text-paper" : "border-line bg-surface hover:border-navy/50");
const num = (v: string) => {
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

export function ExpenseForm({ groupId, members, meId, baseCurrency, hasContext, receiptAI }: { groupId: string; members: Member[]; meId: string; baseCurrency: string; hasContext: boolean; receiptAI: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createExpenseAction, {});
  const [amountText, setAmountText] = useState("");
  const [currency, setCurrency] = useState(baseCurrency);
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("otros");
  const [date, setDate] = useState(todayAR());
  const [multiPayer, setMultiPayer] = useState(false);
  const [payer, setPayer] = useState(meId);
  const [payerAmounts, setPayerAmounts] = useState<Record<string, string>>({});
  const [method, setMethod] = useState<SplitMethod>("iguales");
  const [equal, setEqual] = useState<string[]>(members.map((m) => m.id));
  const [values, setValues] = useState<Record<string, string>>({});
  const [items, setItems] = useState<{ description: string; amount: string; members: string[] }[]>([{ description: "", amount: "", members: members.map((m) => m.id) }]);
  const [fxSource, setFxSource] = useState<FxSource>("oficial");
  const [fxRateText, setFxRateText] = useState("");
  const [fxLoading, startFx] = useTransition();
  const [notes, setNotes] = useState("");
  const [isCompany, setIsCompany] = useState(false);
  const [isDeductible, setIsDeductible] = useState(false);
  const [recurrence, setRecurrence] = useState("");
  const [fileName, setFileName] = useState("");
  const [reading, startReading] = useTransition();
  const [readMsg, setReadMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const amount = parseAmount(amountText) ?? 0;
  const foreign = currency !== baseCurrency;

  // Cotización automática (oficial o MEP) al cambiar de moneda
  useEffect(() => {
    if (!foreign || fxSource === "manual") return;
    startFx(async () => {
      const r = await fxAction(currency, baseCurrency, fxSource);
      setFxRateText(r ? String(Math.round(r * 10000) / 10000) : "");
    });
  }, [foreign, currency, baseCurrency, fxSource]);

  const spec: SplitSpec = useMemo(() => {
    switch (method) {
      case "iguales":
        return { method, members: equal };
      case "porcentaje":
        return { method, percents: Object.fromEntries(Object.entries(values).map(([k, v]) => [k, num(v)]).filter(([, v]) => (v as number) > 0)) };
      case "partes":
        return { method, parts: Object.fromEntries(Object.entries(values).map(([k, v]) => [k, Math.round(num(v))]).filter(([, v]) => (v as number) > 0)) };
      case "montos":
        return { method, amounts: Object.fromEntries(Object.entries(values).map(([k, v]) => [k, parseAmount(v) ?? 0]).filter(([, v]) => (v as number) > 0)) };
      case "items":
        return { method, items: items.filter((i) => i.amount).map((i) => ({ description: i.description, amount: parseAmount(i.amount) ?? 0, members: i.members })) };
    }
  }, [method, equal, values, items]);

  const payers: Record<string, number> = useMemo(() => {
    if (!multiPayer) return amount ? { [payer]: amount } : {};
    return Object.fromEntries(Object.entries(payerAmounts).map(([k, v]) => [k, parseAmount(v) ?? 0]).filter(([, v]) => (v as number) > 0));
  }, [multiPayer, payer, payerAmounts, amount]);
  const paidSum = Object.values(payers).reduce((s, v) => s + v, 0);

  const preview = useMemo(() => {
    if (!amount) return { shares: null, error: "" };
    try {
      return { shares: splitExpense(amount, spec), error: "" };
    } catch (e) {
      return { shares: null, error: (e as Error).message };
    }
  }, [amount, spec]);
  const payerError = multiPayer && amount && paidSum !== amount ? `Lo pagado suma ${formatMoney(paidSum, currency)} y el gasto es de ${formatMoney(amount, currency)}.` : "";

  const payload = JSON.stringify({
    description,
    amount,
    currency,
    date,
    category,
    payers,
    split: spec,
    fx: foreign ? { source: fxSource, rate: fxRateText || null } : null,
    notes,
    isCompany,
    isDeductible,
    recurrence: recurrence || null,
  });

  const readTicket = () => {
    const f = fileRef.current?.files?.[0];
    if (!f) return;
    const fd = new FormData();
    fd.set("receipt", f);
    startReading(async () => {
      const r = await readReceiptAction(fd);
      if ("error" in r) return setReadMsg(r.error);
      if (r.description) setDescription(r.description);
      if (r.amount) setAmountText((r.amount / 100).toLocaleString("es-AR", { minimumFractionDigits: 2 }));
      if (r.currency) setCurrency(r.currency);
      if (r.date) setDate(r.date);
      if (r.category) setCategory(r.category);
      setReadMsg("Leímos el ticket: revisá los datos antes de guardar.");
    });
  };

  const setVal = (id: string, v: string) => setValues((x) => ({ ...x, [id]: v }));
  const valueHint = method === "porcentaje" ? `${Object.values(values).reduce((s, v) => s + num(v), 0)}% de 100%` : method === "montos" ? `${formatMoney(Object.values(values).reduce((s, v) => s + (parseAmount(v) ?? 0), 0), currency)} de ${formatMoney(amount, currency)}` : "";

  return (
    <form action={action} className="grid grid-cols-[minmax(0,1fr)] gap-7">
      <input type="hidden" name="group" value={groupId} />
      <input type="hidden" name="payload" value={payload} />

      {/* Importe */}
      <div className="border border-line bg-surface p-4">
        <label htmlFor="g-amount" className="text-[13px] text-muted">
          Importe
        </label>
        <div className="mt-1 flex items-center gap-2">
          <select aria-label="Moneda" value={currency} onChange={(e) => setCurrency(e.target.value)} className="h-14 border border-line bg-canvas px-2 text-[16px]">
            {CURRENCIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <input
            id="g-amount"
            inputMode="decimal"
            autoComplete="off"
            autoFocus
            required
            placeholder="0"
            value={amountText}
            onChange={(e) => setAmountText(e.target.value.replace(/[^\d.,]/g, ""))}
            className="h-14 min-w-0 flex-1 bg-transparent font-display text-[40px] tabular-nums leading-none focus:outline-none"
          />
        </div>
        {foreign && (
          <div className="mt-3 grid gap-2 border-t border-line pt-3">
            <div className="flex flex-wrap gap-2">
              {(Object.keys(FX_SOURCES) as FxSource[]).map((s) => (
                <button key={s} type="button" onClick={() => setFxSource(s)} className={chip(fxSource === s)}>
                  {FX_SOURCES[s]}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-[14px]">
              1 {currency} =
              <input
                inputMode="decimal"
                value={fxRateText}
                onChange={(e) => {
                  setFxSource("manual");
                  setFxRateText(e.target.value);
                }}
                placeholder={fxLoading ? "Buscando…" : "Cotización"}
                aria-label="Cotización"
                className="h-10 w-32 border border-line bg-canvas px-2 tabular-nums"
              />
              {baseCurrency}
            </label>
            {amount > 0 && num(fxRateText) > 0 && (
              <p className="text-[13px] text-muted">
                ≈ {formatMoney(Math.round(amount * num(fxRateText)), baseCurrency)} · se guarda la cotización y su fuente
              </p>
            )}
            {!fxLoading && fxSource !== "manual" && !fxRateText && <p className="text-[13px] text-muted">No pudimos traer la cotización: cargala a mano o guardalo sin convertir.</p>}
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
        <label className="grid gap-1.5 text-[14px]">
          ¿En qué?
          <input value={description} onChange={(e) => setDescription(e.target.value)} required minLength={2} maxLength={140} placeholder="Cena, nafta, alquiler…" className={input} />
        </label>
        <label className="grid gap-1.5 text-[14px]">
          Fecha
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={input} />
        </label>
      </div>
      <label className="grid gap-1.5 text-[14px]">
        Categoría
        <select value={category} onChange={(e) => setCategory(e.target.value)} className={input}>
          {Object.entries(CATEGORIES).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>

      {/* Quién pagó */}
      <fieldset className="min-w-0">
        <legend className="mb-2 text-[14px] font-medium">¿Quién pagó?</legend>
        {!multiPayer ? (
          <div className="flex flex-wrap gap-2">
            {members.map((m) => (
              <button key={m.id} type="button" onClick={() => setPayer(m.id)} className={chip(payer === m.id)} aria-pressed={payer === m.id}>
                {m.id === meId ? "Yo" : m.name}
              </button>
            ))}
          </div>
        ) : (
          <ul className="grid gap-2">
            {members.map((m) => (
              <li key={m.id} className="flex items-center gap-3">
                <span className="flex-1 text-[15px]">{m.id === meId ? "Yo" : m.name}</span>
                <input inputMode="decimal" aria-label={`Pagó ${m.name}`} value={payerAmounts[m.id] ?? ""} onChange={(e) => setPayerAmounts((x) => ({ ...x, [m.id]: e.target.value }))} placeholder="0" className="h-11 w-36 border border-line bg-surface px-3 text-right tabular-nums" />
              </li>
            ))}
          </ul>
        )}
        <button type="button" onClick={() => setMultiPayer((v) => !v)} className="mt-2 text-[14px] text-rose-deep underline-offset-4 hover:underline">
          {multiPayer ? "Pagó una sola persona" : "Pagaron varios"}
        </button>
        {payerError && <p className="mt-1 text-[13px] text-danger">{payerError}</p>}
      </fieldset>

      {/* Cómo se divide */}
      <fieldset className="min-w-0">
        <legend className="mb-2 text-[14px] font-medium">¿Cómo se divide?</legend>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          {(Object.keys(SPLIT_METHODS) as SplitMethod[]).map((m) => (
            <button key={m} type="button" onClick={() => setMethod(m)} className={cn(chip(method === m), "shrink-0")} aria-pressed={method === m}>
              {SPLIT_METHODS[m]}
            </button>
          ))}
        </div>

        {method === "iguales" && (
          <ul className="mt-3 grid gap-1">
            {members.map((m) => (
              <li key={m.id}>
                <label className="flex items-center gap-3 py-1.5 text-[15px]">
                  <input type="checkbox" className="size-5 accent-navy" checked={equal.includes(m.id)} onChange={(e) => setEqual((x) => (e.target.checked ? [...x, m.id] : x.filter((y) => y !== m.id)))} />
                  {m.id === meId ? "Yo" : m.name}
                </label>
              </li>
            ))}
          </ul>
        )}
        {(method === "porcentaje" || method === "partes" || method === "montos") && (
          <ul className="mt-3 grid gap-2">
            {members.map((m) => (
              <li key={m.id} className="flex items-center gap-3">
                <span className="flex-1 text-[15px]">{m.id === meId ? "Yo" : m.name}</span>
                <input inputMode="decimal" aria-label={`${SPLIT_METHODS[method]}: ${m.name}`} value={values[m.id] ?? ""} onChange={(e) => setVal(m.id, e.target.value)} placeholder={method === "porcentaje" ? "%" : method === "partes" ? "partes" : "0"} className="h-11 w-32 border border-line bg-surface px-3 text-right tabular-nums" />
              </li>
            ))}
            {valueHint && <li className="text-right text-[13px] text-muted">{valueHint}</li>}
          </ul>
        )}
        {method === "items" && (
          <div className="mt-3 grid gap-3">
            {items.map((it, i) => (
              <div key={i} className="grid gap-2 border border-line bg-surface p-3">
                <div className="flex gap-2">
                  <input aria-label={`Ítem ${i + 1}`} placeholder="Ítem" value={it.description} onChange={(e) => setItems((x) => x.map((y, j) => (j === i ? { ...y, description: e.target.value } : y)))} className={input} />
                  <input aria-label={`Importe ítem ${i + 1}`} inputMode="decimal" placeholder="0" value={it.amount} onChange={(e) => setItems((x) => x.map((y, j) => (j === i ? { ...y, amount: e.target.value } : y)))} className="h-11 w-28 border border-line bg-canvas px-2 text-right tabular-nums" />
                  <button type="button" aria-label="Quitar ítem" onClick={() => setItems((x) => x.filter((_, j) => j !== i))} className="px-2 text-muted hover:text-danger">
                    <Trash2 className="size-4" />
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {members.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setItems((x) => x.map((y, j) => (j === i ? { ...y, members: y.members.includes(m.id) ? y.members.filter((z) => z !== m.id) : [...y.members, m.id] } : y)))}
                      className={cn("px-2.5 py-1 text-[13px]", it.members.includes(m.id) ? "bg-navy text-paper" : "border border-line")}
                    >
                      {m.id === meId ? "Yo" : m.name}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <button type="button" onClick={() => setItems((x) => [...x, { description: "", amount: "", members: members.map((m) => m.id) }])} className="inline-flex items-center gap-1.5 justify-self-start text-[14px] text-rose-deep">
              <Plus className="size-4" /> Agregar ítem
            </button>
            <p className="text-[13px] text-muted">Lo que no está en los ítems (propina, servicio) se reparte en proporción a lo que consumió cada uno.</p>
          </div>
        )}

        {/* Vista previa en vivo */}
        <div className="mt-4 border-l-2 border-gold bg-rose-soft px-4 py-3" aria-live="polite" data-testid="split-preview">
          {preview.shares ? (
            <ul className="grid gap-1 text-[14px]">
              {members
                .filter((m) => preview.shares![m.id])
                .map((m) => (
                  <li key={m.id} className="flex justify-between">
                    <span>{m.id === meId ? "Vos" : m.name}</span>
                    <span className="tabular-nums">{formatMoney(preview.shares![m.id], currency)}</span>
                  </li>
                ))}
            </ul>
          ) : (
            <p className={cn("text-[14px]", preview.error ? "text-danger" : "text-muted")}>{preview.error || "Escribí el importe y vas a ver cuánto le toca a cada uno."}</p>
          )}
        </div>
      </fieldset>

      {/* Ticket */}
      <div className="grid gap-2">
        <span className="text-[14px] font-medium">Ticket o factura (opcional)</span>
        <label className="flex cursor-pointer items-center gap-3 border border-dashed border-navy/40 bg-surface px-4 py-4 text-[15px] hover:bg-navy-soft/50">
          <Camera className="size-5 text-rose-deep" aria-hidden />
          <span className="min-w-0 flex-1 truncate">{fileName || "Sacá una foto o elegí un archivo"}</span>
          <input ref={fileRef} type="file" name="receipt" accept="image/jpeg,image/png,application/pdf,.jpg,.jpeg,.png,.pdf" capture="environment" className="sr-only" onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")} />
        </label>
        {receiptAI && fileName && (
          <button type="button" onClick={readTicket} disabled={reading} className="inline-flex items-center gap-2 justify-self-start text-[14px] text-rose-deep disabled:opacity-60">
            <Sparkles className="size-4" aria-hidden />
            {reading ? "Leyendo el ticket…" : "Completar con IA desde el ticket"}
          </button>
        )}
        {readMsg && <p className="text-[13px] text-muted">{readMsg}</p>}
      </div>

      <details className="border-y border-line py-3">
        <summary className="cursor-pointer text-[14px] font-medium">Más opciones</summary>
        <div className="mt-4 grid gap-4">
          <label className="grid gap-1.5 text-[14px]">
            Notas
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={1000} className="border border-line bg-surface px-3 py-2 text-[16px]" />
          </label>
          <label className="grid gap-1.5 text-[14px]">
            Repetir
            <select value={recurrence} onChange={(e) => setRecurrence(e.target.value)} className={input}>
              <option value="">No se repite</option>
              {Object.entries(RECURRENCES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          {hasContext && (
            <div className="grid gap-2">
              <label className="flex items-center gap-2 text-[14px]">
                <input type="checkbox" checked={isCompany} onChange={(e) => setIsCompany(e.target.checked)} className="size-4 accent-navy" />
                Es un gasto de la empresa
              </label>
              <label className="flex items-center gap-2 text-[14px]">
                <input type="checkbox" checked={isDeductible} onChange={(e) => setIsDeductible(e.target.checked)} className="size-4 accent-navy" />
                Es deducible
              </label>
              <p className="text-[13px] text-muted">Marcado, va a los gastos de la contabilidad conectada con su comprobante (y lo ve el estudio).</p>
            </div>
          )}
        </div>
      </details>

      {state.message && (
        <p role="alert" className="text-[14px] text-danger">
          {state.message}
        </p>
      )}
      <div className="sticky bottom-0 -mx-4 border-t border-line bg-canvas/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
        <button type="submit" disabled={pending || !amount || !!preview.error || !!payerError} className="h-14 w-full bg-navy text-[17px] text-paper hover:bg-navy-deep disabled:opacity-50 sm:w-auto sm:px-10">
          {pending ? "Guardando…" : amount ? `Guardar ${formatMoney(amount, currency)}` : "Guardar gasto"}
        </button>
      </div>
    </form>
  );
}
