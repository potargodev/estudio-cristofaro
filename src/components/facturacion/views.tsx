import { AlertTriangle, CheckCircle2, ExternalLink, FileText, Link2, Mail, RefreshCw, ShieldCheck } from "lucide-react";
import Link from "next/link";
import {
  deleteCustomerAction,
  deleteDraftAction,
  deleteProductAction,
  emailAction,
  emitAction,
  fetchSituationAction,
  noteFromInvoiceAction,
  deletePersonalMpAction,
  paymentLinkAction,
  savePersonalMpAction,
  saveAdjustmentAction,
  saveCheckAction,
  saveCustomerAction,
  saveProductAction,
  saveProfileAction,
  saveSettingsAction,
  saveLegendsAction,
  shareAction,
  syncPointsAction,
} from "@/app/facturacion/actions";
import { HeaderAction } from "@/components/admin/kit/HeaderAction";
import { MpAccountForm } from "@/components/cobros/MpAccountForm";
import { accountSummary, notificationUrl } from "@/modules/billing/mp";
import { SubmitButton } from "@/components/admin/ui";
import { getSiteUrl } from "@/lib/runtime-config";
import { cn } from "@/lib/utils";
import { WhatsAppBatch, WhatsAppShare } from "@/components/share/WhatsAppShare";
import { fullNumber } from "@/modules/arca/calc";
import { CBTE_TYPES, DOC_TYPES, formatCuit, IVA_CONDITIONS } from "@/modules/arca/config";
import { simulateRI } from "@/modules/arca/monotributo";
import {
  checksFor,
  getInvoice,
  getSettings,
  latestSituation,
  listCustomers,
  listInvoices,
  listPoints,
  listProducts,
  personalCalendar,
  profileFor,
  semaforoFor,
  situationHistory,
  type IssuerScope,
} from "@/modules/arca/server";
import type { TaxpayerData } from "@/modules/arca/padron";
import { InvoiceForm } from "./InvoiceForm";
import { asProfile, legendsFor, type LegendProfile } from "@/modules/leyendas/catalog";
import { getLegendRules } from "@/modules/leyendas/server";
import { NO_REEMPLAZA } from "@/modules/escudo/catalog";
import { fieldClass } from "@/components/ds/primitives";
import { formatAmount, formatDate, formatPercent } from "@/lib/format";

// Vistas de facturación y ARCA, iguales para el autónomo (/facturacion) y para
// una organización del estudio (ficha → ARCA). Reciben el alcance ya validado.

type SP = Record<string, string | undefined>;
const field = `mt-1 ${fieldClass}`;
const lbl = "text-meta font-medium text-ink/80";
const card = "rounded-md border border-line bg-surface p-4 sm:p-5";
const STATUS: Record<string, { label: string; tone: string }> = {
  borrador: { label: "Borrador", tone: "bg-canvas text-muted border-line" },
  autorizando: { label: "Emitiendo…", tone: "bg-[#fbf5e6] text-[#7a5410] border-[#e3cf9f]" },
  autorizada: { label: "Autorizada", tone: "bg-[#ecf6ef] text-[#1f5f36] border-[#a9d1b5]" },
  rechazada: { label: "Rechazada", tone: "bg-danger/10 text-danger border-danger/30" },
  error: { label: "Con error", tone: "bg-danger/10 text-danger border-danger/30" },
};

/** Campos ocultos del alcance (en el estudio, la organización y la CUIT) */
function ScopeFields({ scope, volver }: { scope: IssuerScope; volver?: string }) {
  return (
    <>
      {scope.kind === "studio" && <input type="hidden" name="org" value={scope.organizationId} />}
      {scope.kind === "studio" && <input type="hidden" name="cuit" value={scope.cuit} />}
      {volver && <input type="hidden" name="volver" value={volver} />}
    </>
  );
}

export function Feedback({ sp }: { sp: SP }) {
  if (sp.error)
    return (
      <p role="alert" className="mb-4 flex gap-2 rounded-md border border-danger/30 bg-danger/10 px-4 py-3 text-ui text-danger">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> {sp.error}
      </p>
    );
  if (sp.ok)
    return (
      <p role="status" className="mb-4 flex gap-2 rounded-md border border-line bg-navy-soft px-4 py-3 text-ui text-ink">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#1f5f36]" aria-hidden /> {sp.ok}
      </p>
    );
  return null;
}

function StatusPill({ status }: { status: string }) {
  const s = STATUS[status] ?? STATUS.borrador;
  return <span className={cn("inline-flex h-6 items-center rounded-full border px-2 text-caption font-medium", s.tone)}>{s.label}</span>;
}

// ───────────── Comprobantes ─────────────

