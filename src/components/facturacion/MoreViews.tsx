import { FileClock, FileText, Repeat } from "lucide-react";
import { createDocAction, docAction, recurringAction } from "@/app/facturacion/actions";
import { EmptyState, Panel, SubmitButton, ToneBadge, chipClass, fieldClass } from "@/components/ds";
import { WhatsAppShare } from "@/components/share/WhatsAppShare";
import { formatAmount, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { DOC_TYPES, IVA_CONDITIONS } from "@/modules/arca/config";
import type { IssuerScope } from "@/modules/arca/server";
import { DOC_KINDS, listDocs, listRecurring, type DocKind } from "@/modules/facturacion-plus/server";
import { Feedback, ScopeFields } from "./views";

// Presupuestos, remitos y recibos, y facturas recurrentes (§2.p, B3). Los
// primeros no son comprobantes de ARCA: tienen su PDF, su link y su número;
// el presupuesto pasa a factura con un clic. Las recurrentes se arman solas
// el día elegido (en borrador, o emitidas con el interruptor del Agente).

type SP = Record<string, string | undefined>;
const field = cn(fieldClass, "mt-1");
const lbl = "text-meta text-muted";
const STATUS: Record<string, { label: string; tone: "ok" | "progress" | "neutral" | "danger" | "done" }> = { emitido: { label: "Emitido", tone: "neutral" }, aceptado: { label: "Aceptado", tone: "ok" }, facturado: { label: "Facturado", tone: "done" }, anulado: { label: "Anulado", tone: "neutral" } };

function Items() {
  return (
    <div className="grid gap-2 sm:col-span-2">
      {[0, 1, 2].map((i) => (
        <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_5rem_8rem]">
          <input name={`desc${i}`} required={i === 0} placeholder={i === 0 ? "Descripción" : "Otro ítem (opcional)"} aria-label={`Descripción del ítem ${i + 1}`} className={cn(fieldClass, "col-span-2 sm:col-span-1")} />
          <input name={`cant${i}`} inputMode="decimal" placeholder="Cant." defaultValue={i === 0 ? "1" : ""} aria-label={`Cantidad del ítem ${i + 1}`} className={fieldClass} />
          <input name={`precio${i}`} inputMode="decimal" placeholder="Precio" aria-label={`Precio del ítem ${i + 1}`} className={fieldClass} />
        </div>
      ))}
    </div>
  );
}

