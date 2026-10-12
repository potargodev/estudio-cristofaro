import { AlertTriangle, CheckCircle2, CircleDashed, ClipboardCheck, FileSearch, Receipt } from "lucide-react";
import Link from "next/link";
import { ivaMarkAction } from "@/app/admin/iva-actions";
import { BarList } from "@/components/charts/BarList";
import { Feedback } from "@/components/app/Feedback";
import { Card, EmptyState, MetricCard, Panel, SubmitButton, Table, ToneBadge, ViewSwitch } from "@/components/ds";
import { fieldClass } from "@/components/ds/primitives";
import type { StaffUser } from "@/lib/auth";
import { formatDate, formatMoney, formatPercent, todayAR } from "@/lib/format";
import { ANOMALY_LABEL, conditionOf, creditOf } from "@/modules/iva/core";
import { analyze, isPeriod, readyToFile, type Book } from "@/modules/iva/server";
import { periodLabel } from "@/modules/agent/intent";

// Libro IVA (sub-pestaña de ARCA en la ficha de la organización, §2.o y §2.q):
// el análisis del período antes de presentar. Datos para el contador, no una
// validación.

const SEV_TONE = { alta: "danger", media: "progress", baja: "neutral" } as const;
const SEV_LABEL = { alta: "Alta", media: "Media", baja: "Baja" } as const;

