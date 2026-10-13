import { ArrowDown, ArrowUp, Ban, CircleHelp, ListTodo, Minus, Scale } from "lucide-react";
import Link from "next/link";
import { decideAction, paramsAction, recategorizedAction, reviewAction, tasksAction } from "@/app/admin/recategorizacion-actions";
import { Feedback } from "@/components/app/Feedback";
import { Button, MetricCard, PageHeader, Panel, SubmitButton, Table, Tag, ToneBadge, chipClass, fieldClass, fieldInlineClass } from "@/components/ds";
import { requireStaff } from "@/lib/auth";
import { formatAmount, formatDate } from "@/lib/format";
import { formatCuit } from "@/lib/types";
import { cn } from "@/lib/utils";
import { MOVEMENT_LABEL, type Movement } from "@/modules/recategorizacion/core";
import { periodOf, portfolio, summary } from "@/modules/recategorizacion/server";

export const metadata = { title: "Recategorización" };

// Recategorización del monotributo de toda la cartera (A5, grupo Operación):
// facturación de los 12 meses que cuentan, categoría actual y la que
// coincide, revisión en lote, comprobante, avisos y tareas. Faro muestra los
// hechos con la escala vigente; la categoría la decide el contador (§1).

const TONE: Record<Movement, "ok" | "progress" | "neutral" | "danger" | "done"> = { sube: "progress", baja: "ok", mantiene: "neutral", excluido: "danger", sin_categoria: "neutral" };
const STATUS: Record<string, string> = { pendiente: "Pendiente", revisada: "Revisada", recategorizado: "Recategorizado", avisado: "Avisado" };
const $ = (n: number | null) => (n == null ? "—" : formatAmount(n, "ARS", { decimals: "none" }));

