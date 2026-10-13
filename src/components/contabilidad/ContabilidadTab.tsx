import { BookOpenCheck, Building, CalendarCheck2, Coins, FileSpreadsheet, ListTree, Lock, NotebookPen, Scale, Users, Wand2 } from "lucide-react";
import Link from "next/link";
import {
  applyTemplateAction,
  closeYearAction,
  createEntryAction,
  depreciationAction,
  fxAction,
  generateEntriesAction,
  mapAccountAction,
  registerDraftsAction,
  registerEntryAction,
  reopenYearAction,
  saveAccountAction,
  saveAssetAction,
  setLockAction,
  useTemplateAction,
  voidEntryAction,
} from "@/app/admin/contabilidad-actions";
import { Feedback } from "@/components/app/Feedback";
import { Card, EmptyState, Panel, SubmitButton, Table, Tag, ToneBadge, ViewSwitch, chipClass, fieldInlineClass } from "@/components/ds";
import { formatAmount, formatDate, todayAR } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AGING, fiscalYearOf } from "@/modules/contabilidad/core";
import { InflationView } from "./InflationView";
import { KIND_LABEL, TEMPLATES, type AccountKind } from "@/modules/contabilidad/plan";
import { accountsOf, currentYear, foreignBalances, ledgerOf, listAssets, listEntries, listTemplates, payables, receivables, settingsOf, statementsOf, trialOf, yearsOf } from "@/modules/contabilidad/server";

// Contabilidad general de una organización (A1, principios §22). La página ya
// validó la organización; acá todo se lee con el alcance del estudio.

type SP = Record<string, string | undefined>;
const VIEWS = [
  ["asientos", "Asientos"],
  ["plan", "Plan de cuentas"],
  ["libros", "Libros"],
  ["estados", "Estados contables"],
  ["ctacte", "Cuentas corrientes"],
  ["bienes", "Bienes de uso"],
  ["moneda", "Moneda extranjera"],
  ["inflacion", "Ajuste por inflación"],
  ["cierre", "Cierre"],
] as const;
const SOURCE: Record<string, string> = { manual: "Manual", modelo: "Modelo", factura: "Factura", compra: "Compra", sueldos: "Sueldos", cobro: "Cobro", pago: "Pago", banco: "Banco", conciliacion: "Conciliación", amortizacion: "Amortización", diferencia_cambio: "Diferencia de cambio", ajuste_inflacion: "Ajuste por inflación", refundicion: "Refundición", cierre: "Cierre", apertura: "Apertura" };
const STATUS_TONE: Record<string, "progress" | "ok" | "neutral"> = { borrador: "progress", registrado: "ok", anulado: "neutral" };
const $ = (c: number) => formatAmount(c / 100);
const iso = (v: string | undefined, fallback: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : fallback);

function Hidden({ orgId, ver }: { orgId: string; ver: string }) {
  return (
    <>
      <input type="hidden" name="org" value={orgId} />
      <input type="hidden" name="ver" value={ver} />
    </>
  );
}

function PeriodForm({ ver, from, to, extra }: { ver: string; from: string; to: string; extra?: React.ReactNode }) {
  return (
    <form method="get" className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="tab" value="contabilidad" />
      <input type="hidden" name="ver" value={ver} />
      <label className="grid gap-1 text-meta text-muted">
        Desde
        <input type="date" name="desde" defaultValue={from} className={cn(fieldInlineClass, "w-40")} />
      </label>
      <label className="grid gap-1 text-meta text-muted">
        Hasta
        <input type="date" name="hasta" defaultValue={to} className={cn(fieldInlineClass, "w-40")} />
      </label>
      {extra}
      <button className={chipClass(false)}>Ver</button>
    </form>
  );
}

function Exports({ orgId, report, from, to, code }: { orgId: string; report: string; from: string; to: string; code?: string }) {
  const q = (f: string) => `/api/contabilidad/${orgId}?reporte=${report}&desde=${from}&hasta=${to}${code ? `&cuenta=${code}` : ""}&formato=${f}`;
  return (
    <span className="flex flex-wrap gap-2">
      <a href={q("xlsx")} className={chipClass(false)}>
        <FileSpreadsheet className="size-3.5" aria-hidden /> Excel
      </a>
      <a href={q("pdf")} className={chipClass(false)}>
        PDF
      </a>
    </span>
  );
}