export async function IvaTab({ me, orgId, sp }: { me: StaffUser; orgId: string; sp: Record<string, string | undefined> }) {
  const [y, m] = todayAR().split("-").map(Number);
  const fallback = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  const period = sp.periodo && isPeriod(sp.periodo) ? sp.periodo : fallback;
  const book: Book = sp.libro === "ventas" ? "ventas" : "compras";
  const onlyMarked = sp.filtro === "marcados";
  const a = await analyze({ studioId: me.studioId, organizationId: orgId }, period, book);
  const base = (q: Record<string, string>) => `/admin/organizaciones/${orgId}?${new URLSearchParams({ tab: "iva", periodo: period, libro: book, ...q })}`;
  const marks = new Map(a.marks.map((x) => [x.row_id, x]));
  const rows = onlyMarked ? a.rows.filter((r) => marks.has(r.id)) : a.rows;
  const fiscalLabel = book === "compras" ? "Crédito fiscal" : "Débito fiscal";
  const prev = a.previous[0];
  const delta = prev && prev.fiscal ? Math.round(((a.summary.fiscal - prev.fiscal) / Math.abs(prev.fiscal)) * 100) : null;
  const ready = readyToFile(a.checklist);
  const topParties = a.summary.byParty.slice(0, 8);
  const rest = a.summary.byParty.slice(8);
  return (
    <div className="grid gap-5">
      <Feedback sp={sp} />
      <form method="get" className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="tab" value="iva" />
        <input type="hidden" name="libro" value={book} />
        <label className="text-meta text-muted">
          Período
          <input type="month" name="periodo" defaultValue={period} max={todayAR().slice(0, 7)} className={`mt-1 ${fieldClass}`} />
        </label>
        <SubmitButton variant="secondary" pendingText="Analizando…">
          Analizar
        </SubmitButton>
      </form>
      <ViewSwitch
        label="Libro"
        views={[
          { href: `/admin/organizaciones/${orgId}?${new URLSearchParams({ tab: "iva", periodo: period, libro: "compras" })}`, label: "Libro IVA compras", active: book === "compras" },
          { href: `/admin/organizaciones/${orgId}?${new URLSearchParams({ tab: "iva", periodo: period, libro: "ventas" })}`, label: "Libro IVA ventas", active: book === "ventas" },
        ]}
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard icon={Receipt} label={`${fiscalLabel} · ${periodLabel(period)}`} value={a.summary.fiscal / 100} display={formatMoney(a.summary.fiscal)} delta={delta != null ? { value: delta, goodWhen: book === "compras" ? "up" : "down", label: "contra el período anterior" } : undefined} hint={prev ? `Antes: ${formatMoney(prev.fiscal)} en ${periodLabel(prev.period)}` : undefined} />
        <MetricCard icon={FileSearch} label="Comprobantes" value={a.summary.count} hint={`Total ${formatMoney(a.summary.total)}`} />
        <MetricCard icon={AlertTriangle} label="Anomalías" value={a.anomalies.length} hint={`${a.anomalies.filter((x) => x.severity === "alta").length} de importancia alta`} />
      </div>

      <Panel title="Antes de presentar" icon={ClipboardCheck} action={<ToneBadge tone={ready ? "ok" : "progress"}>{ready ? "Sin pendientes" : "Con pendientes"}</ToneBadge>}>
        <ul className="grid gap-2">
          {a.checklist.map((c) => (
            <li key={c.label} className="flex items-start gap-2 text-ui">
              {c.state === "ok" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#1f5f36]" aria-hidden /> : c.state === "pendiente" ? <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[#7a5410]" aria-hidden /> : <CircleDashed className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />}
              <span>
                {c.label}
                <span className="sr-only"> · {c.state === "ok" ? "listo" : c.state === "pendiente" ? "pendiente" : "sin verificar"}</span>
                {c.detail && <span className="block text-meta text-muted">{c.detail}</span>}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-meta text-muted">Es una lista de lo que Faro pudo ver con lo cargado: no reemplaza el criterio de un contador ni dice que la declaración esté bien.</p>
      </Panel>

      <Panel title="Anomalías" icon={AlertTriangle}>
        {a.anomalies.length === 0 ? (
          <p className="text-ui text-muted">No encontramos nada para marcar en lo cargado del período.</p>
        ) : (
          <ul className="grid gap-3">
            {a.anomalies.map((x, i) => (
              <li key={i} className="grid gap-1 rounded-md border border-line p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <ToneBadge tone={SEV_TONE[x.severity]}>{SEV_LABEL[x.severity]}</ToneBadge>
                  <span className="text-caption text-muted">{ANOMALY_LABEL[x.type]}</span>
                </div>
                <p className="text-ui font-medium text-ink">{x.title}</p>
                <p className="text-meta text-muted">{x.detail}</p>
                {x.rowIds.length > 0 && (
                  <p className="text-meta">
                    {x.rowIds.length === 1 ? (
                      <a href={`#c-${x.rowIds[0]}`} className="underline underline-offset-4">
                        Ver el comprobante
                      </a>
                    ) : (
                      <span className="text-muted">{x.rowIds.length} comprobantes involucrados</span>
                    )}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <BarList
            title={`${fiscalLabel} por ${book === "compras" ? "proveedor" : "cliente"}`}
            bars={[...topParties.map((p) => ({ label: p.nombre, value: book === "compras" ? p.fiscal : p.total, display: formatMoney(book === "compras" ? p.fiscal : p.total), hint: `${p.count} comprobante${p.count === 1 ? "" : "s"}` })), ...(rest.length ? [{ label: `Otros (${rest.length})`, value: rest.reduce((s, p) => s + (book === "compras" ? p.fiscal : p.total), 0), display: formatMoney(rest.reduce((s, p) => s + (book === "compras" ? p.fiscal : p.total), 0)) }] : [])]}
          />
        </Card>
        <Card>
          <BarList title="IVA por alícuota" bars={a.summary.byRate.map((r) => ({ label: formatPercent(r.alicuota, 1, false), value: r.iva, display: formatMoney(r.iva), hint: `base ${formatMoney(r.base)}` }))} />
        </Card>
        <Card>
          <BarList title="Por condición frente al IVA" bars={a.summary.byCondition.map((c) => ({ label: c.condition, value: c.total, display: formatMoney(c.total), hint: `${c.count} comprobante${c.count === 1 ? "" : "s"} · ${fiscalLabel.toLowerCase()} ${formatMoney(c.fiscal)}` }))} />
        </Card>
        <Card>
          <BarList title={`${fiscalLabel} de los últimos períodos`} bars={[{ period, fiscal: a.summary.fiscal, count: a.summary.count }, ...a.previous].reverse().map((p) => ({ label: periodLabel(p.period), value: p.fiscal, display: formatMoney(p.fiscal), hint: `${p.count} comprobantes` }))} />
        </Card>
      </div>

      <section id="libro" aria-label={`Libro IVA ${book}`} className="grid gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lead font-semibold">Libro IVA {book}</h2>
          <Link href={base(onlyMarked ? {} : { filtro: "marcados" }) + "#libro"} className="text-meta underline underline-offset-4">
            {onlyMarked ? "Ver todos" : `Solo los marcados (${a.marks.length})`}
          </Link>
        </div>
        {rows.length === 0 ? (
          <Card>
            <EmptyState icon={FileSearch} title={onlyMarked ? "No hay comprobantes marcados" : "No hay comprobantes en el período"} text={book === "compras" ? "Se arma con lo confirmado en Documentos → Lectura inteligente." : "Se arma con lo emitido desde Faro."} />
          </Card>
        ) : (
          <Table label={`Libro IVA ${book}`} minWidth={1040}>
            <thead>
              <tr>
                <th scope="col">Fecha</th>
                <th scope="col">Comprobante</th>
                <th scope="col">{book === "compras" ? "Proveedor" : "Cliente"}</th>
                <th scope="col" className="text-right">Neto</th>
                <th scope="col" className="text-right">IVA</th>
                {book === "compras" && <th scope="col" className="text-right">Crédito</th>}
                <th scope="col" className="text-right">Total</th>
                <th scope="col">Revisión</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const mk = marks.get(r.id);
                return (
                  <tr key={r.id} id={`c-${r.id}`} className="scroll-mt-24">
                    <td className="num">{formatDate(r.fecha, "numeric")}</td>
                    <td className="num whitespace-nowrap">
                      {r.letra ?? "—"} {r.puntoVenta != null ? String(r.puntoVenta).padStart(5, "0") : ""}-{r.numero != null ? String(r.numero).padStart(8, "0") : ""}
                      {r.status && r.status !== "autorizada" && <span className="block text-caption text-danger">{r.status}</span>}
                    </td>
                    <td>
                      {r.nombre}
                      <span className="block text-caption text-muted">
                        {r.cuit ?? "—"} · {conditionOf(r)}
                      </span>
                    </td>
                    <td className="num whitespace-nowrap text-right">{formatMoney(r.neto)}</td>
                    <td className="num whitespace-nowrap text-right">{formatMoney(r.iva.reduce((s, x) => s + x.importe, 0))}</td>
                    {book === "compras" && <td className="num whitespace-nowrap text-right">{formatMoney(creditOf(r))}</td>}
                    <td className="num whitespace-nowrap text-right">{formatMoney(r.total)}</td>
                    <td className="min-w-56">
                      {mk && (
                        <p className="mb-1 text-caption">
                          <ToneBadge tone={mk.status === "resuelta" ? "ok" : "progress"}>{mk.status === "resuelta" ? "Resuelto" : "A revisar"}</ToneBadge> {mk.note}
                        </p>
                      )}
                      <form action={ivaMarkAction} className="flex flex-wrap items-center gap-1.5">
                        <input type="hidden" name="org" value={orgId} />
                        <input type="hidden" name="periodo" value={period} />
                        <input type="hidden" name="libro" value={book} />
                        <input type="hidden" name="row" value={r.id} />
                        {onlyMarked && <input type="hidden" name="filtro" value="marcados" />}
                        {!mk || mk.status === "resuelta" ? (
                          <>
                            <input name="nota" aria-label="Nota" placeholder="Nota" maxLength={500} className={`${fieldClass} h-(--control-h-sm) w-32`} data-free />
                            <input type="hidden" name="estado" value="a_revisar" />
                            <SubmitButton variant="secondary" pendingText="…">
                              A revisar
                            </SubmitButton>
                          </>
                        ) : (
                          <>
                            <input type="hidden" name="estado" value="resuelta" />
                            <SubmitButton variant="secondary" pendingText="…">
                              Resuelto
                            </SubmitButton>
                          </>
                        )}
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </section>
    </div>
  );
}