function Customer() {
  return (
    <>
      <label className={cn(lbl, "sm:col-span-2")}>
        Cliente
        <input name="customer_name" required className={field} />
      </label>
      <label className={lbl}>
        Documento
        <select name="doc_type" defaultValue="99" className={field}>
          {Object.entries(DOC_TYPES).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <label className={lbl}>
        Número
        <input name="doc_number" inputMode="numeric" className={field} />
      </label>
      <label className={lbl}>
        Condición frente al IVA
        <select name="iva_condition" defaultValue="consumidor_final" className={field}>
          {Object.entries(IVA_CONDITIONS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <label className={lbl}>
        Mail (opcional)
        <input name="customer_email" type="email" className={field} />
      </label>
    </>
  );
}

export async function DocsView({ scope, sp, volver }: { scope: IssuerScope; sp: SP; volver: string }) {
  const kind: DocKind = (["presupuesto", "remito", "recibo"] as const).find((k) => k === sp.tipo) ?? "presupuesto";
  const list = await listDocs(scope, kind);
  const back = `${volver}${volver.includes("?") ? "&" : "?"}tipo=${kind}`;
  return (
    <div className="grid gap-4">
      <Feedback sp={sp} />
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(DOC_KINDS) as DocKind[]).map((k) => (
          <a key={k} href={`${volver}${volver.includes("?") ? "&" : "?"}tipo=${k}`} aria-current={k === kind ? "page" : undefined} className={chipClass(k === kind)}>
            {DOC_KINDS[k]}s
          </a>
        ))}
      </div>
      <Panel title={`Nuevo ${DOC_KINDS[kind].toLowerCase()}`} icon={FileText}>
        <form action={createDocAction} className="grid gap-3 sm:grid-cols-2">
          <ScopeFields scope={scope} volver={back} />
          <input type="hidden" name="kind" value={kind} />
          <Customer />
          <Items />
          {kind === "presupuesto" && (
            <label className={lbl}>
              Válido hasta
              <input type="date" name="valid_until" className={field} />
            </label>
          )}
          {kind === "recibo" && (
            <label className={lbl}>
              Medio de pago
              <input name="payment_method" placeholder="Transferencia" className={field} />
            </label>
          )}
          <label className={cn(lbl, "sm:col-span-2")}>
            Notas (opcional)
            <input name="notes" maxLength={500} className={field} />
          </label>
          <p className="text-caption text-muted sm:col-span-2">No es un comprobante de ARCA: el PDF dice «Documento no válido como factura».{kind === "presupuesto" ? " Cuando lo aceptan, lo pasás a factura con un clic." : ""}</p>
          <div className="sm:col-span-2">
            <SubmitButton pendingText="Guardando…">Guardar</SubmitButton>
          </div>
        </form>
      </Panel>
      {list.length === 0 ? (
        <EmptyState icon={FileText} title={`Todavía no hay ${DOC_KINDS[kind].toLowerCase()}s`} text="Cargá el primero arriba." />
      ) : (
        <ul className="divide-y divide-line rounded-md border border-line bg-surface">
          {list.map((d) => (
            <li key={d.id} className="grid gap-2 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0">
                  <span className="block truncate text-body text-ink">
                    {DOC_KINDS[d.kind as DocKind]} {String(d.number).padStart(8, "0")} · {d.customer_name}
                  </span>
                  <span className="block text-meta text-muted">
                    {formatDate(d.issue_date, "numeric")}
                    {d.valid_until ? ` · válido hasta el ${formatDate(d.valid_until, "numeric")}` : ""}
                  </span>
                </span>
                <span className="flex items-center gap-3">
                  {d.kind !== "remito" && <span className="num text-body">{formatAmount(Number(d.total))}</span>}
                  <ToneBadge tone={STATUS[d.status]?.tone ?? "neutral"}>{STATUS[d.status]?.label ?? d.status}</ToneBadge>
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <a href={`/api/comprobantes/${d.id}/pdf`} target="_blank" rel="noreferrer" className={chipClass(false)}>
                  PDF
                </a>
                {d.kind === "presupuesto" && !["facturado", "anulado"].includes(d.status) && (
                  <form action={docAction}>
                    <ScopeFields scope={scope} volver={back} />
                    <input type="hidden" name="id" value={d.id} />
                    <input type="hidden" name="op" value="facturar" />
                    <SubmitButton pendingText="…">Pasar a factura</SubmitButton>
                  </form>
                )}
                {!["facturado", "anulado"].includes(d.status) && (
                  <form action={docAction}>
                    <ScopeFields scope={scope} volver={back} />
                    <input type="hidden" name="id" value={d.id} />
                    <input type="hidden" name="op" value="anular" />
                    <SubmitButton variant="secondary" pendingText="…" confirm="¿Anularlo? Queda en la lista como anulado." confirmLabel="Anular">
                      Anular
                    </SubmitButton>
                  </form>
                )}
              </div>
              {d.status !== "anulado" && <WhatsAppShare type="comercial" ids={[d.id]} back={back} showLinks={false} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export async function RecurringView({ scope, sp, volver }: { scope: IssuerScope; sp: SP; volver: string }) {
  const list = await listRecurring(scope);
  return (
    <div className="grid gap-4">
      <Feedback sp={sp} />
      <Panel title="Nueva factura recurrente" icon={Repeat}>
        <form action={recurringAction} className="grid gap-3 sm:grid-cols-2">
          <ScopeFields scope={scope} volver={volver} />
          <label className={cn(lbl, "sm:col-span-2")}>
            Nombre
            <input name="name" required placeholder="Abono mensual de mantenimiento" className={field} />
          </label>
          <Customer />
          <Items />
          <label className={lbl}>
            Primera factura
            <input type="date" name="start" required className={field} />
          </label>
          <label className={lbl}>
            Día de cada mes
            <input name="day" type="number" min={1} max={28} defaultValue={1} className={field} />
          </label>
          <label className={lbl}>
            Punto de venta
            <input name="point_of_sale" type="number" min={1} defaultValue={1} className={field} />
          </label>
          <label className={lbl}>
            Ajuste del precio
            <select name="adjust" defaultValue="ninguno" className={field}>
              <option value="ninguno">Sin ajuste</option>
              <option value="ipc">Por IPC (INDEC) desde el primer mes</option>
            </select>
          </label>
          <p className="text-caption text-muted sm:col-span-2">Cada mes Faro arma el borrador y te avisa. Para que se emita sola, activá «Facturar automáticamente los comprobantes recurrentes» en Vigía → Automatizaciones (lo podés pausar cuando quieras; te llega un resumen diario).</p>
          <div className="sm:col-span-2">
            <SubmitButton pendingText="Guardando…">Guardar</SubmitButton>
          </div>
        </form>
      </Panel>
      {list.length === 0 ? (
        <EmptyState icon={FileClock} title="Sin facturas recurrentes" text="Ideal para abonos y alquileres." />
      ) : (
        <ul className="divide-y divide-line rounded-md border border-line bg-surface">
          {list.map((r) => {
            const t = r.template as { customer?: { name?: string }; items?: { unitPrice: number; quantity: number }[] };
            return (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <span className="min-w-0">
                  <span className="block truncate text-body text-ink">{r.name}</span>
                  <span className="block text-meta text-muted">
                    {t.customer?.name ?? ""} · el día {r.day_of_month} · próxima: {formatDate(r.next_date, "numeric")}
                    {r.adjust === "ipc" ? ` · ajusta por IPC desde ${r.base_month}` : ""}
                  </span>
                  {r.last_error && <span className="block text-meta text-danger">{r.last_error}</span>}
                </span>
                <span className="flex items-center gap-3">
                  <span className="num">{formatAmount((t.items ?? []).reduce((a, x) => a + x.unitPrice * x.quantity, 0))}</span>
                  <ToneBadge tone={r.active ? "ok" : "neutral"}>{r.active ? "Activa" : "En pausa"}</ToneBadge>
                  <form action={recurringAction}>
                    <ScopeFields scope={scope} volver={volver} />
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="op" value={r.active ? "pausar" : "reanudar"} />
                    <SubmitButton variant="secondary" pendingText="…">
                      {r.active ? "Pausar" : "Reanudar"}
                    </SubmitButton>
                  </form>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
