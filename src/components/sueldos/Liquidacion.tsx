import { AlertTriangle, Calculator, FileDown, Users, Wallet } from "lucide-react";
import Link from "next/link";
import { importNoveltiesAction, liquidateAction, noveltyAction, payrollDataAction, payrollSettingsAction, pullPortalAction, runAction } from "@/app/liquidacion-actions";
import { BarList } from "@/components/charts/BarList";
import { Feedback } from "@/components/app/Feedback";
import { Card, EmptyState, MetricCard, SubmitButton, Table, ToneBadge, ViewSwitch, chipClass } from "@/components/ds";
import { fieldClass } from "@/components/ds/primitives";
import { formatDate, formatMoney, todayAR } from "@/lib/format";
import { cn } from "@/lib/utils";
import { periodLabel } from "@/modules/agent/intent";
import { CCTS, OWN_CCT, cctOf, scaleAt } from "@/modules/liquidacion/convenios";
import { END_REASON, NOVELTY_LABEL } from "@/modules/liquidacion/core";
import { FORMATS } from "@/modules/liquidacion/exportaciones";
import { GROUPS, PAYROLL_REPORTS } from "@/modules/liquidacion/reportes";
import { WhatsAppBatch, WhatsAppShare } from "@/components/share/WhatsAppShare";
import { listNovelties, listRuns, reports, RUN_KIND, RUN_STATUS, runView, scaleVersions, settingsOf } from "@/modules/liquidacion/server";
import { listEmployees } from "@/modules/payroll/server";
import type { ResolvedPayroll } from "@/modules/payroll/scope";

// Liquidación de sueldos (§2.q etapa 6), dentro de Sueldos y empleados: las
// liquidaciones del período, las novedades y los parámetros de la
// organización; el detalle con los recibos, el registro de cambios, los
// informes y los archivos. Faro calcula; una persona revisa y aprueba.

type SP = Record<string, string | undefined>;
const field = `mt-1 ${fieldClass}`;
const lbl = "text-meta text-muted";
const STATUS_TONE: Record<string, "neutral" | "progress" | "ok" | "done"> = { borrador: "progress", aprobada: "ok", publicada: "done", reemplazada: "neutral", anulada: "neutral" };

function Hidden({ r }: { r: ResolvedPayroll }) {
  return (
    <>
      <input type="hidden" name="ambito" value={r.scope.fromStudio ? "estudio" : "portal"} />
      <input type="hidden" name="org" value={r.scope.organizationId} />
    </>
  );
}

const prevMonth = () => {
  const [y, m] = todayAR().split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
};