export async function InvoiceListView({ scope, sp }: { scope: IssuerScope; sp: SP }) {
  const [list, settings] = await Promise.all([listInvoices(scope, { status: sp.estado ?? null, q: sp.q ?? null }), getSettings(scope)]);
  const authorizedMonth = list.filter((i) => i.status === "autorizada" && i.issue_date.slice(0, 7) === new Date().toISOString().slice(0, 7));
  const monthTotal = authorizedMonth.reduce((s, i) => s + (CBTE_TYPES[i.cbte_type].kind === "nota_credito" ? -1 : 1) * Number(i.total) * Number(i.exchange_rate), 0);
  return (
    <div className="grid gap-4">
      <Feedback sp={sp} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <form method="get" className="flex flex-wrap gap-2" role="search">
          {scope.kind === "studio" && <input type="hidden" name="tab" value="arca" />}
          <input name="q" defaultValue={sp.q ?? ""} placeholder="Buscar por cliente" className="h-(--control-h) w-48 rounded-md border border-line bg-surface px-3 text-ui" />
          <select name="estado" defaultValue={sp.estado ?? ""} className="h-(--control-h) rounded-md border border-line bg-surface px-2 text-ui">
            <option value="">Todos</option>
            <option value="borrador">Borradores</option>
            <option value="autorizada">Autorizados</option>
            <option value="rechazada">Rechazados</option>
            <option value="error">Con error</option>
          </select>
          <button type="submit" className="h-(--control-h) rounded-md border border-line px-3 text-ui">
            Filtrar
          </button>
        </form>
        <HeaderAction href={`${scope.base}/nueva`} label="Nueva factura" />
      </div>
      <p className="text-ui text-muted">
        {settings.business_name} · CUIT {formatCuit(scope.cuit) || "sin cargar"} · {IVA_CONDITIONS[settings.iva_condition]} · este mes: <span className="num text-ink">{formatAmount(monthTotal)}</span> en {authorizedMonth.length} comprobante{authorizedMonth.length === 1 ? "" : "s"}
      </p>
      <WhatsAppBatch batch={sp.lote} />
      {list.some((i) => i.status === "autorizada") && (
        <WhatsAppShare
          type="factura"
          label="Enviar varios por WhatsApp"
          back={scope.home}
          choices={list
            .filter((i) => i.status === "autorizada")
            .slice(0, 100)
            .map((i) => ({ id: i.id, label: `${CBTE_TYPES[i.cbte_type].label} ${fullNumber(i.point_of_sale, i.number)} · ${i.customer_name} · ${formatAmount(Number(i.total), i.currency)}` }))}
        />
      )}
      {list.length === 0 ? (
        <div className={cn(card, "text-center")}>
          <FileText className="mx-auto size-8 text-muted" strokeWidth={1.5} aria-hidden />
          <p className="mt-2 font-medium">Todavía no hay comprobantes</p>
          <p className="mt-1 text-ui text-muted">Armá el primero: lo revisás y recién después se emite en ARCA.</p>
        </div>
      ) : (
        <ul className="divide-y divide-line rounded-md border border-line bg-surface">
          {list.map((i) => (
            <li key={i.id}>
              <Link href={`${scope.base}/${i.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-canvas">
                <span className="min-w-0">
                  <span className="block truncate text-body text-ink">{i.customer_name}</span>
                  <span className="block text-meta text-muted">
                    {CBTE_TYPES[i.cbte_type].label} {i.number == null ? `punto de venta ${i.point_of_sale} · sin número todavía` : fullNumber(i.point_of_sale, i.number)} · {formatDate(i.issue_date, "numeric")}
                  </span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="num text-body">{formatAmount(Number(i.total), i.currency)}</span>
                  <StatusPill status={i.status} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export async function InvoiceFormView({ scope, id }: { scope: IssuerScope; id?: string }) {
  const [settings, customers, products, points, inv] = await Promise.all([getSettings(scope), listCustomers(scope), listProducts(scope), listPoints(scope), id ? getInvoice(scope, id) : null]);
  if (id && (!inv || !["borrador", "rechazada"].includes(inv.status))) return <p className="text-muted">Ese comprobante ya no se puede editar.</p>;
  const hidden: Record<string, string> = scope.kind === "studio" ? { org: scope.organizationId, cuit: scope.cuit } : {};
  return (
    <>
      {!/^\d{11}$/.test(scope.cuit) && <Feedback sp={{ error: "Falta la CUIT del emisor. Cargala en los datos de facturación antes de emitir." }} />}
      <InvoiceForm
        hidden={hidden}
        issuerCondition={settings.iva_condition}
        customers={customers.map((c) => ({ id: c.id, name: c.name, docType: c.doc_type, docNumber: c.doc_number, ivaCondition: c.iva_condition, email: c.email }))}
        products={products.map((p) => ({ id: p.id, description: p.description, unitPrice: Number(p.unit_price), ivaRate: p.iva_rate == null ? null : Number(p.iva_rate) }))}
        points={points.filter((p) => !p.blocked).map((p) => p.number)}
        initial={
          inv
            ? {
                id: inv.id,
                cbteType: inv.cbte_type,
                pointOfSale: inv.point_of_sale,
                issueDate: inv.issue_date,
                concept: inv.concept,
                serviceFrom: inv.service_from,
                serviceTo: inv.service_to,
                paymentDue: inv.payment_due,
                customer: { docType: inv.customer_doc_type, docNumber: inv.customer_doc_number, name: inv.customer_name, ivaCondition: inv.customer_iva_condition, email: inv.customer_email, address: inv.customer_address },
                items: inv.items,
                currency: inv.currency,
                exchangeRate: Number(inv.exchange_rate),
                associated: inv.associated_invoice_id,
                notes: inv.notes,
              }
            : undefined
        }
      />
    </>
  );
}

export async function InvoiceDetailView({ scope, id, sp }: { scope: IssuerScope; id: string; sp: SP }) {
  const inv = await getInvoice(scope, id);
  if (!inv) return <p className="text-muted">No encontramos ese comprobante.</p>;
  const t = CBTE_TYPES[inv.cbte_type];
  const pdf = `/api/facturas/${inv.id}/pdf${scope.kind === "studio" ? `?org=${scope.organizationId}` : ""}`;
  const share = inv.public_token ? `${getSiteUrl()}/f/${inv.public_token}` : null;
  const editable = ["borrador", "rechazada"].includes(inv.status);
  return (
    <div className="grid gap-4">
      <Feedback sp={sp} />
      <div className={card}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-meta text-muted">
              {t.label} · {inv.number == null ? `punto de venta ${inv.point_of_sale} · sin número todavía` : fullNumber(inv.point_of_sale, inv.number)} · {formatDate(inv.issue_date, "numeric")}
            </p>
            <p className="mt-1 text-title font-semibold">{inv.customer_name}</p>
            <p className="text-meta text-muted">
              {DOC_TYPES[inv.customer_doc_type]} {inv.customer_doc_type === 80 ? formatCuit(inv.customer_doc_number) : inv.customer_doc_number} · {IVA_CONDITIONS[inv.customer_iva_condition]}
            </p>
          </div>
          <div className="text-right">
            <StatusPill status={inv.status} />
            <p className="num mt-2 text-headline">{formatAmount(Number(inv.total), inv.currency)}</p>
          </div>
        </div>
        <ul className="mt-4 divide-y divide-line border-t border-line text-ui">
          {inv.items.map((it, i) => (
            <li key={i} className="flex justify-between gap-3 py-2">
              <span>
                {it.quantity} × {it.description}
                {it.ivaRate != null && <span className="text-muted"> · IVA {formatPercent(it.ivaRate, 1, false)}</span>}
              </span>
              <span className="num">{formatAmount(it.quantity * it.unitPrice, inv.currency)}</span>
            </li>
          ))}
        </ul>
        {inv.status === "autorizada" && (
          <p className="mt-3 flex items-center gap-2 text-ui text-[#1f5f36]">
            <ShieldCheck className="size-4" aria-hidden /> CAE {inv.cae} · vence el {formatDate(inv.cae_due, "numeric")}
            {inv.environment === "homologacion" && <span className="text-danger"> · homologación (sin validez fiscal)</span>}
          </p>
        )}
        {inv.error && <p className="mt-3 text-ui text-danger">{inv.error}</p>}
        {!!inv.legends?.length && (
          <div className="mt-3 border-t border-line pt-3">
            <p className="text-meta font-medium text-muted">Leyendas obligatorias que lleva el PDF</p>
            <ul className="mt-1 grid gap-1 text-meta">
              {inv.legends.map((l) => (
                <li key={l.key}>
                  {l.lines.join(" · ")}
                  {l.status === "a_validar" && <span className="text-muted"> (texto a validar con la norma)</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <a href={pdf} target="_blank" rel="noreferrer" className="inline-flex h-(--control-h) items-center gap-1.5 rounded-md border border-line bg-surface px-4 text-ui hover:border-muted">
          <FileText className="size-4" aria-hidden /> {inv.status === "autorizada" ? "Ver PDF" : "Vista previa (borrador)"}
        </a>
        {editable && (
          <Link href={`${scope.base}/${inv.id}/editar`} className="inline-flex h-(--control-h) items-center rounded-md border border-line bg-surface px-4 text-ui hover:border-muted">
            Editar
          </Link>
        )}
        {editable && (
          <form action={deleteDraftAction}>
            <ScopeFields scope={scope} />
            <input type="hidden" name="id" value={inv.id} />
            <SubmitButton variant="danger" confirm="¿Eliminar el borrador?" pendingText="…">
              Eliminar
            </SubmitButton>
          </form>
        )}
      </div>

      {editable || inv.status === "error" ? (
        scope.canEmit ? (
          <form action={emitAction} className={cn(card, "grid gap-3 border-navy/30")}>
            <ScopeFields scope={scope} />
            <input type="hidden" name="id" value={inv.id} />
            <p className="text-body font-semibold">Emitir en ARCA</p>
            <p className="text-ui text-muted">Faro pide el próximo número a ARCA y el CAE. Una vez autorizado no se puede borrar: se corrige con una nota de crédito.</p>
            <label className="flex items-start gap-2 text-ui">
              <input type="checkbox" name="confirmo" required className="mt-0.5 size-4 accent-navy" /> Revisé el cliente, los importes y el tipo de comprobante. Quiero emitirlo.
            </label>
            <div>
              <SubmitButton pendingText="Emitiendo en ARCA…" confirm={`¿Emitir ${t.label} a ${inv.customer_name} por ${formatAmount(Number(inv.total), inv.currency)}?`} confirmLabel="Emitir">
                Emitir comprobante
              </SubmitButton>
            </div>
          </form>
        ) : (
          <p className="text-ui text-muted">Tu rol prepara borradores; lo emite el dueño o un contador del estudio.</p>
        )
      ) : null}

      {inv.status === "autorizada" && (
        <div className="grid gap-3 lg:grid-cols-2">
          <form action={emailAction} className={cn(card, "grid gap-2")}>
            <ScopeFields scope={scope} />
            <input type="hidden" name="id" value={inv.id} />
            <p className="flex items-center gap-2 text-body font-semibold">
              <Mail className="size-4" aria-hidden /> Enviar por mail
            </p>
            <input name="to" type="email" required defaultValue={inv.customer_email ?? ""} placeholder="mail del cliente" className={field} />
            <div>
              <SubmitButton pendingText="Enviando…">Enviar</SubmitButton>
              {inv.emailed_at && <span className="ml-3 text-meta text-muted">Enviado el {formatDate(inv.emailed_at.toISOString().slice(0, 10), "numeric")}</span>}
            </div>
          </form>
          <div className={cn(card, "grid gap-2")}>
            <p className="flex items-center gap-2 text-body font-semibold">
              <Link2 className="size-4" aria-hidden /> Link para compartir
            </p>
            {share ? <input readOnly value={share} className={cn(field, "text-meta")} aria-label="Link del comprobante" /> : <p className="text-ui text-muted">El link está desactivado.</p>}
            <form action={shareAction} className="flex gap-2">
              <ScopeFields scope={scope} />
              <input type="hidden" name="id" value={inv.id} />
              <input type="hidden" name="on" value={share ? "0" : "1"} />
              <SubmitButton variant="secondary" pendingText="…">{share ? "Desactivar el link" : "Generar un link"}</SubmitButton>
            </form>
          </div>
          <div className="grid gap-2 lg:col-span-2">
            <WhatsAppBatch batch={sp.lote} />
            <WhatsAppShare type="factura" ids={[inv.id]} back={`${scope.base}/${inv.id}`} />
          </div>
          {scope.kind === "personal" && t.kind === "factura" && (
            <div className={cn(card, "grid gap-2 lg:col-span-2")}>
              <p className="flex items-center gap-2 text-body font-semibold">
                <Link2 className="size-4" aria-hidden /> Cobrar con Mercado Pago
                {inv.paid_at && <span className="rounded-md bg-[#e3efe6] px-2 py-0.5 text-caption font-medium text-[#24583a]">Pagada el {formatDate(inv.paid_at.toISOString().slice(0, 10), "numeric")}</span>}
              </p>
              {inv.payment_url ? (
                <input readOnly value={inv.payment_url} className={cn(field, "text-meta")} aria-label="Link de pago" />
              ) : (
                <form action={paymentLinkAction} className="flex flex-wrap items-center gap-2">
                  <ScopeFields scope={scope} />
                  <input type="hidden" name="id" value={inv.id} />
                  <SubmitButton variant="secondary" pendingText="…">Crear link de pago</SubmitButton>
                  <span className="text-meta text-muted">Va en el PDF y en el mail. Necesitás tu cuenta de Mercado Pago conectada en Ajustes.</span>
                </form>
              )}
            </div>
          )}
          {t.kind === "factura" && (
            <div className={cn(card, "flex flex-wrap items-center gap-2 lg:col-span-2")}>
              <p className="mr-auto text-ui text-muted">¿Hay que corregirla? Se hace con una nota que ARCA asocia a esta factura.</p>
              {(["credito", "debito"] as const).map((k) => (
                <form key={k} action={noteFromInvoiceAction}>
                  <ScopeFields scope={scope} />
                  <input type="hidden" name="id" value={inv.id} />
                  <input type="hidden" name="kind" value={k} />
                  <SubmitButton variant="secondary" pendingText="…">
                    {k === "credito" ? "Nota de crédito" : "Nota de débito"}
                  </SubmitButton>
                </form>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ───────────── Mi situación con ARCA ─────────────

export async function SituationView({ scope, sp, volver }: { scope: IssuerScope; sp: SP; volver: string }) {
  const [last, history] = await Promise.all([latestSituation(scope), situationHistory(scope)]);
  const d = (last && last.validation !== "error" ? last.data : null) as TaxpayerData | null;
  const valid = history.find((h) => h.validation !== "error");
  return (
    <div className="grid gap-4">
      <Feedback sp={sp} />
      <div className={cn(card, "flex flex-wrap items-center justify-between gap-3")}>
        <div>
          <p className="text-body font-semibold">Constancia de inscripción · CUIT {formatCuit(scope.cuit) || "sin cargar"}</p>
          <p className="text-meta text-muted">{valid ? `Consultada el ${formatDate(valid.fetchedAt, "timestamp")} por web service oficial de ARCA${valid.environment === "homologacion" ? " (homologación)" : ""}.` : "Todavía no la consultamos."}</p>
        </div>
        <form action={fetchSituationAction}>
          <ScopeFields scope={scope} volver={volver} />
          <SubmitButton pendingText="Consultando ARCA…">
            <span className="inline-flex items-center gap-1.5">
              <RefreshCw className="size-4" aria-hidden /> Consultar ahora
            </span>
          </SubmitButton>
        </form>
      </div>
      {last?.validation === "error" && <Feedback sp={{ error: `La última consulta falló: ${last.error}` }} />}
      {d && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className={card}>
            <dl className="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-2 text-ui">
              <dt className="text-muted">Nombre</dt>
              <dd>{d.name}</dd>
              <dt className="text-muted">Estado de la CUIT</dt>
              <dd>{d.status || "—"}</dd>
              <dt className="text-muted">Régimen</dt>
              <dd>{d.regime === "monotributo" ? "Monotributo" : d.regime === "responsable_inscripto" ? "Responsable inscripto" : d.regime === "exento" ? "Exento" : "Otro"}</dd>
              {d.category && (
                <>
                  <dt className="text-muted">Categoría</dt>
                  <dd>
                    {d.category} <span className="text-muted">· {d.categoryDetail}</span>
                  </dd>
                </>
              )}
              <dt className="text-muted">Domicilio fiscal</dt>
              <dd>{d.address ?? "—"}</dd>
            </dl>
          </div>
          <div className={card}>
            <p className="text-ui font-semibold">Actividades</p>
            <ul className="mt-2 grid gap-1 text-ui">
              {d.activities.map((a) => (
                <li key={a.id}>
                  <span className="num text-muted">{a.id}</span> · {a.description}
                  {a.main && <span className="text-muted"> (principal)</span>}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-ui font-semibold">Impuestos</p>
            <ul className="mt-2 grid gap-1 text-ui">
              {d.taxes.map((x) => (
                <li key={x.id}>
                  {x.description} <span className="text-muted">· desde {x.since ?? "—"}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {last && (
        <details className="text-meta text-muted">
          <summary className="cursor-pointer">Registro original de ARCA (última consulta)</summary>
          <pre className="mt-2 max-h-72 overflow-auto rounded-md border border-line bg-canvas p-3 text-caption">{JSON.stringify(last.raw, null, 2)}</pre>
        </details>
      )}
    </div>
  );
}

// ───────────── Semáforo de monotributo ─────────────

const LIGHT = {
  verde: { label: "Lejos del tope", dot: "bg-[#2f8a55]" },
  amarillo: { label: "Te acercás al tope", dot: "bg-[#d6a32a]" },
  rojo: { label: "Muy cerca del tope", dot: "bg-danger" },
  excluido: { label: "Riesgo de exclusión", dot: "bg-danger" },
} as const;

export async function SemaforoView({ scope, sp, volver }: { scope: IssuerScope; sp: SP; volver: string }) {
  const s = await semaforoFor(scope);
  const l = LIGHT[s.light];
  const cat = (s.scale.categories as { letter: string; feeServices: number | null }[]).find((c) => c.letter === s.category);
  const sim = simulateRI({ annualIncome: Math.max(s.income12m, s.projection12m), annualPurchasesWithIva: Number(sp.compras ?? 0) || 0, monthlyFee: cat?.feeServices ?? null });
  const max = Math.max(1, ...s.months.map((m) => m.amount));
  return (
    <div className="grid gap-4">
      <Feedback sp={sp} />
      {s.scale.status !== "validada" && (
        <p className="rounded-md border border-[#e3cf9f] bg-[#fbf5e6] px-4 py-2.5 text-meta text-[#7a5410]">Escala de categorías vigente desde el {formatDate(s.scale.valid_from, "numeric")} · {s.scale.source}. Está marcada «a validar»: verificá los topes en arca.gob.ar antes de decidir.</p>
      )}
      <div className={cn(card, "grid gap-4 sm:grid-cols-[auto_1fr] sm:items-center")}>
        <div className="flex items-center gap-3">
          <span aria-hidden className={cn("size-12 rounded-full", l.dot)} />
          <div>
            <p className="text-title font-semibold">{l.label}</p>
            <p className="text-meta text-muted">Categoría {s.category ?? "sin cargar"}{s.cap ? ` · tope ${formatAmount(s.cap, "ARS", { decimals: "none" })}` : ""}</p>
          </div>
        </div>
        <div>
          <p className="text-body">{s.message}</p>
          {s.used != null && (
            <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-canvas" role="progressbar" aria-valuenow={Math.round(s.used * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Uso del tope de la categoría">
              <div className={cn("h-full rounded-full", l.dot)} style={{ width: `${Math.min(100, s.used * 100)}%` }} />
            </div>
          )}
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Últimos 12 meses", formatAmount(s.income12m, "ARS", { decimals: "none" })],
          ["Margen hasta el tope", s.remaining != null ? formatAmount(Math.max(0, s.remaining), "ARS", { decimals: "none" }) : "—"],
          ["Categoría que coincide con lo facturado", s.suggested ?? (s.excluded ? "Fuera de escala" : "—")],
          ["Proyección a 12 meses", formatAmount(s.projection12m, "ARS", { decimals: "none" })],
        ].map(([k, v]) => (
          <div key={k} className={card}>
            <dt className="text-meta text-muted">{k}</dt>
            <dd className="num mt-1 text-section">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="text-ui text-muted">
        Próxima recategorización: <strong className="text-ink">{s.nextRecategorization.label}</strong>, con lo facturado hasta el {formatDate(s.nextRecategorization.cutoff, "numeric")} (se hace hasta el {formatDate(s.nextRecategorization.deadline, "numeric")}).
      </p>
      <section className={card} aria-labelledby="meses">
        <h2 id="meses" className="text-body font-semibold">
          Mes a mes
        </h2>
        <ul className="mt-3 grid gap-1.5">
          {s.months.map((m) => (
            <li key={m.month} className="grid grid-cols-[4.5rem_1fr_8rem] items-center gap-2 text-meta">
              <span className="num text-muted">{m.month}</span>
              <span className="h-2 rounded-full bg-canvas">
                <span className="block h-full rounded-full bg-navy/70" style={{ width: `${(m.amount / max) * 100}%` }} />
              </span>
              <span className="num text-right">{formatAmount(m.amount, "ARS", { decimals: "none" })}</span>
            </li>
          ))}
        </ul>
        <form action={saveAdjustmentAction} className="mt-4 grid gap-2 border-t border-line pt-4 sm:grid-cols-[9rem_10rem_1fr_auto] sm:items-end">
          <ScopeFields scope={scope} volver={volver} />
          <p className="text-meta text-muted sm:col-span-4">¿Facturaste por fuera de Faro (antes de usarlo o con otro sistema)? Cargá el total del mes para que el semáforo lo cuente.</p>
          <label>
            <span className={lbl}>Mes</span>
            <input name="month" type="month" required className={field} />
          </label>
          <label>
            <span className={lbl}>Total facturado</span>
            <input name="amount" inputMode="decimal" required className={field} />
          </label>
          <label>
            <span className={lbl}>Nota</span>
            <input name="note" className={field} />
          </label>
          <SubmitButton variant="secondary" pendingText="…">Guardar</SubmitButton>
        </form>
      </section>
      <section className={card} aria-labelledby="ri">
        <h2 id="ri" className="text-body font-semibold">
          ¿Y si pasás a responsable inscripto?
        </h2>
        <p className="mt-1 text-ui text-muted">Simulación educativa con la alícuota general (21 %), sobre lo que cargaste. Es un dato, no una recomendación: el pase a responsable inscripto lo decide un contador matriculado con vos.</p>
        <form method="get" className="mt-3 flex flex-wrap items-end gap-2">
          <label>
            <span className={lbl}>Compras con IVA en 12 meses (opcional)</span>
            <input name="compras" inputMode="numeric" defaultValue={sp.compras ?? ""} className={cn(field, "w-56")} />
          </label>
          <button type="submit" className="h-(--control-h) rounded-md border border-line px-3 text-ui">
            Recalcular
          </button>
        </form>
        <dl className="mt-3 grid gap-2 text-ui sm:grid-cols-3">
          <div>
            <dt className="text-muted">IVA de tus ventas por mes</dt>
            <dd className="num text-title">{formatAmount(sim.debit, "ARS", { decimals: "none" })}</dd>
          </div>
          <div>
            <dt className="text-muted">IVA de tus compras por mes</dt>
            <dd className="num text-title">{formatAmount(sim.credit, "ARS", { decimals: "none" })}</dd>
          </div>
          <div>
            <dt className="text-muted">IVA a pagar por mes (aprox.)</dt>
            <dd className="num text-title">{formatAmount(sim.ivaMonthly, "ARS", { decimals: "none" })}</dd>
          </div>
        </dl>
        <p className="mt-2 text-meta text-muted">Además se suman Ganancias y aportes de autónomos. Esto no reemplaza el criterio de un contador: <Link href="/red-contable?necesito=simulacion_ri" className="underline underline-offset-4">sumá uno desde la Red Contable</Link>.</p>
      </section>
    </div>
  );
}

// ───────────── Calendario personal ─────────────

export async function CalendarView({ scope, sp, volver }: { scope: IssuerScope; sp: SP; volver: string }) {
  const [p, list] = await Promise.all([profileFor(scope), personalCalendar(scope)]);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="grid content-start gap-3">
        <Feedback sp={sp} />
        {list.length === 0 ? (
          <p className={cn(card, "text-ui text-muted")}>Completá tu perfil fiscal y armamos tu calendario de los próximos 6 meses.</p>
        ) : (
          <ul className="divide-y divide-line rounded-md border border-line bg-surface">
            {list.map((o) => {
              const days = Math.ceil((new Date(`${o.due_date}T12:00:00`).getTime() - Date.now()) / 86400000);
              return (
                <li key={o.id} className={cn("flex flex-wrap items-center justify-between gap-2 px-4 py-3", o.due_date < today && "opacity-60")}>
                  <span className="min-w-0">
                    <span className="block text-body">{o.tax}</span>
                    <span className="block text-meta text-muted">
                      Período {o.period} · {o.notes}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="num block text-body">{formatDate(o.due_date, "numeric")}</span>
                    <span className={cn("block text-caption", days <= 3 && days >= 0 ? "text-danger" : "text-muted")}>{days < 0 ? "Pasó" : days === 0 ? "Vence hoy" : `En ${days} día${days === 1 ? "" : "s"}`}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-meta text-muted">Fechas de referencia según la terminación de tu CUIT. Si un vencimiento cae en feriado se corre: verificalo en el calendario oficial de ARCA.</p>
      </div>
      <form action={saveProfileAction} className={cn(card, "grid content-start gap-3")}>
        <ScopeFields scope={scope} volver={volver} />
        <p className="text-body font-semibold">Tu perfil fiscal</p>
        <label>
          <span className={lbl}>Régimen</span>
          <select name="regime" defaultValue={p?.regime ?? "monotributo"} className={field}>
            <option value="monotributo">Monotributo</option>
            <option value="responsable_inscripto">Responsable inscripto</option>
          </select>
        </label>
        <label>
          <span className={lbl}>Categoría (monotributo)</span>
          <select name="category" defaultValue={p?.category ?? ""} className={field}>
            <option value="">—</option>
            {"ABCDEFGHIJK".split("").map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className={lbl}>Ingresos Brutos</span>
          <select name="iibb" defaultValue={p?.iibb ?? "simplificado"} className={field}>
            <option value="simplificado">Simplificado (incluido en el monotributo)</option>
            <option value="local">Local</option>
            <option value="convenio">Convenio Multilateral</option>
            <option value="exento">Exento</option>
          </select>
        </label>
        <label>
          <span className={lbl}>Jurisdicción</span>
          <input name="jurisdiction" defaultValue={p?.jurisdiction ?? ""} placeholder="Ej.: Santa Fe" className={field} />
        </label>
        <label className="flex items-center gap-2 text-ui">
          <input type="checkbox" name="autonomos" defaultChecked={p?.autonomos ?? false} className="size-4 accent-navy" /> Aporto a autónomos
        </label>
        <label className="flex items-center gap-2 text-ui">
          <input type="checkbox" name="alerts_email" defaultChecked={p?.alerts_email ?? true} className="size-4 accent-navy" /> Avisarme por mail
        </label>
        <label>
          <span className={lbl}>Con cuántos días de anticipación</span>
          <input name="alert_days" type="number" min={1} max={15} defaultValue={p?.alert_days ?? 3} className={field} />
        </label>
        <SubmitButton pendingText="Guardando…">Guardar y armar el calendario</SubmitButton>
      </form>
    </div>
  );
}

// ───────────── Chequeos guiados ─────────────

export async function ChecksView({ scope, sp, volver }: { scope: IssuerScope; sp: SP; volver: string }) {
  const list = await checksFor(scope);
  return (
    <div className="grid gap-4">
      <Feedback sp={sp} />
      <p className="text-ui text-muted">Para esto ARCA no tiene un servicio oficial que Faro pueda consultar. Te decimos qué mirar y dónde; anotás lo que ves y te lo recordamos. Lo que anotás es tu lectura, no una revisión profesional.</p>
      {list.map((c) => (
        <details key={c.key} className={card} open={!c.state}>
          <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
            <span className="text-body font-semibold">{c.title}</span>
            <span className={cn("text-meta", c.state?.status === "con_novedades" ? "text-danger" : c.state?.status === "ok" ? "text-[#1f5f36]" : "text-muted")}>
              {c.state?.status === "ok" ? `Sin novedades según lo que viste · ${formatDate(c.state.checked_at, "numeric")}` : c.state?.status === "con_novedades" ? "Con novedades" : "Sin revisar"}
            </span>
          </summary>
          <p className="mt-2 text-ui text-muted">{c.why}</p>
          <ol className="mt-3 grid list-decimal gap-1 pl-5 text-ui">
            {c.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          <a href={c.link} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-ui font-medium underline underline-offset-4">
            Entrar a ARCA ({c.service}) <ExternalLink className="size-3.5" aria-hidden />
          </a>
          <form action={saveCheckAction} className="mt-4 grid gap-2 border-t border-line pt-4 sm:grid-cols-2">
            <ScopeFields scope={scope} volver={volver} />
            <input type="hidden" name="key" value={c.key} />
            <label>
              <span className={lbl}>¿Qué viste?</span>
              <select name="status" defaultValue={c.state?.status ?? "ok"} className={field}>
                <option value="ok">No vi nada para resolver</option>
                <option value="con_novedades">Hay algo para resolver</option>
              </select>
            </label>
            <label>
              <span className={lbl}>Monto (si hay deuda o multa)</span>
              <input name="amount" inputMode="decimal" defaultValue={c.state?.amount ?? ""} className={field} />
            </label>
            <label className="sm:col-span-2">
              <span className={lbl}>Nota</span>
              <input name="finding" defaultValue={c.state?.finding ?? ""} className={field} />
            </label>
            <label>
              <span className={lbl}>Recordarme cada (días)</span>
              <input name="every_days" type="number" min={7} max={365} defaultValue={c.state?.every_days ?? c.everyDays} className={field} />
            </label>
            <div className="self-end">
              <SubmitButton pendingText="…">Guardar</SubmitButton>
            </div>
          </form>
        </details>
      ))}
    </div>
  );
}

// ───────────── Ajustes del emisor ─────────────

export async function SettingsView({ scope, sp, volver }: { scope: IssuerScope; sp: SP; volver: string }) {
  const [s, points, mp] = await Promise.all([getSettings(scope), listPoints(scope), scope.kind === "personal" ? accountSummary(scope.studioId) : null]);
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      {scope.kind === "personal" && (
        <section aria-label="Mercado Pago" className="grid gap-2 lg:col-span-2">
          <p className="text-body font-semibold">Cobrar tus facturas con Mercado Pago</p>
          <MpAccountForm summary={mp} save={savePersonalMpAction} remove={deletePersonalMpAction} webhookUrl={notificationUrl(scope.studioId)} />
        </section>
      )}
      <div className="grid content-start gap-4">
      <form action={saveSettingsAction} encType="multipart/form-data" className={cn(card, "grid gap-3 sm:grid-cols-2")}>
        <ScopeFields scope={scope} volver={volver} />
        <div className="sm:col-span-2">
          <Feedback sp={sp} />
          <p className="text-body font-semibold">Datos del emisor y del PDF</p>
        </div>
        <label className="sm:col-span-2">
          <span className={lbl}>Razón social o nombre</span>
          <input name="business_name" required defaultValue={s.business_name} className={field} />
        </label>
        <label>
          <span className={lbl}>Condición frente al IVA</span>
          <select name="iva_condition" defaultValue={s.iva_condition} className={field}>
            <option value="monotributo">Monotributo</option>
            <option value="responsable_inscripto">Responsable inscripto</option>
            <option value="exento">Exento</option>
          </select>
        </label>
        <label>
          <span className={lbl}>Inicio de actividades</span>
          <input name="activity_start" type="date" defaultValue={s.activity_start ?? ""} className={field} />
        </label>
        <label>
          <span className={lbl}>Ingresos Brutos (número)</span>
          <input name="iibb" defaultValue={s.iibb ?? ""} className={field} />
        </label>
        <label>
          <span className={lbl}>Domicilio comercial</span>
          <input name="address" defaultValue={s.address ?? ""} className={field} />
        </label>
        <label>
          <span className={lbl}>Mail de contacto</span>
          <input name="email" type="email" defaultValue={s.email ?? ""} className={field} />
        </label>
        <label>
          <span className={lbl}>Teléfono</span>
          <input name="phone" defaultValue={s.phone ?? ""} className={field} />
        </label>
        <label>
          <span className={lbl}>Sitio web</span>
          <input name="website" defaultValue={s.website ?? ""} className={field} />
        </label>
        <label>
          <span className={lbl}>Color de tu marca</span>
          <input name="color" type="color" defaultValue={s.color ?? "#1c2235"} className="mt-1 h-(--control-h) w-full rounded-md border border-line bg-surface px-1" />
        </label>
        <label className="sm:col-span-2">
          <span className={lbl}>Logo (PNG o JPG)</span>
          <input name="logo" type="file" accept="image/png,image/jpeg" className="mt-1 block w-full text-ui" />
        </label>
        {s.logo_path && (
          <label className="flex items-center gap-2 text-ui sm:col-span-2">
            <input type="checkbox" name="quitar_logo" className="size-4 accent-navy" /> Quitar el logo actual
          </label>
        )}
        <label className="sm:col-span-2">
          <span className={lbl}>Leyenda al pie (datos bancarios, agradecimiento)</span>
          <input name="footer" defaultValue={s.footer ?? ""} className={field} />
        </label>
        <div className="sm:col-span-2">
          <SubmitButton pendingText="Guardando…">Guardar</SubmitButton>
        </div>
      </form>
      <LegendProfileForm scope={scope} volver={volver} saved={!!s.id} profile={asProfile(s.legend_profile)} ivaCondition={s.iva_condition} />
      </div>
      <div className={cn(card, "grid content-start gap-3")}>
        <p className="text-body font-semibold">Puntos de venta y delegación</p>
        <p className="text-ui text-muted">Para que Faro emita en nombre de CUIT {formatCuit(scope.cuit)}, la CUIT tiene que delegarle a Faro el servicio de factura electrónica en ARCA.</p>
        <Link href="/ayuda/facturacion/delegar-en-faro" className="text-ui font-medium underline underline-offset-4">
          Cómo delegar el servicio (paso a paso)
        </Link>
        <ul className="grid gap-1 text-ui">
          {points.length === 0 ? (
            <li className="text-muted">Sin puntos de venta traídos de ARCA.</li>
          ) : (
            points.map((p) => (
              <li key={p.id}>
                <span className="num">{String(p.number).padStart(5, "0")}</span> · {p.kind || "Web services"}
                {p.blocked && <span className="text-danger"> · bloqueado</span>}
              </li>
            ))
          )}
        </ul>
        <form action={syncPointsAction}>
          <ScopeFields scope={scope} volver={volver} />
          <SubmitButton variant="secondary" pendingText="Probando…">
            Probar la delegación y traer puntos de venta
          </SubmitButton>
        </form>
      </div>
    </div>
  );
}

/** §2.q etapa 5: perfil de leyendas obligatorias, se carga una vez y Faro las imprime solas */
async function LegendProfileForm({ scope, volver, saved, profile, ivaCondition }: { scope: IssuerScope; volver: string; saved: boolean; profile: LegendProfile; ivaCondition: string }) {
  const rules = await getLegendRules();
  const sample = (customerIva: string, letter: "A" | "B" | "C") =>
    legendsFor({ letter, kind: "factura", issuerIva: ivaCondition, customerIva, issueDate: new Date().toISOString().slice(0, 10), net: 100000, iva: letter === "C" ? 0 : 21000, total: letter === "C" ? 100000 : 121000 }, profile, rules);
  const toConsumer = sample("consumidor_final", ivaCondition === "responsable_inscripto" ? "B" : "C");
  const toCompany = ivaCondition === "responsable_inscripto" ? sample("responsable_inscripto", "A") : [];
  return (
    <form action={saveLegendsAction} id="leyendas" className={cn(card, "grid gap-3 sm:grid-cols-2")}>
      <ScopeFields scope={scope} volver={volver} />
      <div className="sm:col-span-2">
        <p className="text-body font-semibold">Leyendas obligatorias</p>
        <p className="text-ui text-muted">Lo cargás una vez y Faro imprime solas las leyendas que pide la normativa (transparencia fiscal, Ingresos Brutos de CABA, retenciones). El catálogo lo mantiene Faro y te avisa si cambia una norma. {NO_REEMPLAZA}</p>
      </div>
      <label>
        <span className={lbl}>Ingresos Brutos en CABA</span>
        <select name="isib_caba" defaultValue={profile.isibCaba} className={field}>
          <option value="no">No estoy inscripto en CABA</option>
          <option value="local">Contribuyente local de CABA</option>
          <option value="convenio">Convenio Multilateral (con CABA)</option>
          <option value="simplificado">Régimen Simplificado (monotributo)</option>
        </select>
      </label>
      <label>
        <span className={lbl}>Alícuota ISIB CABA (%; si tenés varias, la menor)</span>
        <input name="isib_alicuota" inputMode="decimal" defaultValue={profile.isibAlicuota == null ? "" : String(profile.isibAlicuota).replace(".", ",")} placeholder="Ej.: 3" className={field} />
      </label>
      <label className="flex items-center gap-2 text-ui">
        <input type="checkbox" name="isib_promocion" defaultChecked={profile.isibPromocion} className="size-4 accent-navy" /> Mis operaciones tienen promoción económica de CABA
      </label>
      <label className="flex items-center gap-2 text-ui">
        <input type="checkbox" name="isib_exento" defaultChecked={profile.isibExento} className="size-4 accent-navy" /> Mis operaciones están exentas de ISIB CABA
      </label>
      <label className="flex items-center gap-2 text-ui">
        <input type="checkbox" name="sujeta_retencion" defaultChecked={profile.sujetaRetencion} className="size-4 accent-navy" /> ARCA me incluyó en el régimen de facturas A con retención
      </label>
      <label>
        <span className={lbl}>Otros impuestos nacionales indirectos en el precio (% del neto)</span>
        <input name="otros_nacionales" inputMode="decimal" defaultValue={profile.otrosNacionalesPct ? String(profile.otrosNacionalesPct).replace(".", ",") : ""} placeholder="0" className={field} />
      </label>
      <div className="grid gap-1 rounded-md bg-canvas p-3 text-meta sm:col-span-2">
        <p className="font-medium text-ink">Así salen hoy</p>
        <p className="text-muted">A consumidor final: {toConsumer.length ? toConsumer.map((l) => l.lines.join(" · ")).join(" — ") : "sin leyendas obligatorias"}</p>
        {ivaCondition === "responsable_inscripto" && <p className="text-muted">A un responsable inscripto: {toCompany.length ? toCompany.map((l) => l.lines.join(" · ")).join(" — ") : "sin leyendas obligatorias"}</p>}
        {[...toConsumer, ...toCompany].some((l) => l.status === "a_validar") && <p className="text-muted">Algunos textos están a validar con la norma oficial: Faro los imprime igual y te avisa si cambian.</p>}
      </div>
      <div className="sm:col-span-2">
        {saved ? <SubmitButton variant="secondary" pendingText="Guardando…">Guardar leyendas</SubmitButton> : <p className="text-meta text-muted">Primero guardá los datos del emisor.</p>}
      </div>
    </form>
  );
}

// ───────────── Clientes y productos ─────────────

export async function CustomersView({ scope, sp, volver }: { scope: IssuerScope; sp: SP; volver: string }) {
  const [customers, products] = await Promise.all([listCustomers(scope), listProducts(scope)]);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="lg:col-span-2">
        <Feedback sp={sp} />
      </div>
      <section className={card} aria-labelledby="clientes">
        <h2 id="clientes" className="text-body font-semibold">
          Clientes frecuentes
        </h2>
        <ul className="mt-2 divide-y divide-line text-ui">
          {customers.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 py-2">
              <span className="min-w-0">
                <span className="block truncate">{c.name}</span>
                <span className="block text-meta text-muted">
                  {DOC_TYPES[c.doc_type]} {c.doc_number !== "0" ? c.doc_number : ""} · {IVA_CONDITIONS[c.iva_condition]}
                </span>
              </span>
              <form action={deleteCustomerAction}>
                <ScopeFields scope={scope} volver={volver} />
                <input type="hidden" name="id" value={c.id} />
                <SubmitButton variant="danger" confirm={`¿Borrar a ${c.name}?`} pendingText="…">
                  Borrar
                </SubmitButton>
              </form>
            </li>
          ))}
          {customers.length === 0 && <li className="py-2 text-muted">Se guardan solos cuando facturás, o cargalos acá.</li>}
        </ul>
        <form action={saveCustomerAction} className="mt-3 grid gap-2 border-t border-line pt-3 sm:grid-cols-2">
          <ScopeFields scope={scope} volver={volver} />
          <label className="sm:col-span-2">
            <span className={lbl}>Nombre</span>
            <input name="name" required className={field} />
          </label>
          <label>
            <span className={lbl}>Documento</span>
            <select name="doc_type" defaultValue="80" className={field}>
              {Object.entries(DOC_TYPES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className={lbl}>Número</span>
            <input name="doc_number" inputMode="numeric" className={field} />
          </label>
          <label>
            <span className={lbl}>Condición frente al IVA</span>
            <select name="iva_condition" defaultValue="consumidor_final" className={field}>
              {Object.entries(IVA_CONDITIONS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className={lbl}>Mail</span>
            <input name="email" type="email" className={field} />
          </label>
          <div className="sm:col-span-2">
            <SubmitButton variant="secondary" pendingText="…">Agregar cliente</SubmitButton>
          </div>
        </form>
      </section>
      <section className={card} aria-labelledby="productos">
        <h2 id="productos" className="text-body font-semibold">
          Productos y servicios
        </h2>
        <ul className="mt-2 divide-y divide-line text-ui">
          {products.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 py-2">
              <span className="min-w-0 truncate">
                {p.description} · <span className="num">{formatAmount(Number(p.unit_price))}</span>
                {p.iva_rate != null && <span className="text-muted"> · IVA {formatPercent(Number(p.iva_rate), 1, false)}</span>}
              </span>
              <form action={deleteProductAction}>
                <ScopeFields scope={scope} volver={volver} />
                <input type="hidden" name="id" value={p.id} />
                <SubmitButton variant="danger" pendingText="…">
                  Borrar
                </SubmitButton>
              </form>
            </li>
          ))}
          {products.length === 0 && <li className="py-2 text-muted">Cargá lo que facturás seguido para sumarlo en un toque.</li>}
        </ul>
        <form action={saveProductAction} className="mt-3 grid gap-2 border-t border-line pt-3 sm:grid-cols-[1fr_8rem_6rem]">
          <ScopeFields scope={scope} volver={volver} />
          <label>
            <span className={lbl}>Descripción</span>
            <input name="description" required className={field} />
          </label>
          <label>
            <span className={lbl}>Precio</span>
            <input name="unit_price" inputMode="decimal" required className={field} />
          </label>
          <label>
            <span className={lbl}>IVA</span>
            <select name="iva_rate" defaultValue="" className={field}>
              <option value="">No aplica</option>
              {["21", "10.5", "27", "5", "2.5", "0"].map((r) => (
                <option key={r} value={r}>
                  {r}%
                </option>
              ))}
            </select>
          </label>
          <div className="sm:col-span-3">
            <SubmitButton variant="secondary" pendingText="…">Agregar</SubmitButton>
          </div>
        </form>
      </section>
    </div>
  );
}