export async function ContabilidadTab({ orgId, studioId, sp }: { orgId: string; studioId: string; sp: SP }) {
  const s = { studioId, organizationId: orgId };
  const ver = VIEWS.some(([k]) => k === sp.ver) ? sp.ver! : "asientos";
  const [accounts, settings, fy] = await Promise.all([accountsOf(s), settingsOf(s), currentYear(s)]);
  const from = iso(sp.desde, fy.start);
  const to = iso(sp.hasta, todayAR());
  const href = (k: string) => `/admin/organizaciones/${orgId}?tab=contabilidad&ver=${k}`;
  const imputables = accounts.filter((a) => a.imputable && a.active);
  const accountOptions = imputables.map((a) => (
    <option key={a.code} value={a.code}>
      {a.code} · {a.name}
    </option>
  ));

  let body: React.ReactNode = null;
  if (ver === "asientos") {
    const [entries, templates] = await Promise.all([listEntries(s, { from, to, limit: 300 }), listTemplates(s)]);
    const drafts = entries.filter((e) => e.status === "borrador").length;
    body = (
      <>
        <Panel title="Asientos automáticos" icon={Wand2}>
          <p className="text-body text-muted">Faro arma los asientos de las facturas emitidas, las compras confirmadas (con sus percepciones), los sueldos, los cobros, los pagos y los impuestos y comisiones del banco. Cada uno guarda su origen y no se duplica. Quedan en borrador para revisar, salvo que actives «Registrar solos los asientos automáticos» en Vigía → Automatizaciones.</p>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <form action={generateEntriesAction} className="flex flex-wrap items-end gap-3">
              <Hidden orgId={orgId} ver="asientos" />
              <input type="hidden" name="from" value={from} />
              <input type="hidden" name="to" value={to} />
              <SubmitButton pendingText="Generando…">Generar los asientos del período</SubmitButton>
            </form>
            {drafts > 0 && (
              <form action={registerDraftsAction}>
                <Hidden orgId={orgId} ver="asientos" />
                <input type="hidden" name="from" value={from} />
                <input type="hidden" name="to" value={to} />
                <SubmitButton variant="secondary" pendingText="Registrando…" confirm={`¿Registrar los ${drafts} borradores del período? Toman número y quedan en los libros.`} confirmLabel="Registrar">
                  Registrar {drafts} {drafts === 1 ? "borrador" : "borradores"}
                </SubmitButton>
              </form>
            )}
          </div>
        </Panel>
        <PeriodForm ver="asientos" from={from} to={to} />
        <Panel title={`Asientos del período (${entries.length})`} icon={NotebookPen} bodyClassName="p-0">
          {entries.length === 0 ? (
            <div className="p-4 sm:p-5">
              <EmptyState icon={NotebookPen} title="Sin asientos en el período" text="Generá los automáticos o cargá uno a mano." />
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {entries.map((e) => {
                const total = e.lines.reduce((t, l) => t + l.debit, 0);
                return (
                  <li key={e.id}>
                    <details>
                      <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-5">
                        <span className="flex min-w-0 flex-wrap items-center gap-2 text-ui">
                          <span className="num text-muted">{e.number ? `Nº ${e.number}` : "—"}</span>
                          <span className="num">{formatDate(e.date, "numeric")}</span>
                          <span className={cn("text-ink", e.status === "anulado" && "line-through")}>{e.concept}</span>
                          <Tag>{SOURCE[e.source] ?? e.source}</Tag>
                          <ToneBadge tone={STATUS_TONE[e.status] ?? "neutral"}>{e.status === "borrador" ? "Borrador" : e.status === "registrado" ? "Registrado" : "Anulado"}</ToneBadge>
                        </span>
                        <span className="num text-ui">{$(total)}</span>
                      </summary>
                      <div className="grid gap-3 border-t border-line px-4 py-3 sm:px-5">
                        <Table label={`Líneas de ${e.concept}`} minWidth={520}>
                          <thead>
                            <tr className="border-b border-line text-meta text-muted">
                              <th className="px-3 py-1.5 font-medium">Cuenta</th>
                              <th className="px-3 py-1.5 text-right font-medium">Debe</th>
                              <th className="px-3 py-1.5 text-right font-medium">Haber</th>
                            </tr>
                          </thead>
                          <tbody>
                            {e.lines.map((l, i) => (
                              <tr key={i} className="border-b border-line last:border-0">
                                <td className="px-3 py-1.5">
                                  <span className="num text-muted">{l.code ?? ""}</span> {l.account}
                                  {l.detail && <span className="text-meta text-muted"> · {l.detail}</span>}
                                  {l.foreign && <span className="text-meta text-muted"> · {l.foreign.currency} {(l.foreign.amount / 100).toLocaleString("es-AR")} a $ {l.foreign.rate}</span>}
                                </td>
                                <td className="num px-3 py-1.5 text-right">{l.debit ? $(l.debit) : ""}</td>
                                <td className="num px-3 py-1.5 text-right">{l.credit ? $(l.credit) : ""}</td>
                              </tr>
                            ))}
                          </tbody>
                        </Table>
                        {e.status !== "anulado" && !["refundicion", "cierre", "apertura"].includes(e.source) && (
                          <div className="flex flex-wrap gap-2">
                            {e.status === "borrador" && (
                              <form action={registerEntryAction}>
                                <Hidden orgId={orgId} ver="asientos" />
                                <input type="hidden" name="id" value={e.id} />
                                <SubmitButton pendingText="…">Registrar</SubmitButton>
                              </form>
                            )}
                            <form action={voidEntryAction}>
                              <Hidden orgId={orgId} ver="asientos" />
                              <input type="hidden" name="id" value={e.id} />
                              <SubmitButton variant="secondary" pendingText="…" confirm={e.status === "borrador" ? "¿Borrar este borrador?" : "¿Anular este asiento? Queda en los registros, tachado."} confirmLabel={e.status === "borrador" ? "Borrar" : "Anular"}>
                                {e.status === "borrador" ? "Borrar" : "Anular"}
                              </SubmitButton>
                            </form>
                          </div>
                        )}
                      </div>
                    </details>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
        <Panel title="Nuevo asiento" icon={NotebookPen}>
          <form action={createEntryAction} className="grid gap-4">
            <Hidden orgId={orgId} ver="asientos" />
            <div className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
              <label className="grid gap-1 text-meta text-muted">
                Fecha
                <input type="date" name="date" required defaultValue={todayAR()} className={fieldInlineClass} />
              </label>
              <label className="grid gap-1 text-meta text-muted">
                Concepto
                <input name="concept" required maxLength={300} placeholder="Ej.: Aporte de los socios" className={fieldInlineClass} />
              </label>
            </div>
            <Table label="Líneas del asiento" minWidth={640}>
              <thead>
                <tr className="border-b border-line text-meta text-muted">
                  <th className="px-2 py-1.5 font-medium">Cuenta</th>
                  <th className="px-2 py-1.5 font-medium">Debe</th>
                  <th className="px-2 py-1.5 font-medium">Haber</th>
                  <th className="px-2 py-1.5 font-medium">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <tr key={i} className="border-b border-line last:border-0">
                    <td className="px-2 py-1.5">
                      <select name={`code${i}`} defaultValue="" aria-label={`Cuenta de la línea ${i + 1}`} className={cn(fieldInlineClass, "w-full min-w-56")}>
                        <option value="">—</option>
                        {accountOptions}
                      </select>
                    </td>
                    <td className="px-2 py-1.5">
                      <input name={`debe${i}`} inputMode="decimal" aria-label={`Debe de la línea ${i + 1}`} className={cn(fieldInlineClass, "w-32")} />
                    </td>
                    <td className="px-2 py-1.5">
                      <input name={`haber${i}`} inputMode="decimal" aria-label={`Haber de la línea ${i + 1}`} className={cn(fieldInlineClass, "w-32")} />
                    </td>
                    <td className="px-2 py-1.5">
                      <input name={`detalle${i}`} maxLength={120} aria-label={`Detalle de la línea ${i + 1}`} className={cn(fieldInlineClass, "w-full")} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-meta text-muted">
                Guardar también como modelo (opcional)
                <input name="modelo" maxLength={80} placeholder="Nombre del modelo" className={fieldInlineClass} />
              </label>
              <div className="grid content-end gap-2 text-ui">
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="modelo_importes" value="1" className="size-4 accent-navy" /> El modelo guarda los importes
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="registrar" value="1" className="size-4 accent-navy" /> Registrar ya (toma número)
                </label>
              </div>
            </div>
            <div>
              <SubmitButton pendingText="Guardando…">Guardar asiento</SubmitButton>
            </div>
          </form>
        </Panel>
        {templates.length > 0 && (
          <Panel title="Modelos de asiento" icon={ListTree} bodyClassName="p-0">
            <ul className="divide-y divide-line">
              {templates.map((t) => (
                <li key={t.id} className="px-4 py-3 sm:px-5">
                  <form action={useTemplateAction} className="grid gap-3">
                    <Hidden orgId={orgId} ver="asientos" />
                    <input type="hidden" name="id" value={t.id} />
                    <p className="text-ui font-semibold text-ink">{t.name}</p>
                    <div className="flex flex-wrap items-end gap-3">
                      <label className="grid gap-1 text-meta text-muted">
                        Fecha
                        <input type="date" name="date" required defaultValue={todayAR()} className={cn(fieldInlineClass, "w-40")} />
                      </label>
                      {t.lines.map((l) => (
                        <label key={`${l.code}-${l.side}`} className="grid gap-1 text-meta text-muted">
                          {l.code} ({l.side})
                          <input name={`monto_${l.code}`} inputMode="decimal" defaultValue={l.amount ? String(l.amount / 100).replace(".", ",") : ""} className={cn(fieldInlineClass, "w-32")} />
                        </label>
                      ))}
                      <SubmitButton variant="secondary" pendingText="…">
                        Usar
                      </SubmitButton>
                    </div>
                  </form>
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </>
    );
  } else if (ver === "plan") {
    body = (
      <>
        <Panel title="Plan de cuentas" icon={ListTree} action={<Exports orgId={orgId} report="plan" from={from} to={to} />} bodyClassName="p-0">
          <Table label="Plan de cuentas" minWidth={760}>
            <thead>
              <tr className="border-b border-line text-meta text-muted">
                <th className="px-3 py-2 font-medium">Código</th>
                <th className="px-3 py-2 font-medium">Cuenta</th>
                <th className="px-3 py-2 font-medium">Tipo</th>
                <th className="px-3 py-2 font-medium">Inflación</th>
                <th className="px-3 py-2 font-medium">Mapeo a sistemas</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id} className="border-b border-line align-top last:border-0">
                  <td className="num whitespace-nowrap px-3 py-2">{a.code}</td>
                  <td className={cn("px-3 py-2", !a.imputable && "font-semibold")}>
                    <details>
                      <summary className="cursor-pointer">
                        {a.name}
                        {a.currency !== "ARS" && <Tag className="ml-2">{a.currency}</Tag>}
                      </summary>
                      <form action={saveAccountAction} className="mt-2 grid gap-2">
                        <Hidden orgId={orgId} ver="plan" />
                        <input type="hidden" name="id" value={a.id} />
                        <input type="hidden" name="code" value={a.code} />
                        <input type="hidden" name="kind" value={a.kind} />
                        <input type="hidden" name="currency" value={a.currency} />
                        <input name="name" defaultValue={a.name} required aria-label="Nombre" className={fieldInlineClass} />
                        <label className="flex items-center gap-2 text-meta">
                          <input type="checkbox" name="imputable" value="1" defaultChecked={a.imputable} className="size-4 accent-navy" /> Imputable
                        </label>
                        <label className="flex items-center gap-2 text-meta">
                          <input type="checkbox" name="monetary" value="1" defaultChecked={a.monetary} className="size-4 accent-navy" /> Monetaria
                        </label>
                        <div>
                          <SubmitButton variant="secondary" pendingText="…">
                            Guardar
                          </SubmitButton>
                        </div>
                      </form>
                    </details>
                  </td>
                  <td className="px-3 py-2 text-meta">{KIND_LABEL[a.kind]}</td>
                  <td className="px-3 py-2 text-meta">{a.kind === "ingreso" || a.kind === "egreso" ? "Resultado" : a.monetary ? "Monetaria" : "No monetaria"}</td>
                  <td className="px-3 py-2">
                    {a.imputable && (
                      <form action={mapAccountAction} className="flex flex-wrap items-center gap-2">
                        <Hidden orgId={orgId} ver="plan" />
                        <input type="hidden" name="id" value={a.id} />
                        <select name="system" aria-label="Sistema" defaultValue={Object.keys(a.external_codes)[0] ?? "tango"} className={cn(fieldInlineClass, "w-32")}>
                          <option value="tango">Tango</option>
                          <option value="xubio">Xubio</option>
                          <option value="contabilium">Contabilium</option>
                        </select>
                        <input name="external" aria-label="Código en el sistema" defaultValue={Object.values(a.external_codes)[0] ?? ""} placeholder="Código" className={cn(fieldInlineClass, "w-28")} />
                        <SubmitButton variant="secondary" pendingText="…">
                          Mapear
                        </SubmitButton>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Panel>
        <div className="grid items-start gap-6 lg:grid-cols-2">
          <Panel title="Nueva cuenta" icon={ListTree}>
            <form action={saveAccountAction} className="grid gap-3 sm:grid-cols-2">
              <Hidden orgId={orgId} ver="plan" />
              <label className="grid gap-1 text-meta text-muted">
                Código
                <input name="code" required placeholder="1.1.01.04" className={fieldInlineClass} />
              </label>
              <label className="grid gap-1 text-meta text-muted">
                Nombre
                <input name="name" required className={fieldInlineClass} />
              </label>
              <label className="grid gap-1 text-meta text-muted">
                Tipo
                <select name="kind" className={fieldInlineClass}>
                  {(Object.keys(KIND_LABEL) as AccountKind[]).map((k) => (
                    <option key={k} value={k}>
                      {KIND_LABEL[k]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-meta text-muted">
                Moneda
                <select name="currency" className={fieldInlineClass}>
                  <option value="ARS">Pesos</option>
                  <option value="USD">Dólares</option>
                </select>
              </label>
              <label className="flex items-center gap-2 text-ui">
                <input type="checkbox" name="imputable" value="1" defaultChecked className="size-4 accent-navy" /> Imputable
              </label>
              <label className="flex items-center gap-2 text-ui">
                <input type="checkbox" name="monetary" value="1" defaultChecked className="size-4 accent-navy" /> Monetaria (ajuste por inflación)
              </label>
              <div className="sm:col-span-2">
                <SubmitButton pendingText="…">Agregar cuenta</SubmitButton>
              </div>
            </form>
          </Panel>
          <Panel title="Plantilla por rubro" icon={Building}>
            <p className="text-body text-muted">Plantilla actual: {TEMPLATES[settings.template] ?? settings.template}. Aplicar otra suma las cuentas que falten; no borra ni pisa las tuyas.</p>
            <form action={applyTemplateAction} className="mt-3 flex flex-wrap items-center gap-2">
              <Hidden orgId={orgId} ver="plan" />
              <select name="template" defaultValue={settings.template} aria-label="Plantilla" className={cn(fieldInlineClass, "w-56")}>
                {Object.entries(TEMPLATES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <SubmitButton variant="secondary" pendingText="…">
                Aplicar
              </SubmitButton>
            </form>
          </Panel>
        </div>
      </>
    );
  } else if (ver === "libros") {
    const libro = ["diario", "mayor", "sumas"].includes(sp.libro ?? "") ? sp.libro! : "sumas";
    const code = sp.cuenta && imputables.some((a) => a.code === sp.cuenta) ? sp.cuenta : imputables[0]?.code;
    const trial = libro === "sumas" ? await trialOf(s, from, to) : null;
    const mayor = libro === "mayor" && code ? await ledgerOf(s, code, from, to) : null;
    const diario = libro === "diario" ? await listEntries(s, { from, to, status: "registrado", limit: 1000 }) : null;
    body = (
      <>
        <PeriodForm
          ver="libros"
          from={from}
          to={to}
          extra={
            <>
              <input type="hidden" name="libro" value={libro} />
              {libro === "mayor" && (
                <label className="grid gap-1 text-meta text-muted">
                  Cuenta
                  <select name="cuenta" defaultValue={code} className={cn(fieldInlineClass, "w-72")}>
                    {accountOptions}
                  </select>
                </label>
              )}
            </>
          }
        />
        <nav aria-label="Libro" className="flex flex-wrap gap-2">
          {(
            [
              ["sumas", "Sumas y saldos"],
              ["diario", "Libro diario"],
              ["mayor", "Mayor"],
            ] as const
          ).map(([k, l]) => (
            <Link key={k} href={`${href("libros")}&libro=${k}&desde=${from}&hasta=${to}`} aria-current={libro === k ? "page" : undefined} className={chipClass(libro === k)}>
              {l}
            </Link>
          ))}
        </nav>
        {trial && (
          <Panel title="Balance de sumas y saldos" icon={Scale} action={<Exports orgId={orgId} report="sumas" from={from} to={to} />} bodyClassName="p-0">
            {trial.mirrored && <p className="px-4 pt-3 text-meta text-muted sm:px-5">Incluye los asientos espejados del sistema que maneja la contabilidad.</p>}
            <Table label="Sumas y saldos" minWidth={720}>
              <thead>
                <tr className="border-b border-line text-meta text-muted">
                  <th className="px-3 py-2 font-medium">Cuenta</th>
                  <th className="px-3 py-2 text-right font-medium">Debe</th>
                  <th className="px-3 py-2 text-right font-medium">Haber</th>
                  <th className="px-3 py-2 text-right font-medium">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {trial.rows.map((r) => (
                  <tr key={r.code} className="border-b border-line last:border-0">
                    <td className="px-3 py-2">
                      <span className="num text-muted">{r.code}</span> {r.name}
                    </td>
                    <td className="num px-3 py-2 text-right">{$(r.debit)}</td>
                    <td className="num px-3 py-2 text-right">{$(r.credit)}</td>
                    <td className="num px-3 py-2 text-right">
                      {$(Math.abs(r.balance))} {r.balance ? (r.balance > 0 ? "D" : "A") : ""}
                    </td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="px-3 py-2">Totales {trial.balanced ? "" : "(no balancea)"}</td>
                  <td className="num px-3 py-2 text-right">{$(trial.debit)}</td>
                  <td className="num px-3 py-2 text-right">{$(trial.credit)}</td>
                  <td />
                </tr>
              </tbody>
            </Table>
          </Panel>
        )}
        {mayor && (
          <Panel title={`Mayor · ${mayor.account.code} ${mayor.account.name}`} icon={BookOpenCheck} action={<Exports orgId={orgId} report="mayor" from={from} to={to} code={code} />} bodyClassName="p-0">
            <Table label="Mayor" minWidth={640}>
              <thead>
                <tr className="border-b border-line text-meta text-muted">
                  <th className="px-3 py-2 font-medium">Fecha</th>
                  <th className="px-3 py-2 font-medium">Concepto</th>
                  <th className="px-3 py-2 text-right font-medium">Debe</th>
                  <th className="px-3 py-2 text-right font-medium">Haber</th>
                  <th className="px-3 py-2 text-right font-medium">Saldo</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-line">
                  <td className="px-3 py-2" />
                  <td className="px-3 py-2 text-muted">Saldo anterior</td>
                  <td />
                  <td />
                  <td className="num px-3 py-2 text-right">{$(mayor.opening)}</td>
                </tr>
                {mayor.rows.map((r, i) => (
                  <tr key={`${r.entryId}-${i}`} className="border-b border-line last:border-0">
                    <td className="num whitespace-nowrap px-3 py-2">{formatDate(r.date, "numeric")}</td>
                    <td className="px-3 py-2">
                      {r.number ? <span className="num text-muted">Nº {r.number} · </span> : null}
                      {r.concept}
                    </td>
                    <td className="num px-3 py-2 text-right">{r.debit ? $(r.debit) : ""}</td>
                    <td className="num px-3 py-2 text-right">{r.credit ? $(r.credit) : ""}</td>
                    <td className="num px-3 py-2 text-right">{$(r.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Panel>
        )}
        {diario && (
          <Panel title="Libro diario" icon={BookOpenCheck} action={<Exports orgId={orgId} report="diario" from={from} to={to} />} bodyClassName="p-0">
            {diario.length === 0 ? (
              <div className="p-4 sm:p-5">
                <EmptyState icon={BookOpenCheck} title="Sin asientos registrados en el período" />
              </div>
            ) : (
              <Table label="Libro diario" minWidth={720}>
                <thead>
                  <tr className="border-b border-line text-meta text-muted">
                    <th className="px-3 py-2 font-medium">Nº</th>
                    <th className="px-3 py-2 font-medium">Fecha</th>
                    <th className="px-3 py-2 font-medium">Cuenta</th>
                    <th className="px-3 py-2 text-right font-medium">Debe</th>
                    <th className="px-3 py-2 text-right font-medium">Haber</th>
                  </tr>
                </thead>
                <tbody>
                  {[...diario]
                    .sort((a, b) => a.date.localeCompare(b.date) || (a.number ?? 0) - (b.number ?? 0))
                    .flatMap((e) => [
                      <tr key={e.id} className="border-t border-line bg-canvas">
                        <td className="num px-3 py-2">{e.number}</td>
                        <td className="num whitespace-nowrap px-3 py-2">{formatDate(e.date, "numeric")}</td>
                        <td className="px-3 py-2 font-semibold" colSpan={3}>
                          {e.concept}
                        </td>
                      </tr>,
                      ...e.lines.map((l, i) => (
                        <tr key={`${e.id}-${i}`}>
                          <td />
                          <td />
                          <td className={cn("px-3 py-1.5", l.credit ? "pl-8" : "")}>
                            <span className="num text-muted">{l.code}</span> {l.account}
                          </td>
                          <td className="num px-3 py-1.5 text-right">{l.debit ? $(l.debit) : ""}</td>
                          <td className="num px-3 py-1.5 text-right">{l.credit ? $(l.credit) : ""}</td>
                        </tr>
                      )),
                    ])}
                </tbody>
              </Table>
            )}
          </Panel>
        )}
      </>
    );
  } else if (ver === "estados") {
    const st = await statementsOf(s, from, to);
    const block = (title: string, rows: { code: string; name: string; amount: number }[], total: number) => (
      <div className="grid gap-1">
        <p className="text-meta font-semibold uppercase tracking-wide text-muted">{title}</p>
        {rows.map((r) => (
          <p key={r.code} className="flex justify-between gap-3 text-ui">
            <span className="min-w-0">{r.name}</span>
            <span className="num">{$(r.amount)}</span>
          </p>
        ))}
        <p className="flex justify-between gap-3 border-t border-line pt-1 text-ui font-semibold">
          <span>Total</span>
          <span className="num">{$(total)}</span>
        </p>
      </div>
    );
    const sp2 = st.situacion;
    body = (
      <>
        <PeriodForm ver="estados" from={from} to={to} />
        <p className="flex flex-wrap items-center gap-2 text-ui">
          {st.cierra ? <ToneBadge tone="ok">Activo = pasivo + patrimonio neto</ToneBadge> : <ToneBadge tone="danger">No cierra: revisá los asientos o las cuentas sin plan</ToneBadge>}
          <Exports orgId={orgId} report="estados" from={from} to={to} />
        </p>
        <div className="grid items-start gap-6 lg:grid-cols-2">
          <Panel title={`Situación patrimonial al ${formatDate(to, "numeric")}`} icon={Scale}>
            <div className="grid gap-5">
              {block("Activo corriente", sp2.activoCorriente, sp2.activoCorriente.reduce((t, r) => t + r.amount, 0))}
              {block("Activo no corriente", sp2.activoNoCorriente, sp2.activoNoCorriente.reduce((t, r) => t + r.amount, 0))}
              <p className="flex justify-between text-title font-semibold text-ink">
                <span>Total del activo</span>
                <span className="num">{$(sp2.activo)}</span>
              </p>
              {block("Pasivo corriente", sp2.pasivoCorriente, sp2.pasivoCorriente.reduce((t, r) => t + r.amount, 0))}
              {block("Pasivo no corriente", sp2.pasivoNoCorriente, sp2.pasivoNoCorriente.reduce((t, r) => t + r.amount, 0))}
              {block("Patrimonio neto", [...sp2.patrimonio, { code: "res", name: "Resultado del ejercicio", amount: sp2.resultado }], sp2.patrimonioNeto)}
              <p className="flex justify-between text-title font-semibold text-ink">
                <span>Pasivo más patrimonio neto</span>
                <span className="num">{$(sp2.pasivo + sp2.patrimonioNeto)}</span>
              </p>
            </div>
          </Panel>
          <Panel title={`Resultados del ${formatDate(from, "numeric")} al ${formatDate(to, "numeric")}`} icon={Scale}>
            <div className="grid gap-5">
              {block("Resultados positivos", st.resultados.ingresos, st.resultados.totalIngresos)}
              {block("Resultados negativos", st.resultados.egresos, st.resultados.totalEgresos)}
              <p className="flex justify-between text-title font-semibold text-ink">
                <span>{st.resultados.resultado >= 0 ? "Ganancia" : "Pérdida"} del período</span>
                <span className="num">{$(Math.abs(st.resultados.resultado))}</span>
              </p>
            </div>
          </Panel>
        </div>
        <p className="text-meta text-muted">Estados en moneda nominal armados con los asientos registrados. La versión en moneda homogénea está en «Ajuste por inflación». Son datos para el contador: la firma y el dictamen son de un profesional matriculado.</p>
      </>
    );
  } else if (ver === "ctacte") {
    const [cl, pr] = await Promise.all([receivables(s, to), payables(s, to)]);
    const table = (title: string, report: string, who: string, a: Awaited<ReturnType<typeof receivables>>) => (
      <Panel title={title} icon={Users} action={<Exports orgId={orgId} report={report} from={from} to={to} />} bodyClassName="p-0">
        {a.rows.length === 0 ? (
          <div className="p-4 sm:p-5">
            <EmptyState icon={Users} title="Sin saldos pendientes" />
          </div>
        ) : (
          <Table label={title} minWidth={760}>
            <thead>
              <tr className="border-b border-line text-meta text-muted">
                <th className="px-3 py-2 font-medium">{who}</th>
                {AGING.map((h) => (
                  <th key={h} className="px-3 py-2 text-right font-medium">
                    {h}
                  </th>
                ))}
                <th className="px-3 py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {a.rows.map((r) => (
                <tr key={r.party} className="border-b border-line last:border-0">
                  <td className="px-3 py-2">{r.party}</td>
                  {r.buckets.map((b, i) => (
                    <td key={i} className={cn("num px-3 py-2 text-right", i >= 3 && b ? "text-danger" : "")}>
                      {b ? $(b) : ""}
                    </td>
                  ))}
                  <td className="num px-3 py-2 text-right font-semibold">{$(r.total)}</td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className="px-3 py-2">Totales</td>
                {a.totals.map((t, i) => (
                  <td key={i} className="num px-3 py-2 text-right">
                    {$(t)}
                  </td>
                ))}
                <td className="num px-3 py-2 text-right">{$(a.total)}</td>
              </tr>
            </tbody>
          </Table>
        )}
      </Panel>
    );
    body = (
      <>
        <p className="text-body text-muted">Saldos pendientes al {formatDate(to, "numeric")}: facturas emitidas sin cobrar (menos las notas de crédito) y compras confirmadas sin pago conciliado, por antigüedad desde el vencimiento.</p>
        {table("Clientes", "clientes", "Cliente", cl)}
        {table("Proveedores", "proveedores", "Proveedor", pr)}
      </>
    );
  } else if (ver === "bienes") {
    const assets = await listAssets(s, to);
    const assetAccounts = imputables.filter((a) => a.kind === "activo" && !a.monetary && a.role !== "amortizacion_acumulada");
    body = (
      <>
        <Panel title="Bienes de uso" icon={Building} action={<Exports orgId={orgId} report="bienes" from={from} to={to} />} bodyClassName="p-0">
          {assets.length === 0 ? (
            <div className="p-4 sm:p-5">
              <EmptyState icon={Building} title="Sin bienes de uso" text="Cargalos con su costo y vida útil: Faro calcula la amortización lineal." />
            </div>
          ) : (
            <Table label="Bienes de uso" minWidth={760}>
              <thead>
                <tr className="border-b border-line text-meta text-muted">
                  <th className="px-3 py-2 font-medium">Bien</th>
                  <th className="px-3 py-2 font-medium">Alta</th>
                  <th className="px-3 py-2 text-right font-medium">Costo</th>
                  <th className="px-3 py-2 text-right font-medium">Amortización acumulada</th>
                  <th className="px-3 py-2 text-right font-medium">Valor residual contable</th>
                </tr>
              </thead>
              <tbody>
                {assets.map((a) => (
                  <tr key={a.id} className="border-b border-line last:border-0">
                    <td className="px-3 py-2">
                      {a.name} <span className="text-meta text-muted">· {a.life_months} meses</span>
                    </td>
                    <td className="num px-3 py-2">{formatDate(a.acquired_on, "numeric")}</td>
                    <td className="num px-3 py-2 text-right">{$(a.cost)}</td>
                    <td className="num px-3 py-2 text-right">{$(a.accumulated)}</td>
                    <td className="num px-3 py-2 text-right">{$(a.net)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Panel>
        <div className="grid items-start gap-6 lg:grid-cols-2">
          <Panel title="Nuevo bien de uso" icon={Building}>
            <form action={saveAssetAction} className="grid gap-3 sm:grid-cols-2">
              <Hidden orgId={orgId} ver="bienes" />
              <label className="grid gap-1 text-meta text-muted sm:col-span-2">
                Descripción
                <input name="name" required maxLength={120} className={fieldInlineClass} />
              </label>
              <label className="grid gap-1 text-meta text-muted">
                Cuenta
                <select name="account" className={fieldInlineClass}>
                  {assetAccounts.map((a) => (
                    <option key={a.code} value={a.code}>
                      {a.code} · {a.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-meta text-muted">
                Fecha de alta
                <input type="date" name="date" required defaultValue={todayAR()} className={fieldInlineClass} />
              </label>
              <label className="grid gap-1 text-meta text-muted">
                Costo
                <input name="cost" required inputMode="decimal" className={fieldInlineClass} />
              </label>
              <label className="grid gap-1 text-meta text-muted">
                Valor residual
                <input name="residual" inputMode="decimal" defaultValue="0" className={fieldInlineClass} />
              </label>
              <label className="grid gap-1 text-meta text-muted">
                Vida útil
                <input name="life" required inputMode="numeric" defaultValue="5" className={fieldInlineClass} />
              </label>
              <label className="grid gap-1 text-meta text-muted">
                Unidad
                <select name="unit" className={fieldInlineClass}>
                  <option value="anios">Años</option>
                  <option value="meses">Meses</option>
                </select>
              </label>
              <div className="sm:col-span-2">
                <SubmitButton pendingText="…">Agregar bien</SubmitButton>
              </div>
            </form>
          </Panel>
          <Panel title="Asiento de amortización" icon={CalendarCheck2}>
            <p className="text-body text-muted">Amortización lineal mensual desde el mes de alta. Uno por período: si ya está, no se repite.</p>
            <form action={depreciationAction} className="mt-3 flex flex-wrap items-end gap-3">
              <Hidden orgId={orgId} ver="bienes" />
              <label className="grid gap-1 text-meta text-muted">
                Desde
                <input type="date" name="from" defaultValue={from} className={cn(fieldInlineClass, "w-40")} />
              </label>
              <label className="grid gap-1 text-meta text-muted">
                Hasta
                <input type="date" name="to" defaultValue={fy.end} className={cn(fieldInlineClass, "w-40")} />
              </label>
              <SubmitButton variant="secondary" pendingText="…">
                Generar
              </SubmitButton>
            </form>
          </Panel>
        </div>
      </>
    );
  } else if (ver === "moneda") {
    const fx = await foreignBalances(s, to);
    body = (
      <>
        <Panel title="Cuentas en moneda extranjera" icon={Coins} bodyClassName="p-0">
          <Table label="Cuentas en moneda extranjera" minWidth={560}>
            <thead>
              <tr className="border-b border-line text-meta text-muted">
                <th className="px-3 py-2 font-medium">Cuenta</th>
                <th className="px-3 py-2 text-right font-medium">Saldo en la moneda</th>
                <th className="px-3 py-2 text-right font-medium">Saldo en pesos (libro)</th>
              </tr>
            </thead>
            <tbody>
              {fx.map((b) => (
                <tr key={b.account.code} className="border-b border-line last:border-0">
                  <td className="px-3 py-2">
                    <span className="num text-muted">{b.account.code}</span> {b.account.name}
                  </td>
                  <td className="num px-3 py-2 text-right">
                    {b.account.currency} {(b.foreign / 100).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                  </td>
                  <td className="num px-3 py-2 text-right">{$(b.ars)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Panel>
        <Card>
          <p className="text-body text-muted">Valuá las cuentas al tipo de cambio de cierre: Faro arma un asiento de diferencia de cambio por cuenta, en borrador.</p>
          <form action={fxAction} className="mt-3 flex flex-wrap items-end gap-3">
            <Hidden orgId={orgId} ver="moneda" />
            <label className="grid gap-1 text-meta text-muted">
              Fecha
              <input type="date" name="date" defaultValue={to} className={cn(fieldInlineClass, "w-40")} />
            </label>
            <label className="grid gap-1 text-meta text-muted">
              Tipo de cambio de cierre
              <input name="rate" required inputMode="decimal" placeholder="Ej.: 1050" className={cn(fieldInlineClass, "w-40")} />
            </label>
            <SubmitButton variant="secondary" pendingText="…">
              Calcular diferencias
            </SubmitButton>
          </form>
        </Card>
      </>
    );
  } else if (ver === "inflacion") {
    // Por defecto, el último ejercicio terminado; con «hasta», el ejercicio de esa fecha
    const end = sp.hasta ? fiscalYearOf(to, settings.year_end).end : fiscalYearOf(new Date(Date.parse(fy.start) - 86400000).toISOString().slice(0, 10), settings.year_end).end;
    body = <InflationView s={s} orgId={orgId} end={end} />;
  } else {
    const years = await yearsOf(s);
    body = (
      <>
        <Panel title="Ejercicios" icon={CalendarCheck2}>
          <p className="text-body text-muted">
            El ejercicio cierra el {settings.year_end.split("-").reverse().join("/")}. Al cerrar, Faro registra la refundición de las cuentas de resultado, el asiento de cierre y la apertura del ejercicio siguiente, y bloquea el período.
          </p>
          <form action={closeYearAction} className="mt-3 flex flex-wrap items-end gap-3">
            <Hidden orgId={orgId} ver="cierre" />
            <label className="grid gap-1 text-meta text-muted">
              Cierre del ejercicio
              <input type="date" name="end" defaultValue={fy.end} className={cn(fieldInlineClass, "w-40")} />
            </label>
            <SubmitButton pendingText="Cerrando…" confirm="¿Cerrar el ejercicio? Se registran los asientos de cierre y apertura y el período queda bloqueado." confirmLabel="Cerrar">
              Cerrar el ejercicio
            </SubmitButton>
          </form>
          {years.length > 0 && (
            <ul className="mt-4 divide-y divide-line rounded-md border border-line">
              {years.map((y) => (
                <li key={y.id} className="grid gap-2 px-4 py-3">
                  <p className="flex flex-wrap items-center gap-2 text-ui">
                    Ejercicio del {formatDate(y.start, "numeric")} al {formatDate(y.end, "numeric")}
                    <ToneBadge tone={y.status === "cerrado" ? "ok" : "progress"}>{y.status === "cerrado" ? "Cerrado" : "Abierto"}</ToneBadge>
                    {y.reopened_at && <span className="text-meta text-muted">Reabierto el {formatDate(y.reopened_at, "numeric")}</span>}
                  </p>
                  {y.status === "cerrado" && (
                    <form action={reopenYearAction} className="flex flex-wrap items-center gap-2">
                      <Hidden orgId={orgId} ver="cierre" />
                      <input type="hidden" name="id" value={y.id} />
                      <input name="reason" required maxLength={300} placeholder="Motivo (queda en la auditoría)" aria-label="Motivo de la reapertura" className={cn(fieldInlineClass, "w-72")} />
                      <SubmitButton variant="secondary" pendingText="…" confirm="¿Reabrir el ejercicio? Se anulan sus asientos de cierre y la apertura." confirmLabel="Reabrir">
                        Reabrir
                      </SubmitButton>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Bloqueo de períodos" icon={Lock}>
          <p className="text-body text-muted">{settings.locked_until ? `Bloqueado hasta el ${formatDate(settings.locked_until, "numeric")}: no se crean, registran ni anulan asientos con fecha hasta ahí.` : "Sin bloqueo."}</p>
          <form action={setLockAction} className="mt-3 flex flex-wrap items-end gap-3">
            <Hidden orgId={orgId} ver="cierre" />
            <label className="grid gap-1 text-meta text-muted">
              Bloquear hasta
              <input type="date" name="until" defaultValue={settings.locked_until ?? ""} className={cn(fieldInlineClass, "w-40")} />
            </label>
            <SubmitButton variant="secondary" pendingText="…">
              Guardar
            </SubmitButton>
          </form>
          <p className="mt-2 text-meta text-muted">Dejá la fecha vacía y guardá para quitar el bloqueo. Cambiarlo queda en la auditoría.</p>
        </Panel>
      </>
    );
  }

  return (
    <div className="grid gap-6">
      <Feedback sp={sp} />
      <ViewSwitch label="Contabilidad" views={VIEWS.map(([k, l]) => ({ href: href(k), label: l, active: ver === k }))} />
      {body}
    </div>
  );
}