export default async function RecategorizacionPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const me = await requireStaff();
  const pf = await portfolio(me.studioId, sp.periodo);
  const counts = summary(pf.rows);
  const mov = (Object.keys(MOVEMENT_LABEL) as Movement[]).includes(sp.mov as Movement) ? (sp.mov as Movement) : null;
  const rows = mov ? pf.rows.filter((r) => r.movement === mov) : pf.rows;
  const operator = me.role === "dueno" || me.role === "contador";
  const y = Number(pf.period.key.slice(0, 4));
  const periods = [pf.period.key.endsWith("-01") ? `${y - 1}-07` : `${y}-01`, pf.period.key].map((k) => periodOf(k));
  const q = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams({ periodo: pf.period.key, ...(mov ? { mov } : {}) });
    for (const [k, v] of Object.entries(patch)) {
      if (v == null) p.delete(k);
      else p.set(k, v);
    }
    return `/admin/recategorizacion?${p}`;
  };
  const hidden = (
    <>
      <input type="hidden" name="periodo" value={pf.period.key} />
      {mov && <input type="hidden" name="mov" value={mov} />}
    </>
  );
  const cards: [Movement, string, typeof ArrowUp][] = [
    ["sube", "Suben", ArrowUp],
    ["baja", "Bajan", ArrowDown],
    ["mantiene", "Mantienen", Minus],
    ["excluido", "Excluidos", Ban],
    ["sin_categoria", "Sin categoría", CircleHelp],
  ];
  return (
    <div className="grid gap-5">
      <PageHeader title="Recategorización del monotributo" description={`Toda la cartera para la recategorización de ${pf.period.label}: facturación de ${pf.months[0]} a ${pf.months[11]}, la categoría actual y la que coincide. Vence el ${formatDate(pf.period.deadline, "numeric")}. La categoría la decide el contador.`} />
      <Feedback sp={sp} />
      <div className="flex flex-wrap items-center gap-2">
        {periods.map((p) => (
          <Link key={p.key} href={q({ periodo: p.key, mov: null })} className={chipClass(p.key === pf.period.key)}>
            {p.label}
          </Link>
        ))}
        <span className="text-meta text-muted">
          Escala vigente desde el {formatDate(pf.scale.validFrom, "numeric")} {pf.scale.status === "a_validar" ? <Tag>A validar</Tag> : <Tag>Validada</Tag>}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {cards.map(([k, label, icon]) => (
          <MetricCard key={k} icon={icon} label={label} value={counts[k]} href={q({ mov: mov === k ? null : k })} tone={k === "excluido" && counts[k] ? "alert" : "default"} />
        ))}
      </div>
      {pf.rows.length === 0 ? (
        <Panel title="Sin monotributistas" icon={Scale}>
          <p className="text-body text-muted">Cuando una organización tenga una razón social con régimen monotributo, aparece acá con su facturación y su categoría.</p>
        </Panel>
      ) : (
        <>
          {operator && (
            <form id="lote" action={reviewAction} className="grid gap-3 rounded-md border border-line bg-surface p-4">
              {hidden}
              <p className="text-ui font-medium">Con los marcados en la tabla</p>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="submit" name="op" value="sugerida">
                  Confirmar la que coincide
                </Button>
                <Button type="submit" name="op" value="actual" variant="outline">
                  Mantener la actual
                </Button>
              </div>
              <fieldset className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
                <legend className="sr-only">Avisar al cliente</legend>
                <span className="text-meta text-muted">Avisar al cliente por</span>
                <label className="flex items-center gap-1.5 text-ui">
                  <input type="checkbox" name="app" defaultChecked className="size-4 accent-navy" /> la app
                </label>
                <label className="flex items-center gap-1.5 text-ui">
                  <input type="checkbox" name="mail" defaultChecked className="size-4 accent-navy" /> mail
                </label>
                <label className="flex items-center gap-1.5 text-ui">
                  <input type="checkbox" name="whatsapp" className="size-4 accent-navy" /> WhatsApp
                </label>
                <Button type="submit" name="op" value="avisar" variant="outline">
                  Avisar
                </Button>
              </fieldset>
            </form>
          )}
          <Table label="Monotributistas de la cartera" minWidth={980}>
            <thead>
              <tr className="border-b border-line text-meta text-muted">
                {operator && <th className="w-8 px-3 py-2"><span className="sr-only">Elegir</span></th>}
                <th className="px-3 py-2 font-medium">Monotributista</th>
                <th className="px-3 py-2 text-right font-medium">Facturación 12 meses</th>
                <th className="px-3 py-2 font-medium">Actual</th>
                <th className="px-3 py-2 font-medium">Coincide</th>
                <th className="px-3 py-2 font-medium">Movimiento</th>
                <th className="px-3 py-2 text-right font-medium">Cuota nueva</th>
                <th className="px-3 py-2 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.entityId} className="border-b border-line align-top last:border-0">
                  {operator && (
                    <td className="px-3 py-2">
                      <input type="checkbox" name="id" value={r.entityId} form="lote" aria-label={`Elegir ${r.businessName}`} className="size-4 accent-navy" />
                    </td>
                  )}
                  <td className="px-3 py-2">
                    <Link href={`/admin/organizaciones/${r.organizationId}`} className="font-medium text-ink hover:underline">
                      {r.businessName}
                    </Link>
                    <p className="text-meta text-muted">
                      {r.cuit ? formatCuit(r.cuit) : "Sin CUIT"} · {r.organizationName}
                    </p>
                    {operator && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-meta text-muted">Parámetros, decisión y comprobante</summary>
                        <div className="mt-2 grid gap-3">
                          <form action={paramsAction} className="grid gap-2 sm:grid-cols-4">
                            {hidden}
                            <input type="hidden" name="id" value={r.entityId} />
                            <label className="text-meta text-muted">
                              Actividad
                              <select name="activity" defaultValue={r.params.activity} className={cn(fieldClass, "mt-1")}>
                                <option value="servicios">Servicios</option>
                                <option value="bienes">Venta de bienes</option>
                              </select>
                            </label>
                            <label className="text-meta text-muted">
                              Superficie (m²)
                              <input name="surface" inputMode="decimal" defaultValue={r.params.surfaceM2 ?? ""} className={cn(fieldClass, "mt-1")} />
                            </label>
                            <label className="text-meta text-muted">
                              Energía (kW anuales)
                              <input name="energy" inputMode="decimal" defaultValue={r.params.energyKw ?? ""} className={cn(fieldClass, "mt-1")} />
                            </label>
                            <label className="text-meta text-muted">
                              Alquiler anual
                              <input name="rent" inputMode="decimal" defaultValue={r.params.rentAnnual ?? ""} className={cn(fieldClass, "mt-1")} />
                            </label>
                            <div className="sm:col-span-4">
                              <SubmitButton variant="secondary" pendingText="…">
                                Guardar parámetros
                              </SubmitButton>
                            </div>
                          </form>
                          <form action={decideAction} className="flex flex-wrap items-end gap-2">
                            {hidden}
                            <input type="hidden" name="id" value={r.entityId} />
                            <label className="text-meta text-muted">
                              Categoría que decide el contador
                              <select name="category" defaultValue={r.final ?? r.suggested ?? r.current ?? ""} className={cn(fieldInlineClass, "mt-1 block w-28")}>
                                {pf.scale.categories.map((c) => (
                                  <option key={c.letter} value={c.letter}>
                                    {c.letter}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <SubmitButton variant="secondary" pendingText="…">
                              Decidir
                            </SubmitButton>
                          </form>
                          <form action={recategorizedAction} className="flex flex-wrap items-end gap-2">
                            {hidden}
                            <input type="hidden" name="id" value={r.entityId} />
                            <label className="text-meta text-muted">
                              Comprobante de ARCA (opcional)
                              <input type="file" name="receipt" accept=".pdf,.jpg,.jpeg,.png" className={cn(fieldClass, "mt-1 h-auto py-1.5")} />
                            </label>
                            <SubmitButton pendingText="…">Marcar recategorizado</SubmitButton>
                          </form>
                        </div>
                      </details>
                    )}
                  </td>
                  <td className="num px-3 py-2 text-right">{$(r.income12m)}</td>
                  <td className="px-3 py-2">{r.current ?? "—"}</td>
                  <td className="px-3 py-2">
                    {r.suggested ?? "—"}
                    {r.final && r.final !== r.suggested && <p className="text-meta text-muted">Decidida: {r.final}</p>}
                  </td>
                  <td className="px-3 py-2">
                    <ToneBadge tone={TONE[r.movement]}>{MOVEMENT_LABEL[r.movement]}</ToneBadge>
                    {r.reasons.length > 0 && <p className="mt-1 max-w-48 text-meta text-muted">{r.reasons.join("; ")}</p>}
                  </td>
                  <td className="num px-3 py-2 text-right">{r.feeNew == null ? <span className="whitespace-nowrap text-muted">Sin cuota</span> : $(r.feeNew)}</td>
                  <td className="px-3 py-2">
                    <ToneBadge tone={r.status === "recategorizado" ? "done" : r.status === "revisada" ? "ok" : "neutral"}>{STATUS[r.status] ?? r.status}</ToneBadge>
                    {r.receiptDocumentId && (
                      <a href={`/api/archivos/${r.receiptDocumentId}`} className="mt-1 block text-meta underline underline-offset-4">
                        Comprobante
                      </a>
                    )}
                    {r.notifiedAt && <p className="text-meta text-muted">Avisado el {formatDate(r.notifiedAt.toISOString().slice(0, 10), "numeric")}</p>}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
          {operator && (
            <form action={tasksAction} className="flex flex-wrap items-center gap-3">
              {hidden}
              <SubmitButton variant="secondary" pendingText="…">
                <ListTodo className="size-4" aria-hidden /> Crear las tareas del equipo
              </SubmitButton>
              <span className="text-meta text-muted">Una por cada monotributista sin recategorizar, con vencimiento el {formatDate(pf.period.deadline, "numeric")}. También la arma el Agente como rutina.</span>
            </form>
          )}
        </>
      )}
    </div>
  );
}