/** Datos de liquidación en el legajo del empleado */
export async function PayrollDataForm({ r, e }: { r: ResolvedPayroll; e: { id: string; cct_key: string | null; category: string | null; basic_override: string | null; hours: number | null; affiliated: boolean; cbu: string | null; legajo: string | null } }) {
  const versions = await scaleVersions();
  const cct = cctOf(e.cct_key);
  const cats = cct && cct.key !== OWN_CCT.key ? scaleAt(cct, todayAR(), versions).categories : (await settingsOf(r.scope)).ownCategories;
  return (
    <form action={payrollDataAction} id="liquidacion" className="grid gap-2 rounded-md border border-line bg-surface p-4 sm:grid-cols-2">
      <Hidden r={r} />
      <input type="hidden" name="id" value={e.id} />
      <p className="text-title font-semibold text-ink sm:col-span-2">Datos para liquidar</p>
      <fieldset disabled={!r.scope.canManage} className="contents">
        <label className={lbl}>
          Convenio
          <select name="cct_key" defaultValue={e.cct_key ?? ""} className={field}>
            <option value="">Elegí…</option>
            {[...CCTS, OWN_CCT].map((c) => (
              <option key={c.key} value={c.key}>
                {c.name}
                {c.number !== "—" ? ` (${c.number})` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className={lbl}>
          Categoría
          <input name="category" list={`cats-${e.id}`} defaultValue={e.category ?? ""} placeholder={cats[0] ? `Ej.: ${cats[0].code}` : "Código"} className={field} />
          <datalist id={`cats-${e.id}`}>
            {cats.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </datalist>
        </label>
        <label className={lbl}>
          Básico pactado (si es fuera de convenio o sobre el de convenio)
          <input name="basic_override" inputMode="decimal" defaultValue={e.basic_override ? String(Number(e.basic_override)).replace(".", ",") : ""} className={field} />
        </label>
        <label className={lbl}>
          Horas mensuales (jornada reducida o por hora)
          <input name="hours" inputMode="numeric" defaultValue={e.hours ?? ""} className={field} />
        </label>
        <label className={lbl}>
          CBU (para la acreditación)
          <input name="cbu" inputMode="numeric" defaultValue={e.cbu ?? ""} className={field} />
        </label>
        <label className={lbl}>
          Número de legajo
          <input name="legajo" defaultValue={e.legajo ?? ""} className={field} />
        </label>
        <label className="flex items-center gap-2 text-ui sm:col-span-2">
          <input type="checkbox" name="affiliated" defaultChecked={e.affiliated} className="size-4 accent-navy" /> Afiliado al sindicato (cuota sindical en vez de aporte solidario)
        </label>
      </fieldset>
      {r.scope.canManage && (
        <div className="sm:col-span-2">
          <SubmitButton variant="secondary" pendingText="…">
            Guardar datos para liquidar
          </SubmitButton>
        </div>
      )}
    </form>
  );
}

export async function LiquidacionView({ r, sp }: { r: ResolvedPayroll; sp: SP }) {
  const ver = sp.ver === "novedades" || sp.ver === "ajustes" ? sp.ver : "liquidaciones";
  const href = (v: string) => `${r.base}/liquidacion${v === "liquidaciones" ? "" : `?ver=${v}`}`;
  return (
    <div className="grid gap-4">
      <Feedback sp={sp} />
      <ViewSwitch
        label="Liquidación"
        views={[
          { href: href("liquidaciones"), label: "Liquidaciones", active: ver === "liquidaciones", hint: "Faro calcula sueldo, aportes y contribuciones con el convenio y las novedades; vos revisás y aprobás. Las escalas y parámetros «a validar» se muestran en cada liquidación." },
          { href: href("novedades"), label: "Novedades", active: ver === "novedades", hint: "Horas, extras, ausencias, licencias, vacaciones, adelantos y embargos del período. Se cargan a mano, desde Excel o CSV, o se traen del portal." },
          { href: href("ajustes"), label: "Parámetros", active: ver === "ajustes", hint: "ART, seguro de vida, tipo de empleador, lugar de pago y la escala propia (fuera de convenio)." },
        ]}
      />
      {ver === "novedades" ? await Novelties({ r, sp }) : ver === "ajustes" ? await Settings({ r }) : await Runs({ r })}
    </div>
  );
}

async function Runs({ r }: { r: ResolvedPayroll }) {
  const [runs, staff] = await Promise.all([listRuns(r.scope), listEmployees(r.scope, true)]);
  const missing = staff.filter((e) => e.active && !e.cct_key);
  return (
    <>
      {r.scope.canManage && (
        <Card className="grid gap-3">
          <p className="text-title font-semibold text-ink">Liquidar</p>
          <form action={liquidateAction} className="grid gap-3 sm:grid-cols-4">
            <Hidden r={r} />
            <label className={lbl}>
              Período
              <input name="period" type="month" required defaultValue={prevMonth()} className={field} />
            </label>
            <label className={lbl}>
              Tipo
              <select name="kind" defaultValue="mensual" className={field}>
                {Object.entries(RUN_KIND).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className={lbl}>
              Fecha de pago
              <input name="pay_date" type="date" className={field} />
            </label>
            <div className="self-end">
              <SubmitButton pendingText="Liquidando…">Liquidar</SubmitButton>
            </div>
            <details className="sm:col-span-4">
              <summary className="cursor-pointer text-meta text-muted">Datos de la liquidación final (solo para ese tipo)</summary>
              <div className="mt-2 grid gap-3 sm:grid-cols-4">
                <label className={lbl}>
                  Empleado
                  <select name="employee_id" className={field}>
                    <option value="">Elegí…</option>
                    {staff.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.last_name}, {e.first_name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={lbl}>
                  Fecha de egreso
                  <input name="end_date" type="date" className={field} />
                </label>
                <label className={lbl}>
                  Motivo
                  <select name="reason" className={field}>
                    {Object.entries(END_REASON).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={lbl}>
                  Vacaciones ya gozadas en el año (días)
                  <input name="vacations_taken" inputMode="numeric" defaultValue="0" className={field} />
                </label>
                <label className="flex items-center gap-2 text-ui sm:col-span-4">
                  <input type="checkbox" name="notice_given" className="size-4 accent-navy" /> Se otorgó preaviso trabajado
                </label>
              </div>
            </details>
          </form>
          {missing.length > 0 && (
            <p className="flex items-start gap-2 text-meta text-warn">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {missing.length} {missing.length === 1 ? "empleado no tiene" : "empleados no tienen"} convenio cargado: {missing.slice(0, 4).map((e) => `${e.first_name} ${e.last_name}`).join(", ")}
              {missing.length > 4 ? "…" : ""}. Completalo en el legajo (Datos para liquidar).
            </p>
          )}
        </Card>
      )}
      {runs.length === 0 ? (
        <EmptyState icon={Calculator} title="Todavía no hay liquidaciones" text="Cargá el convenio y la categoría de cada empleado en el legajo, las novedades del mes y tocá Liquidar." />
      ) : (
        <Table label="Liquidaciones" minWidth={720}>
          <thead>
            <tr className="border-b border-line text-meta text-muted">
              <th className="px-3 py-2 font-medium">Período</th>
              <th className="px-3 py-2 font-medium">Tipo</th>
              <th className="px-3 py-2 font-medium">Estado</th>
              <th className="px-3 py-2 text-right font-medium">Empleados</th>
              <th className="px-3 py-2 text-right font-medium">Neto</th>
              <th className="px-3 py-2 text-right font-medium">Costo laboral</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((x) => (
              <tr key={x.id} className="border-b border-line last:border-0">
                <td className="px-3 py-2">
                  <Link href={`${r.base}/liquidacion/${x.id}`} prefetch={false} className="font-medium underline-offset-4 hover:underline">
                    {periodLabel(x.period)}
                  </Link>
                  {x.version > 1 && <span className="ml-1 text-meta text-muted">v{x.version}</span>}
                </td>
                <td className="px-3 py-2">{RUN_KIND[x.kind as keyof typeof RUN_KIND] ?? x.kind}</td>
                <td className="px-3 py-2">
                  <ToneBadge tone={STATUS_TONE[x.status] ?? "neutral"}>{RUN_STATUS[x.status] ?? x.status}</ToneBadge>
                  {x.origin === "agente" && <span className="ml-1 text-meta text-muted">· Agente</span>}
                </td>
                <td className="num px-3 py-2 text-right">{x.totals.employees}</td>
                <td className="num px-3 py-2 text-right">{formatMoney(x.totals.net)}</td>
                <td className="num px-3 py-2 text-right">{formatMoney(x.totals.cost)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}

async function Novelties({ r, sp }: { r: ResolvedPayroll; sp: SP }) {
  const period = sp.periodo && /^\d{4}-\d{2}$/.test(sp.periodo) ? sp.periodo : prevMonth();
  const [rows, staff] = await Promise.all([listNovelties(r.scope, period), listEmployees(r.scope, false)]);
  return (
    <>
      <form className="flex flex-wrap items-end gap-2" action={`${r.base}/liquidacion`}>
        <input type="hidden" name="ver" value="novedades" />
        <label className={lbl}>
          Período
          <input name="periodo" type="month" defaultValue={period} className={field} />
        </label>
        <button className="h-(--control-h) rounded-md border border-line bg-surface px-4 text-ui hover:border-muted">Ver</button>
      </form>
      {r.scope.canManage && (
        <div className="grid gap-3 lg:grid-cols-2">
          <Card className="grid gap-2">
            <p className="text-title font-semibold text-ink">Cargar una novedad</p>
            <form action={noveltyAction} className="grid gap-2 sm:grid-cols-2">
              <Hidden r={r} />
              <input type="hidden" name="period" value={period} />
              <label className={lbl}>
                Empleado
                <select name="employee_id" required className={field}>
                  {staff.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.last_name}, {e.first_name}
                    </option>
                  ))}
                </select>
              </label>
              <label className={lbl}>
                Novedad
                <select name="kind" className={field}>
                  {Object.entries(NOVELTY_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label className={lbl}>
                Cantidad (horas o días)
                <input name="quantity" inputMode="decimal" className={field} />
              </label>
              <label className={lbl}>
                Importe
                <input name="amount" inputMode="decimal" className={field} />
              </label>
              <label className={`${lbl} sm:col-span-2`}>
                Detalle
                <input name="detail" className={field} />
              </label>
              <div>
                <SubmitButton variant="secondary" pendingText="…">
                  Cargar
                </SubmitButton>
              </div>
            </form>
          </Card>
          <Card className="grid content-start gap-2">
            <p className="text-title font-semibold text-ink">Importar del Excel o CSV</p>
            <p className="text-meta text-muted">Columnas: CUIL, concepto (horas, horas extra 50, horas extra 100, ausencia, licencia, vacaciones, adelanto, embargo, ganancias, descuento), cantidad, importe y detalle.</p>
            <form action={importNoveltiesAction} className="flex flex-wrap items-end gap-2">
              <Hidden r={r} />
              <input type="hidden" name="period" value={period} />
              <input name="file" type="file" accept=".xlsx,.csv,.txt" required className="text-ui" />
              <SubmitButton variant="secondary" pendingText="Importando…">
                Importar
              </SubmitButton>
            </form>
            <form action={pullPortalAction}>
              <Hidden r={r} />
              <input type="hidden" name="period" value={period} />
              <SubmitButton variant="secondary" pendingText="…">
                Traer las novedades informadas en el portal
              </SubmitButton>
            </form>
          </Card>
        </div>
      )}
      {rows.length === 0 ? (
        <p className="text-ui text-muted">Sin novedades en {periodLabel(period)}.</p>
      ) : (
        <Table label="Novedades del período" minWidth={640}>
          <thead>
            <tr className="border-b border-line text-meta text-muted">
              <th className="px-3 py-2 font-medium">Empleado</th>
              <th className="px-3 py-2 font-medium">Novedad</th>
              <th className="px-3 py-2 text-right font-medium">Cantidad o importe</th>
              <th className="px-3 py-2 font-medium">Origen</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map(({ n, first, last }) => (
              <tr key={n.id} className="border-b border-line last:border-0">
                <td className="px-3 py-2">
                  {last}, {first}
                </td>
                <td className="px-3 py-2">
                  {NOVELTY_LABEL[n.kind as keyof typeof NOVELTY_LABEL] ?? n.kind}
                  {n.detail && <span className="text-meta text-muted"> · {n.detail}</span>}
                </td>
                <td className="num px-3 py-2 text-right">{n.amount != null ? formatMoney(Math.round(Number(n.amount) * 100)) : Number(n.quantity)}</td>
                <td className="px-3 py-2 text-meta text-muted">{n.source}</td>
                <td className="px-3 py-2 text-right">
                  {r.scope.canManage && (
                    <form action={noveltyAction}>
                      <Hidden r={r} />
                      <input type="hidden" name="period" value={period} />
                      <input type="hidden" name="borrar" value={n.id} />
                      <SubmitButton variant="secondary" pendingText="…">
                        Borrar
                      </SubmitButton>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}

async function Settings({ r }: { r: ResolvedPayroll }) {
  const s = await settingsOf(r.scope);
  return (
    <form action={payrollSettingsAction} className="grid gap-3 rounded-md border border-line bg-surface p-4 sm:grid-cols-2">
      <Hidden r={r} />
      <fieldset disabled={!r.scope.canManage} className="contents">
        <label className={lbl}>
          Empleador
          <select name="employer_kind" defaultValue={s.employerKind} className={field}>
            <option value="general">General (contribución reducida)</option>
            <option value="grande">Gran empresa de servicios o comercio</option>
          </select>
        </label>
        <label className={lbl}>
          ART (% de lo remunerativo)
          <input name="art_pct" inputMode="decimal" defaultValue={String(s.artPct).replace(".", ",")} className={field} />
        </label>
        <label className={lbl}>
          ART: suma fija por trabajador
          <input name="art_fixed" inputMode="decimal" defaultValue={String(s.artFixed).replace(".", ",")} className={field} />
        </label>
        <label className={lbl}>
          Seguro de vida obligatorio por trabajador
          <input name="life_insurance" inputMode="decimal" defaultValue={String(s.lifeInsurance).replace(".", ",")} className={field} />
        </label>
        <label className={lbl}>
          Lugar de pago (recibo)
          <input name="pay_place" defaultValue={s.payPlace ?? ""} className={field} />
        </label>
        <label className={lbl}>
          Último depósito de aportes (recibo)
          <input name="last_deposit" defaultValue={s.lastDeposit ?? ""} placeholder="Ej.: 09/2026 · Banco Nación · 10/10/2026" className={field} />
        </label>
        <label className={`${lbl} sm:col-span-2`}>
          Escala propia o fuera de convenio (una por línea: código; nombre; básico)
          <textarea name="own_categories" rows={4} defaultValue={s.ownCategories.map((c) => `${c.code};${c.name};${c.basic}`).join("\n")} className={`${field} py-2`} />
        </label>
      </fieldset>
      {r.scope.canManage && (
        <div className="sm:col-span-2">
          <SubmitButton pendingText="…">Guardar parámetros</SubmitButton>
        </div>
      )}
    </form>
  );
}

export async function RunDetail({ r, id, sp }: { r: ResolvedPayroll; id: string; sp: SP }) {
  const [v, rep] = await Promise.all([runView(r.scope, id), reports(r.scope, id)]);
  if (!v || !rep) return null;
  const { run, items } = v;
  const tab = ["informes", "cambios"].includes(sp.ver ?? "") ? sp.ver! : "recibos";
  const href = (t: string) => `${r.base}/liquidacion/${run.id}${t === "recibos" ? "" : `?ver=${t}`}`;
  const scales = Object.entries((run.basis.escalas ?? {}) as Record<string, { validFrom: string; status: string; source: string }>);
  const params = run.basis.parametros as { estado?: string } | undefined;
  const toValidate = scales.filter(([, x]) => x.status === "a_validar").map(([k]) => cctOf(k)?.name ?? k);
  const exportable = ["aprobada", "publicada"].includes(run.status);
  const file = (f: string) => `/api/sueldos/liquidacion/${run.id}?formato=${f}`;
  const reportBase = `/api/sueldos/reportes/${r.scope.organizationId}?`;
  // Los avisos de escalas o parámetros «a validar» van en la nota de arriba, no en cada recibo
  const receiptWarnings = items.reduce((n, it) => n + (it.warnings as string[]).filter((w) => !/a validar|de referencia/.test(w)).length, 0);
  return (
    <div className="grid gap-6">
      <Link href={`${r.base}/liquidacion`} className="text-meta text-muted hover:text-ink">
        ← Liquidaciones
      </Link>
      <Feedback sp={sp} />
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-title font-semibold">
          {RUN_KIND[run.kind as keyof typeof RUN_KIND]} · {periodLabel(run.period)}
          {run.version > 1 && <span className="text-meta font-normal text-muted"> · versión {run.version}</span>}
        </h2>
        <ToneBadge tone={STATUS_TONE[run.status] ?? "neutral"}>{RUN_STATUS[run.status] ?? run.status}</ToneBadge>
        {run.origin === "agente" && <ToneBadge tone="neutral">La preparó el Agente</ToneBadge>}
      </div>
      <section aria-label="Totales" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={Users} label="Empleados" value={run.totals.employees} hint={`Pago el ${formatDate(run.pay_date, "numeric")}`} />
        <MetricCard icon={Wallet} label="Neto a pagar" value={run.totals.net / 100} display={formatMoney(run.totals.net)} hint={`Remunerativo ${formatMoney(run.totals.rem)}`} />
        <MetricCard icon={Calculator} label="Costo laboral" value={run.totals.cost / 100} display={formatMoney(run.totals.cost)} hint={`Contribuciones ${formatMoney(run.totals.contrib)}`} />
        <MetricCard icon={AlertTriangle} label="Avisos" value={run.warnings} hint={run.warnings > receiptWarnings ? `${receiptWarnings} en los recibos · ${run.warnings - receiptWarnings} de escalas o parámetros a validar` : "Revisalos antes de aprobar"} />
      </section>
      {(toValidate.length > 0 || params?.estado === "a_validar") && (
        <p className="flex items-start gap-2 rounded-md border border-warn-line bg-warn-soft px-3 py-2 text-meta text-warn">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Calculada con {toValidate.length ? `escalas a validar (${toValidate.join(", ")})` : ""}
          {toValidate.length && params?.estado === "a_validar" ? " y " : ""}
          {params?.estado === "a_validar" ? "topes y alícuotas de seguridad social de referencia" : ""}. Revisalos con el acta y la norma vigentes. Esto no reemplaza el criterio de un contador.
        </p>
      )}

      {r.scope.canManage && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          {run.status === "borrador" && (
            <>
              <form action={runAction} className="flex flex-wrap items-center gap-3">
                <Hidden r={r} />
                <input type="hidden" name="id" value={run.id} />
                <input type="hidden" name="op" value="aprobar" />
                <label className="flex items-center gap-2 text-ui">
                  <input type="checkbox" name="confirmo" required className="size-4 accent-navy" /> Revisé conceptos, novedades y avisos
                </label>
                <SubmitButton pendingText="…" confirm="¿Aprobar la liquidación? Después se corrige duplicándola." confirmLabel="Aprobar">
                  Aprobar
                </SubmitButton>
              </form>
              <form action={runAction} className="flex flex-wrap items-center gap-2">
                <Hidden r={r} />
                <input type="hidden" name="id" value={run.id} />
                <input type="hidden" name="op" value="reliquidar" />
                <input name="reason" placeholder="Motivo (opcional)" className={cn(fieldClass, "w-48")} />
                <SubmitButton variant="secondary" pendingText="Re-liquidando…">
                  Re-liquidar
                </SubmitButton>
              </form>
            </>
          )}
          {run.status === "aprobada" && (
            <form action={runAction}>
              <Hidden r={r} />
              <input type="hidden" name="id" value={run.id} />
              <input type="hidden" name="op" value="publicar" />
              <SubmitButton pendingText="Publicando…" confirm="¿Publicar los recibos para la firma de cada empleado?" confirmLabel="Publicar">
                Publicar recibos para la firma
              </SubmitButton>
            </form>
          )}
          {["aprobada", "publicada"].includes(run.status) && (
            <form action={runAction} className="flex flex-wrap items-center gap-2">
              <Hidden r={r} />
              <input type="hidden" name="id" value={run.id} />
              <input type="hidden" name="op" value="duplicar" />
              <input name="reason" required placeholder="Motivo de la re-liquidación" className={cn(fieldClass, "w-56")} />
              <SubmitButton variant="secondary" pendingText="…">
                Duplicar y re-liquidar
              </SubmitButton>
            </form>
          )}
          {["borrador", "aprobada"].includes(run.status) && (
            <form action={runAction}>
              <Hidden r={r} />
              <input type="hidden" name="id" value={run.id} />
              <input type="hidden" name="op" value="anular" />
              <SubmitButton variant="secondary" pendingText="…" confirm="¿Anular la liquidación?" confirmLabel="Anular">
                Anular
              </SubmitButton>
            </form>
          )}
        </div>
      )}

      {exportable && r.scope.canManage && (
        <Card className="grid gap-2">
          <p className="flex items-center gap-2 text-title font-semibold text-ink">
            <FileDown className="size-4" aria-hidden /> Archivos
          </p>
          <ul className="flex flex-wrap gap-2 text-ui">
            <li>
              <a href={file("lsd")} className="underline underline-offset-4">{FORMATS.lsd.label}</a>
            </li>
            <li>
              <a href={file("f931")} className="underline underline-offset-4">{FORMATS.f931.label}</a>
            </li>
            <li>
              <a href={file("banco_csv")} className="underline underline-offset-4">Acreditación (CSV)</a>
            </li>
            <li>
              <a href={file("banco_txt")} className="underline underline-offset-4">Acreditación (TXT)</a>
            </li>
          </ul>
          <p className="text-meta text-muted">Los diseños de registro están a validar contra la versión vigente de ARCA y de cada banco antes de presentar.</p>
        </Card>
      )}

      <ViewSwitch
        label="Detalle de la liquidación"
        views={[
          { href: href("recibos"), label: "Recibos", active: tab === "recibos", count: items.length },
          { href: href("informes"), label: "Informes", active: tab === "informes" },
          { href: href("cambios"), label: "Cambios", active: tab === "cambios", count: run.changes.length },
        ]}
      />
      <WhatsAppBatch batch={sp.lote} />
      {tab === "recibos" && (
        <div className="divide-y divide-line rounded-md border border-line bg-surface">
          {items.map((it) => {
            const sn = it.snapshot as Record<string, string | null>;
            const warnings = (it.warnings as string[]).filter((w) => !/a validar|de referencia/.test(w));
            return (
              <details key={it.id}>
                <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <span className="font-medium">
                    {sn.name} <span className="text-meta font-normal text-muted">· {sn.category}</span>
                    {warnings.length > 0 && (
                      <ToneBadge tone="progress" className="ml-2">
                        {warnings.length} {warnings.length === 1 ? "aviso" : "avisos"}
                      </ToneBadge>
                    )}
                  </span>
                  <span className="num">{formatMoney(Number(it.net))}</span>
                </summary>
                <div className="grid gap-2 border-t border-line px-4 py-3">
                  {warnings.map((w) => (
                    <p key={w} className="text-meta text-warn">
                      {w}
                    </p>
                  ))}
                  <Table label={`Conceptos de ${sn.name}`} minWidth={520}>
                    <tbody>
                      {(it.lines as { code: string; name: string; kind: string; quantity: number | null; amount: number }[]).map((l, i) => (
                        <tr key={i} className="border-b border-line last:border-0">
                          <td className="px-3 py-1.5">{l.name}</td>
                          <td className="num px-3 py-1.5 text-right text-muted">{l.quantity ?? ""}</td>
                          <td className="px-3 py-1.5 text-meta text-muted">{l.kind === "rem" ? "Remunerativo" : l.kind === "norem" ? "No remunerativo" : l.kind === "desc" ? "Descuento" : "Contribución"}</td>
                          <td className="num px-3 py-1.5 text-right">{formatMoney(l.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                  <a href={`/api/sueldos/recibo/${it.id}`} target="_blank" rel="noreferrer" className="text-ui underline underline-offset-4">
                    {run.status === "borrador" ? "Vista previa del recibo (borrador)" : "Ver el recibo en PDF"}
                  </a>
                  {exportable && <WhatsAppShare type="recibo" ids={[it.id]} back={`${r.base}/liquidacion/${run.id}`} label="Enviar el recibo por WhatsApp" />}
                </div>
              </details>
            );
          })}
        </div>
      )}
      {tab === "informes" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="grid gap-3 lg:col-span-2">
            <p className="text-title font-semibold text-ink">Reportes de cierre</p>
            <ul className="grid gap-2 sm:grid-cols-2">
              {(Object.entries(PAYROLL_REPORTS) as [string, string][])
                .filter(([k]) => k !== "conceptos")
                .map(([k, label]) => (
                  <li key={k} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line px-3 py-2">
                    <span className="text-ui">{label}</span>
                    <span className="flex gap-2">
                      <a href={`${reportBase}reporte=${k}&liquidacion=${run.id}&formato=xlsx`} className={chipClass(false)}>
                        <FileDown className="size-3.5" aria-hidden /> Excel
                      </a>
                      <a href={`${reportBase}reporte=${k}&liquidacion=${run.id}&formato=pdf`} className={chipClass(false)}>
                        PDF
                      </a>
                    </span>
                  </li>
                ))}
            </ul>
            <form method="get" action={`/api/sueldos/reportes/${r.scope.organizationId}`} className="flex flex-wrap items-end gap-3 border-t border-line pt-3">
              <input type="hidden" name="reporte" value="conceptos" />
              <p className="w-full text-meta text-muted">Conceptos liquidados entre dos períodos (todas las liquidaciones aprobadas)</p>
              <label className={lbl}>
                Desde
                <input name="desde" type="month" defaultValue={`${run.period.slice(0, 4)}-01`} className={cn(fieldClass, "w-40")} />
              </label>
              <label className={lbl}>
                Hasta
                <input name="hasta" type="month" defaultValue={run.period} className={cn(fieldClass, "w-40")} />
              </label>
              <label className={lbl}>
                Agrupar por
                <select name="agrupar" defaultValue="periodo" className={cn(fieldClass, "w-40")}>
                  {Object.entries(GROUPS).map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              <label className={lbl}>
                Formato
                <select name="formato" defaultValue="xlsx" className={cn(fieldClass, "w-32")}>
                  <option value="xlsx">Excel</option>
                  <option value="pdf">PDF</option>
                </select>
              </label>
              <button className={chipClass(false)}>Descargar</button>
            </form>
            {r.scope.fromStudio && exportable && (
              <form action={runAction} className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
                <Hidden r={r} />
                <input type="hidden" name="id" value={run.id} />
                <input type="hidden" name="op" value="asiento" />
                <p className="min-w-0 flex-1 text-meta text-muted">El asiento de sueldos (bruto y contribuciones contra neto, cargas y retenciones) va a Contabilidad en borrador; si ya estaba, no se duplica.</p>
                <SubmitButton variant="secondary" pendingText="…">
                  Armar el asiento de sueldos
                </SubmitButton>
              </form>
            )}
          </Card>
          <Card>
            <BarList title="Costo laboral por empleado" bars={rep.byEmployee.slice(0, 15).map((x) => ({ label: x.name, value: x.cost, display: formatMoney(x.cost), hint: `Neto ${formatMoney(x.net)} · contribuciones ${formatMoney(x.contrib)}` }))} />
          </Card>
          <Card>
            <BarList title="Costo laboral por área" bars={rep.byArea.map((x) => ({ label: x.area, value: x.cost, display: formatMoney(x.cost), hint: `${x.employees} ${x.employees === 1 ? "empleado" : "empleados"}` }))} />
          </Card>
          <Card className="grid gap-2">
            <p className="text-title font-semibold text-ink">Cargas sociales</p>
            <dl className="grid grid-cols-2 gap-1 text-ui">
              <dt className="text-muted">Aportes (jubilación, PAMI, obra social)</dt>
              <dd className="num text-right">{formatMoney(rep.charges.aportes)}</dd>
              <dt className="text-muted">Cuotas y aportes sindicales</dt>
              <dd className="num text-right">{formatMoney(rep.charges.sindicales)}</dd>
              <dt className="text-muted">Contribuciones</dt>
              <dd className="num text-right">{formatMoney(rep.charges.contribuciones)}</dd>
              <dt className="text-muted">ART</dt>
              <dd className="num text-right">{formatMoney(rep.charges.art)}</dd>
              <dt className="text-muted">Seguro de vida</dt>
              <dd className="num text-right">{formatMoney(rep.charges.seguro)}</dd>
            </dl>
          </Card>
          <Card className="grid gap-2">
            <p className="text-title font-semibold text-ink">Acreditaciones</p>
            <p className="num text-title">{formatMoney(rep.credits.total)}</p>
            {rep.credits.missing.length > 0 && <p className="text-meta text-warn">Sin CBU (no entran en el archivo): {rep.credits.missing.join(", ")}</p>}
          </Card>
          <Card className="grid gap-2 lg:col-span-2">
            <p className="text-title font-semibold text-ink">Variaciones contra el período anterior</p>
            <Table label="Variaciones" minWidth={560}>
              <thead>
                <tr className="border-b border-line text-meta text-muted">
                  <th className="px-3 py-2 font-medium">Empleado</th>
                  <th className="px-3 py-2 text-right font-medium">Neto anterior</th>
                  <th className="px-3 py-2 text-right font-medium">Neto</th>
                  <th className="px-3 py-2 text-right font-medium">Variación</th>
                </tr>
              </thead>
              <tbody>
                {rep.variations.map((x) => (
                  <tr key={x.employeeId} className="border-b border-line last:border-0">
                    <td className="px-3 py-1.5">{x.name}</td>
                    <td className="num px-3 py-1.5 text-right">{x.previousNet == null ? "—" : formatMoney(x.previousNet)}</td>
                    <td className="num px-3 py-1.5 text-right">{formatMoney(x.net)}</td>
                    <td className="num px-3 py-1.5 text-right">
                      {x.flag === "nuevo" ? "Nuevo" : x.delta == null ? "—" : `${x.delta > 0 ? "+" : ""}${Math.round(x.delta * 100)} %`}
                      {(x.flag === "sube" || x.flag === "baja") && (
                        <ToneBadge tone="progress" className="ml-2">
                          Revisar
                        </ToneBadge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
          <Card className="grid gap-2 lg:col-span-2">
            <p className="text-title font-semibold text-ink">Nómina</p>
            <Table label="Nómina" minWidth={640}>
              <thead>
                <tr className="border-b border-line text-meta text-muted">
                  <th className="px-3 py-2 font-medium">Empleado</th>
                  <th className="px-3 py-2 font-medium">CUIL</th>
                  <th className="px-3 py-2 font-medium">Convenio y categoría</th>
                  <th className="px-3 py-2 font-medium">Área</th>
                  <th className="px-3 py-2 font-medium">Ingreso</th>
                </tr>
              </thead>
              <tbody>
                {rep.payroll.map((x, i) => (
                  <tr key={i} className="border-b border-line last:border-0">
                    <td className="px-3 py-1.5">{String(x.name ?? "")}</td>
                    <td className="num px-3 py-1.5">{String(x.cuil ?? "—")}</td>
                    <td className="px-3 py-1.5">
                      {String(x.cct ?? "")} · {String(x.category ?? "")}
                    </td>
                    <td className="px-3 py-1.5">{String(x.area ?? "—")}</td>
                    <td className="px-3 py-1.5">{formatDate(String(x.startDate ?? "") || null, "numeric")}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        </div>
      )}
      {tab === "cambios" &&
        (run.changes.length === 0 ? (
          <p className="text-ui text-muted">Sin cambios registrados. Cada re-liquidación y cada versión nueva deja acá qué cambió, para quién y por qué.</p>
        ) : (
          <Table label="Registro de cambios" minWidth={720}>
            <thead>
              <tr className="border-b border-line text-meta text-muted">
                <th className="px-3 py-2 font-medium">Cuándo</th>
                <th className="px-3 py-2 font-medium">Empleado</th>
                <th className="px-3 py-2 font-medium">Qué cambió</th>
                <th className="px-3 py-2 text-right font-medium">Neto antes</th>
                <th className="px-3 py-2 text-right font-medium">Neto después</th>
              </tr>
            </thead>
            <tbody>
              {[...run.changes].reverse().map((c, i) => (
                <tr key={i} className="border-b border-line align-top last:border-0">
                  <td className="px-3 py-1.5 text-meta text-muted">
                    {formatDate(c.at.slice(0, 10), "numeric")}
                    {c.actor ? ` · ${c.actor}` : ""}
                    {c.reason ? <span className="block">{c.reason}</span> : null}
                  </td>
                  <td className="px-3 py-1.5">{c.employee}</td>
                  <td className="px-3 py-1.5">{c.detail}</td>
                  <td className="num px-3 py-1.5 text-right">{c.before == null ? "—" : formatMoney(c.before)}</td>
                  <td className="num px-3 py-1.5 text-right">{c.after == null ? "—" : formatMoney(c.after)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        ))}
    </div>
  );
}
