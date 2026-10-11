"use client";

import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { saveDraftAction } from "@/app/facturacion/actions";
import { SubmitButton } from "@/components/admin/ui";
import { allowedTypes, CBTE_TYPES, DOC_TYPES, IVA_CONDITIONS } from "@/modules/arca/config";
import { cn } from "@/lib/utils";

export interface FormCustomer {
  id: string;
  name: string;
  docType: number;
  docNumber: string;
  ivaCondition: string;
  email: string | null;
}
export interface FormProduct {
  id: string;
  description: string;
  unitPrice: number;
  ivaRate: number | null;
}
interface Line {
  description: string;
  quantity: string;
  unitPrice: string;
  ivaRate: string;
}

const field = "mt-1 h-10 w-full rounded-md border border-line bg-surface px-3 text-[15px] text-ink focus:border-navy focus:outline-none";
const label = "text-[13px] font-medium text-ink/80";
const num = (v: string) => Number(v.replace(/\./g, "").replace(",", ".")) || 0;
const money = (n: number) => `$ ${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Borrador de factura o nota: se guarda, se revisa y recién después se emite */
export function InvoiceForm({
  hidden,
  issuerCondition,
  customers,
  products,
  points,
  initial,
}: {
  hidden: Record<string, string>;
  issuerCondition: string;
  customers: FormCustomer[];
  products: FormProduct[];
  points: number[];
  initial?: {
    id: string;
    cbteType: number;
    pointOfSale: number;
    issueDate: string;
    concept: number;
    serviceFrom: string | null;
    serviceTo: string | null;
    paymentDue: string | null;
    customer: { docType: number; docNumber: string; name: string; ivaCondition: string; email: string | null; address: string | null };
    items: { description: string; quantity: number; unitPrice: number; ivaRate: number | null }[];
    currency: string;
    exchangeRate: number;
    associated: string | null;
    notes: string | null;
  };
}) {
  const today = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  const [customerId, setCustomerId] = useState<string>("");
  const [cust, setCust] = useState(initial?.customer ?? { docType: 80, docNumber: "", name: "", ivaCondition: "consumidor_final", email: "", address: "" });
  const picked = customers.find((c) => c.id === customerId);
  const receiver = picked?.ivaCondition ?? cust.ivaCondition;
  const types = allowedTypes(issuerCondition, receiver);
  const isNote = !!initial?.associated;
  const typeOptions = isNote ? [initial!.cbteType] : types.filter((t) => CBTE_TYPES[t].kind === "factura");
  const [cbteType, setCbteType] = useState<number>(initial?.cbteType ?? typeOptions[0]);
  const effectiveType = typeOptions.includes(cbteType) ? cbteType : typeOptions[0];
  const letter = CBTE_TYPES[effectiveType]?.letter;
  const discriminate = letter === "A" || letter === "B";
  const [concept, setConcept] = useState(initial?.concept ?? 2);
  const [lines, setLines] = useState<Line[]>(
    initial?.items.map((i) => ({ description: i.description, quantity: String(i.quantity), unitPrice: String(i.unitPrice), ivaRate: String(i.ivaRate ?? 21) })) ?? [{ description: "", quantity: "1", unitPrice: "", ivaRate: "21" }],
  );
  const [currency, setCurrency] = useState(initial?.currency ?? "PES");
  const totals = useMemo(() => {
    let net = 0;
    let iva = 0;
    for (const l of lines) {
      const base = num(l.quantity) * num(l.unitPrice);
      net += base;
      if (discriminate) iva += (base * Number(l.ivaRate || 21)) / 100;
    }
    return { net, iva, total: net + iva };
  }, [lines, discriminate]);
  const items = JSON.stringify(lines.map((l) => ({ description: l.description, quantity: num(l.quantity), unitPrice: num(l.unitPrice), ivaRate: discriminate ? Number(l.ivaRate || 21) : null })));
  const set = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  return (
    <form action={saveDraftAction} className="grid gap-6">
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {initial && <input type="hidden" name="id" value={initial.id} />}
      {initial?.associated && <input type="hidden" name="associated" value={initial.associated} />}
      <input type="hidden" name="items" value={items} />
      <input type="hidden" name="cbte_type" value={effectiveType} />

      <section aria-labelledby="cliente" className="rounded-md border border-line bg-surface p-4 sm:p-5">
        <h2 id="cliente" className="text-[16px] font-semibold">
          Cliente
        </h2>
        {customers.length > 0 && (
          <label className="mt-3 block">
            <span className={label}>Cliente frecuente</span>
            <select name="customer_id" value={customerId} onChange={(e) => setCustomerId(e.target.value)} className={field}>
              <option value="">Uno nuevo (cargalo abajo)</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {DOC_TYPES[c.docType]} {c.docNumber !== "0" ? c.docNumber : ""}
                </option>
              ))}
            </select>
          </label>
        )}
        {!picked && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="sm:col-span-2">
              <span className={label}>Nombre o razón social</span>
              <input name="customer_name" required value={cust.name} onChange={(e) => setCust({ ...cust, name: e.target.value })} className={field} />
            </label>
            <label>
              <span className={label}>Condición frente al IVA</span>
              <select name="iva_condition" value={cust.ivaCondition} onChange={(e) => setCust({ ...cust, ivaCondition: e.target.value })} className={field}>
                {Object.entries(IVA_CONDITIONS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-[7rem_1fr] gap-2">
              <label>
                <span className={label}>Documento</span>
                <select name="doc_type" value={cust.docType} onChange={(e) => setCust({ ...cust, docType: Number(e.target.value) })} className={field}>
                  {Object.entries(DOC_TYPES).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className={label}>Número</span>
                <input name="doc_number" inputMode="numeric" disabled={cust.docType === 99} value={cust.docType === 99 ? "" : cust.docNumber} onChange={(e) => setCust({ ...cust, docNumber: e.target.value })} className={field} placeholder={cust.docType === 80 ? "CUIT sin guiones" : ""} />
              </label>
            </div>
            <label>
              <span className={label}>Mail (para mandarle el comprobante)</span>
              <input name="customer_email" type="email" value={cust.email ?? ""} onChange={(e) => setCust({ ...cust, email: e.target.value })} className={field} />
            </label>
            <label>
              <span className={label}>Domicilio (opcional)</span>
              <input name="customer_address" value={cust.address ?? ""} onChange={(e) => setCust({ ...cust, address: e.target.value })} className={field} />
            </label>
            <label className="flex items-center gap-2 text-[14px] sm:col-span-2">
              <input type="checkbox" name="save_customer" defaultChecked className="size-4 accent-navy" /> Guardarlo como cliente frecuente
            </label>
          </div>
        )}
      </section>

      <section aria-labelledby="comprobante" className="rounded-md border border-line bg-surface p-4 sm:p-5">
        <h2 id="comprobante" className="text-[16px] font-semibold">
          Comprobante
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <label>
            <span className={label}>Tipo</span>
            <select value={effectiveType} onChange={(e) => setCbteType(Number(e.target.value))} disabled={isNote} className={field}>
              {typeOptions.map((t) => (
                <option key={t} value={t}>
                  {CBTE_TYPES[t].label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className={label}>Punto de venta</span>
            {points.length ? (
              <select name="point_of_sale" defaultValue={initial?.pointOfSale ?? points[0]} className={field}>
                {points.map((p) => (
                  <option key={p} value={p}>
                    {String(p).padStart(5, "0")}
                  </option>
                ))}
              </select>
            ) : (
              <input name="point_of_sale" type="number" min={1} defaultValue={initial?.pointOfSale ?? 1} className={field} />
            )}
          </label>
          <label>
            <span className={label}>Fecha</span>
            <input name="issue_date" type="date" defaultValue={initial?.issueDate ?? today} className={field} />
          </label>
          <label>
            <span className={label}>Qué facturás</span>
            <select name="concept" value={concept} onChange={(e) => setConcept(Number(e.target.value))} className={field}>
              <option value={2}>Servicios</option>
              <option value={1}>Productos</option>
              <option value={3}>Productos y servicios</option>
            </select>
          </label>
          {concept !== 1 && (
            <>
              <label>
                <span className={label}>Período desde</span>
                <input name="service_from" type="date" defaultValue={initial?.serviceFrom ?? `${today.slice(0, 8)}01`} className={field} />
              </label>
              <label>
                <span className={label}>Período hasta</span>
                <input name="service_to" type="date" defaultValue={initial?.serviceTo ?? today} className={field} />
              </label>
              <label>
                <span className={label}>Vencimiento del pago</span>
                <input name="payment_due" type="date" defaultValue={initial?.paymentDue ?? today} className={field} />
              </label>
            </>
          )}
          <label>
            <span className={label}>Moneda</span>
            <select name="currency" value={currency} onChange={(e) => setCurrency(e.target.value)} className={field}>
              <option value="PES">Pesos</option>
              <option value="DOL">Dólares</option>
            </select>
          </label>
          {currency === "DOL" && (
            <label>
              <span className={label}>Tipo de cambio</span>
              <input name="exchange_rate" inputMode="decimal" defaultValue={initial?.exchangeRate ?? ""} className={field} />
            </label>
          )}
        </div>
      </section>

      <section aria-labelledby="items" className="rounded-md border border-line bg-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="items" className="text-[16px] font-semibold">
            Ítems
          </h2>
          {products.length > 0 && (
            <select
              aria-label="Agregar un producto frecuente"
              value=""
              onChange={(e) => {
                const p = products.find((x) => x.id === e.target.value);
                if (p) setLines((ls) => [...ls.filter((l) => l.description || l.unitPrice), { description: p.description, quantity: "1", unitPrice: String(p.unitPrice), ivaRate: String(p.ivaRate ?? 21) }]);
              }}
              className="h-9 rounded-md border border-line bg-surface px-2 text-[14px]"
            >
              <option value="">+ Producto frecuente</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.description} · {money(p.unitPrice)}
                </option>
              ))}
            </select>
          )}
        </div>
        <ul className="mt-3 grid gap-3">
          {lines.map((l, i) => (
            <li key={i} className={cn("grid gap-2 rounded-md border border-line p-3 sm:grid-cols-[1fr_5rem_8rem_auto] sm:items-end", discriminate && "sm:grid-cols-[1fr_5rem_8rem_6rem_auto]")}>
              <label>
                <span className={label}>Descripción</span>
                <input value={l.description} onChange={(e) => set(i, { description: e.target.value })} className={field} required />
              </label>
              <label>
                <span className={label}>Cant.</span>
                <input inputMode="decimal" value={l.quantity} onChange={(e) => set(i, { quantity: e.target.value })} className={field} />
              </label>
              <label>
                <span className={label}>Precio unit.</span>
                <input inputMode="decimal" value={l.unitPrice} onChange={(e) => set(i, { unitPrice: e.target.value })} className={field} placeholder="0,00" />
              </label>
              {discriminate && (
                <label>
                  <span className={label}>IVA</span>
                  <select value={l.ivaRate} onChange={(e) => set(i, { ivaRate: e.target.value })} className={field}>
                    {["21", "10.5", "27", "5", "2.5", "0"].map((r) => (
                      <option key={r} value={r}>
                        {r.replace(".", ",")}%
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <button type="button" onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((_, j) => j !== i) : ls))} aria-label="Quitar el ítem" className="grid size-10 place-items-center rounded-md border border-line text-muted hover:text-danger">
                <Trash2 className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
        <button type="button" onClick={() => setLines((ls) => [...ls, { description: "", quantity: "1", unitPrice: "", ivaRate: "21" }])} className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-md border border-line px-3 text-[14px] hover:border-muted">
          <Plus className="size-4" aria-hidden /> Agregar ítem
        </button>
        <dl className="mt-4 grid justify-end gap-1 text-right text-[14px]">
          {discriminate && (
            <>
              <div className="flex justify-end gap-6">
                <dt className="text-muted">Neto</dt>
                <dd className="num">{money(totals.net)}</dd>
              </div>
              <div className="flex justify-end gap-6">
                <dt className="text-muted">IVA</dt>
                <dd className="num">{money(totals.iva)}</dd>
              </div>
            </>
          )}
          <div className="flex justify-end gap-6 text-[18px]">
            <dt className="font-medium">Total</dt>
            <dd className="num">{money(totals.total)}</dd>
          </div>
        </dl>
      </section>

      <label>
        <span className={label}>Notas internas (no salen en el comprobante)</span>
        <textarea name="notes" defaultValue={initial?.notes ?? ""} rows={2} className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-[15px]" />
      </label>
      <div>
        <SubmitButton pendingText="Guardando…">Guardar borrador</SubmitButton>
        <p className="mt-2 text-[13px] text-muted">Todavía no se manda nada a ARCA: en el paso siguiente revisás y emitís.</p>
      </div>
    </form>
  );
}
