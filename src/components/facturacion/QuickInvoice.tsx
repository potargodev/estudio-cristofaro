"use client";

import { Zap } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { padronLookupAction, quickEmitAction } from "@/app/facturacion/actions";
import { SubmitButton, chipClass, fieldClass } from "@/components/ds";
import { cn } from "@/lib/utils";

// Factura rápida (§2.p, B10): un solo paso pensado para el celular. Importe,
// cliente (consumidor final por defecto, los recientes con un toque o una
// CUIT que se completa con el padrón) y descripción (las de siempre con un
// toque). Enter emite; Esc limpia. Se mide desde que se abre hasta el CAE.

interface Customer {
  id: string;
  name: string;
  doc: string;
}

export function QuickInvoice({ hidden, customers, descriptions, letter }: { hidden: Record<string, string>; customers: Customer[]; descriptions: string[]; letter: string }) {
  const [started] = useState(() => Date.now());
  const [nonce] = useState(() => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`);
  const [amount, setAmount] = useState("");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [name, setName] = useState("");
  const [doc, setDoc] = useState("");
  const [iva, setIva] = useState("consumidor_final");
  const [desc, setDesc] = useState(descriptions[0] ?? "");
  const [lookup, setLookup] = useState<string | null>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    amountRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAmount("");
        setCustomer(null);
        setName("");
        setDoc("");
        amountRef.current?.focus();
      }
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) formRef.current?.requestSubmit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // CUIT completa: nombre y condición del padrón de ARCA
  useEffect(() => {
    const d = doc.replace(/\D/g, "");
    if (d.length !== 11 || customer) return;
    let alive = true;
    setLookup("Buscando en ARCA…");
    padronLookupAction(d).then((r) => {
      if (!alive) return;
      if (r.ok) {
        setName(r.name);
        setIva(r.ivaCondition);
        setLookup(null);
      } else setLookup(r.error);
    });
    return () => {
      alive = false;
    };
  }, [doc, customer]);

  const shown = useMemo(() => {
    const n = Number(amount.replace(/\./g, "").replace(",", "."));
    return n > 0 ? n.toLocaleString("es-AR", { style: "currency", currency: "ARS" }) : null;
  }, [amount]);
  const who = customer?.name ?? (name.trim() || "Consumidor final");

  return (
    <form ref={formRef} action={quickEmitAction} className="grid max-w-xl gap-5">
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <input type="hidden" name="started_at" value={started} />
      <input type="hidden" name="nonce" value={nonce} />
      <input type="hidden" name="customer_id" value={customer?.id ?? ""} />
      <input type="hidden" name="iva_condition" value={iva} />
      <label className="text-meta text-muted">
        Importe final
        <input
          ref={amountRef}
          name="amount"
          inputMode="decimal"
          autoComplete="off"
          required
          placeholder="0,00"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ""))}
          className={cn(fieldClass, "num mt-1 text-title")}
        />
      </label>

      <fieldset className="grid gap-2">
        <legend className="text-meta text-muted">Cliente</legend>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => (setCustomer(null), setName(""), setDoc(""))} className={chipClass(!customer && !name && !doc)}>
            Consumidor final
          </button>
          {customers.slice(0, 6).map((c) => (
            <button key={c.id} type="button" onClick={() => setCustomer(c)} className={chipClass(customer?.id === c.id)}>
              {c.name}
            </button>
          ))}
        </div>
        {!customer && (
          <div className="grid gap-2 sm:grid-cols-2">
            <input name="doc" value={doc} onChange={(e) => setDoc(e.target.value)} inputMode="numeric" autoComplete="off" placeholder="CUIT o DNI (opcional)" aria-label="CUIT o DNI" className={fieldClass} />
            <input name="customer_name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre (opcional)" aria-label="Nombre del cliente" className={fieldClass} />
          </div>
        )}
        {lookup && <p className="text-meta text-muted">{lookup}</p>}
      </fieldset>

      <label className="text-meta text-muted">
        Descripción
        <input name="description" list="quick-desc" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Servicios" className={cn(fieldClass, "mt-1")} />
        <datalist id="quick-desc">
          {descriptions.map((d) => (
            <option key={d} value={d} />
          ))}
        </datalist>
      </label>
      {descriptions.length > 1 && (
        <div className="-mt-3 flex flex-wrap gap-2">
          {descriptions.slice(0, 4).map((d) => (
            <button key={d} type="button" onClick={() => setDesc(d)} className={chipClass(desc === d)}>
              {d}
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-2">
        <SubmitButton pendingText="Emitiendo en ARCA…">
          <Zap className="size-4" aria-hidden /> Emitir Factura {letter} {shown ? `por ${shown}` : ""} a {who}
        </SubmitButton>
        <p className="text-caption text-muted">Al tocar Emitir, la factura sale en ARCA. Enter (o Ctrl + Enter) emite · Esc limpia.</p>
      </div>
    </form>
  );
}
