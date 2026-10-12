import { ArrowDownLeft, ArrowUpRight, BookOpenCheck, Landmark, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { accountAction, deleteRuleAction, entryAction, groupAction, importStatementAction, movementAction, ruleAction } from "@/app/admin/conciliacion-actions";
import { Table, ToneBadge } from "@/components/ds";
import type { GroupSuggestion } from "@/modules/bank-rec/core";
import { SubmitButton } from "@/components/admin/ui";
import { Feedback } from "@/components/app/Feedback";
import type { StaffUser } from "@/lib/auth";
import { hasModule } from "@/lib/faro/entitlements";
import { listRules, listStatements, statementView, type RecScope } from "@/modules/bank-rec/server";
import { fieldClass } from "@/components/ds/primitives";
import { formatDate, formatMoney, formatPercent } from "@/lib/format";

// Conciliación bancaria en la ficha de la organización (pestaña Conciliación).

const field = `mt-1 ${fieldClass}`;
const ACTION: Record<string, string> = { comision: "Comisión bancaria", impuesto: "Impuesto bancario", ignorar: "Ignorar", sin_factura: "Pago sin factura" };
const SIGN: Record<string, string> = { debito: "débitos", credito: "créditos", ambos: "débitos y créditos" };

function Org({ id }: { id: string }) {
  return <input type="hidden" name="org" value={id} />;
}

export async function BankRecTab({ me, orgId, sp }: { me: StaffUser; orgId: string; sp: Record<string, string | undefined> }) {
  const scope: RecScope = { studioId: me.studioId, organizationId: orgId };
  if (!["dueno", "contador"].includes(me.role)) return <p className="text-ui text-muted">La conciliación bancaria la manejan los dueños y contadores del estudio.</p>;
  if (!(await hasModule(me.studioId, "bank_rec"))) return <p className="rounded-md border border-line bg-surface p-4 text-ui">La conciliación bancaria viene con el plan Avanzado.</p>;
  const [statements, rules] = await Promise.all([listStatements(scope), listRules(scope)]);
  return (
    <div className="grid gap-6">
      <Feedback sp={sp} />
      <form action={importStatementAction} className="grid gap-3 rounded-md border border-line bg-surface p-4 sm:grid-cols-[1.4fr_1fr_1fr]">
        <Org id={orgId} />
        <p className="text-ui sm:col-span-3">Importá el extracto del banco (CSV o PDF con texto). Faro clasifica los movimientos, separa comisiones e impuestos y sugiere con qué factura cruza cada cobro o pago. Vos confirmás.</p>
        <label className="text-meta text-muted">
          Extracto
          <input type="file" name="file" required accept=".csv,.txt,.pdf,text/csv,application/pdf" className="mt-1 block w-full text-ui text-ink" />
        </label>
        <label className="text-meta text-muted">
          Banco
          <input name="bank" required placeholder="Ej.: Galicia" className={field} />
        </label>
        <label className="text-meta text-muted">
          Cuenta (opcional)
          <input name="account" placeholder="CC $ 123-4" className={field} />
        </label>
        <div className="sm:col-span-3">
          <SubmitButton pendingText="Importando…">Importar y conciliar</SubmitButton>
        </div>
      </form>
      <section aria-label="Extractos" className="grid gap-2">
        <h2 className="text-title font-semibold text-ink">Extractos</h2>
        {statements.length === 0 ? (
          <p className="text-ui text-muted">Todavía no importaste extractos.</p>
        ) : (
          <ul className="divide-y divide-line rounded-md border border-line bg-surface">
            {statements.map((st) => (
              <li key={st.id}>
                <Link href={`/admin/organizaciones/${orgId}/conciliacion/${st.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-canvas">
                  <Landmark className="size-4 shrink-0 text-muted" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-ui">
                      {st.bank}
                      {st.account ? ` · ${st.account}` : ""}
                    </p>
                    <p className="text-caption text-muted">
                      {formatDate(st.from, "numeric")} al {formatDate(st.to, "numeric")} · <span className="num">{st.total}</span> movimientos · {st.fileName}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <RulesSection orgId={orgId} rules={rules} />
    </div>
  );
}

function RulesSection({ orgId, rules, statement }: { orgId: string; rules: Awaited<ReturnType<typeof listRules>>; statement?: string }) {
  return (
    <section aria-label="Reglas" className="grid gap-3">
      <h2 className="text-title font-semibold text-ink">Reglas</h2>
      <div className="rounded-md border border-line bg-surface">
        {rules.length > 0 && (
          <ul className="divide-y divide-line border-b border-line">
          {rules.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-ui">
              <span>
                «{r.pattern}» en {SIGN[r.sign]} → {ACTION[r.action]} <span className="text-caption text-muted">· {r.label}{r.organization_id ? "" : " · todas las organizaciones"}</span>
              </span>
              {!statement && (
                <form action={deleteRuleAction}>
                  <Org id={orgId} />
                  <input type="hidden" name="id" value={r.id} />
                  <SubmitButton variant="danger" pendingText="…">Borrar</SubmitButton>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
        <form action={ruleAction} className="grid gap-3 p-4 sm:grid-cols-4 sm:items-end">
        <Org id={orgId} />
        {statement && <input type="hidden" name="statement" value={statement} />}
        <label className="text-meta text-muted">
          Si el detalle dice
          <input name="pattern" required minLength={3} placeholder="Ej.: SEGURO" className={field} />
        </label>
        <label className="text-meta text-muted">
          En
          <select name="sign" className={field}>
            <option value="debito">Débitos</option>
            <option value="credito">Créditos</option>
            <option value="ambos">Los dos</option>
          </select>
        </label>
        <label className="text-meta text-muted">
          Tratarlo como
          <select name="action" className={field}>
            <option value="sin_factura">Pago sin factura</option>
            <option value="comision">Comisión bancaria</option>
            <option value="impuesto">Impuesto bancario</option>
            <option value="ignorar">Ignorar</option>
          </select>
        </label>
        <label className="text-meta text-muted">
          Nombre
          <input name="label" placeholder="Ej.: Seguro del local" className={field} />
        </label>
        <div className="flex flex-wrap items-center justify-between gap-3 sm:col-span-4">
          <label className="flex items-center gap-2 text-meta text-muted">
            <input type="checkbox" name="all_orgs" /> Para todas las organizaciones del estudio
          </label>
          <SubmitButton variant="secondary" pendingText="…">Guardar regla</SubmitButton>
        </div>
        </form>
      </div>
    </section>
  );
}

const STATUS: Record<string, { label: string; tone: string }> = {
  sin_conciliar: { label: "Sin conciliar", tone: "text-danger" },
  sugerido: { label: "Sugerido", tone: "text-warn" },
  conciliado: { label: "Conciliado", tone: "text-ok" },
  sin_factura: { label: "Pago sin factura", tone: "text-muted" },
  ignorado: { label: "Ignorado", tone: "text-muted" },
};
const CLS: Record<string, string> = { cobro: "Cobro", pago: "Pago", comision: "Comisión", impuesto: "Impuesto", transferencia: "Transferencia propia" };

export async function StatementView({ me, orgId, id, sp }: { me: StaffUser; orgId: string; id: string; sp: Record<string, string | undefined> }) {
  const scope: RecScope = { studioId: me.studioId, organizationId: orgId };
  const v = await statementView(scope, id);
  if (!v) return null;
  const rules = await listRules(scope);
  const label = (cid: string | null) => {
    const c = cid ? v.byId.get(cid) : null;
    return c ? `${c.type === "emitido" ? "Factura emitida" : "Comprobante recibido"} ${c.number ?? ""} · ${c.counterparty ?? ""} · ${formatMoney(c.total)} · ${formatDate(c.date, "numeric")}` : "—";
  };
  const options = (amount: number) => [...v.byId.values()].filter((c) => (amount > 0) === (c.type === "emitido") && !v.matched.has(c.id));
  const cards: [string, string | number, string][] = [
    ["Facturas cobradas o pagadas", v.summary.pagadas, ""],
    ["Pendientes", v.summary.pendientes, ""],
    ["En tránsito", v.summary.enTransito, "de los últimos días del período"],
    ["Pagos sin factura", v.summary.pagosSinFactura, ""],
    ["Comisiones", formatMoney(v.summary.comisiones), ""],
    ["Impuestos bancarios", formatMoney(v.summary.impuestos), ""],
  ];
  return (
    <div className="grid gap-5">
      <Feedback sp={sp} />
      <p className="text-ui text-muted">
        {v.st.bank}
        {v.st.account_label ? ` · ${v.st.account_label}` : ""} · del {formatDate(v.st.period_from, "numeric")} al {formatDate(v.st.period_to, "numeric")} · {v.st.file_name}
        {v.summary.sinConciliar > 0 && <span className="text-danger"> · {v.summary.sinConciliar} sin conciliar</span>}
      </p>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {cards.map(([k, val, hint]) => (
          <div key={k} className="rounded-md border border-line bg-surface p-3">
            <dt className="text-caption text-muted">{k}</dt>
            <dd className="num text-title">{val}</dd>
            {hint && <dd className="text-micro text-muted">{hint}</dd>}
          </div>
        ))}
      </dl>
      {v.account && (
        <details className="rounded-md border border-line bg-surface p-4">
          <summary className="flex cursor-pointer items-center gap-2 text-ui font-medium">
            <SlidersHorizontal className="size-4 text-muted" aria-hidden /> Tolerancias y cuentas del ajuste
            <span className="text-meta font-normal text-muted">
              · hasta {v.tolerance.days} días y {v.tolerance.kind === "fijo" ? formatMoney(v.tolerance.value * 100) : formatPercent(v.tolerance.value, 2, false)}
            </span>
          </summary>
          <form action={accountAction} className="mt-4 grid gap-3 sm:grid-cols-3">
            <Org id={orgId} />
            <input type="hidden" name="statement" value={v.st.id} />
            <input type="hidden" name="account_id" value={v.account.id} />
            <label className="text-meta text-muted">
              Días de diferencia
              <input name="days" type="number" min={0} max={120} defaultValue={v.account.date_tolerance_days} className={field} />
            </label>
            <label className="text-meta text-muted">
              Diferencia de monto
              <select name="kind" defaultValue={v.account.amount_tolerance_kind} className={field}>
                <option value="fijo">Fija en pesos</option>
                <option value="porcentaje">Porcentaje</option>
              </select>
            </label>
            <label className="text-meta text-muted">
              Hasta
              <input name="value" inputMode="decimal" defaultValue={v.account.amount_tolerance} className={field} />
            </label>
            <label className="text-meta text-muted">
              Cuenta del banco
              <input name="ledger" defaultValue={v.account.ledger_account} className={field} />
            </label>
            <label className="text-meta text-muted">
              Diferencias de redondeo
              <input name="rounding" defaultValue={v.account.rounding_account} className={field} />
            </label>
            <label className="text-meta text-muted">
              Comisiones y gastos bancarios
              <input name="fees" defaultValue={v.account.fee_account} className={field} />
            </label>
            <label className="text-meta text-muted">
              Deudores (cobros)
              <input name="receivable" defaultValue={v.account.receivable_account} className={field} />
            </label>
            <label className="text-meta text-muted">
              Proveedores (pagos)
              <input name="payable" defaultValue={v.account.payable_account} className={field} />
            </label>
            <p className="text-caption text-muted sm:col-span-3">Dentro de la tolerancia, Faro sugiere el cruce y, si los importes no dan exacto, arma el asiento de ajuste: hasta $ 10 va a redondeo y arriba, a gastos bancarios. Queda en borrador salvo que actives «Asentar las diferencias de conciliación» en Vigía → Agente → Rutinas.</p>
            <div className="sm:col-span-3">
              <SubmitButton variant="secondary" pendingText="…">Guardar tolerancias</SubmitButton>
            </div>
          </form>
        </details>
      )}
      <section aria-label="Movimientos" className="grid gap-2">
        <h2 className="text-title font-semibold text-ink">Movimientos</h2>
        <ul className="divide-y divide-line rounded-md border border-line bg-surface">
          {v.movs.map((m) => {
            const st = STATUS[m.status] ?? STATUS.sin_conciliar;
            const open = m.status === "sin_conciliar" || m.status === "sugerido";
            const matchable = m.cls === "cobro" || m.cls === "pago";
            const group = m.match_group_id ? v.groups.find((x) => x.id === m.match_group_id) : null;
            const gs = (m.group_suggestion as unknown as GroupSuggestion | null) ?? null;
            const g = group ? { candidateIds: group.candidate_ids, movementIds: group.movement_ids, reasons: group.difference ? [`diferencia de ${formatMoney(Math.abs(group.difference))}`] : ["la suma da exacto"] } : gs;
            const entry = group?.journal_entry_id ? v.entries.find((e) => e.id === group.journal_entry_id) : null;
            const leader = !gs || gs.movementIds[0] === m.id;
            return (
              <li key={m.id} className="grid gap-2 px-4 py-3" aria-label={m.description}>
                <div className="flex items-start gap-3">
                  {m.amount > 0 ? <ArrowDownLeft className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden /> : <ArrowUpRight className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-ui">{m.description}</p>
                    <p className="text-caption text-muted">
                      {formatDate(m.date, "numeric")} · {CLS[m.cls]} · <span className={st.tone}>{st.label}</span>
                      {m.status === "sugerido" && m.match_score && ` (${Math.round(Number(m.match_score) * 100)}%)`}
                    </p>
                  </div>
                  <span className={`num text-ui ${m.amount > 0 ? "text-ok" : ""}`}>{formatMoney(m.amount)}</span>
                </div>
                {g && (
                  <div className="grid gap-1 pl-7 text-meta">
                    <p>
                      {m.status === "conciliado" ? (group?.kind === "1:1" ? "Cruza con" : "Conciliado en grupo") : "Sugerencia en grupo"}: {g.candidateIds.map((cid) => label(cid)).join(" + ")}
                      {g.movementIds.length > 1 && <span className="text-muted"> · con {g.movementIds.length} movimientos</span>}
                    </p>
                    {(g.reasons?.length ?? 0) > 0 && <p className="text-muted">{g.reasons?.join(", ")}</p>}
                    {entry && (
                      <p className="flex flex-wrap items-center gap-2">
                        <ToneBadge tone={entry.status === "registrado" ? "ok" : "progress"}>Asiento {entry.status}</ToneBadge>
                        <span className="text-muted">{entry.lines.map((l) => `${l.account} ${l.debit ? `debe ${formatMoney(l.debit)}` : `haber ${formatMoney(l.credit)}`}`).join(" · ")}</span>
                      </p>
                    )}
                  </div>
                )}
                {!g && (m.status === "sugerido" || m.status === "conciliado") && (
                  <p className="pl-7 text-meta">
                    {m.status === "sugerido" ? "Sugerencia: " : "Cruza con: "}
                    {label(m.match_id)}
                    {m.status === "sugerido" && m.match_reasons?.length ? <span className="text-muted"> · {m.match_reasons.join(", ")}</span> : null}
                  </p>
                )}
                <div className="flex flex-wrap gap-1.5 pl-7">
                  {m.status === "sugerido" && gs && leader && (
                    <form action={groupAction}>
                      <Org id={orgId} />
                      <input type="hidden" name="statement" value={v.st.id} />
                      {gs.movementIds.map((x) => (
                        <input key={x} type="hidden" name="movement" value={x} />
                      ))}
                      {gs.candidateIds.map((x) => (
                        <input key={x} type="hidden" name="candidate" value={x} />
                      ))}
                      <SubmitButton pendingText="…">Confirmar el grupo</SubmitButton>
                    </form>
                  )}
                  {m.status === "sugerido" && !gs && (
                    <form action={movementAction}>
                      <Org id={orgId} />
                      <input type="hidden" name="statement" value={v.st.id} />
                      <input type="hidden" name="id" value={m.id} />
                      <input type="hidden" name="op" value="conciliar" />
                      <SubmitButton pendingText="…">Confirmar</SubmitButton>
                    </form>
                  )}
                  {open && matchable && options(m.amount).length > 0 && (
                    <form action={movementAction} className="flex flex-wrap gap-1.5">
                      <Org id={orgId} />
                      <input type="hidden" name="statement" value={v.st.id} />
                      <input type="hidden" name="id" value={m.id} />
                      <input type="hidden" name="op" value="conciliar" />
                      <select name="candidate" aria-label="Elegir comprobante" className="h-(--control-h) max-w-[16rem] rounded-md border border-line bg-surface px-2 text-meta">
                        {options(m.amount).map((c) => (
                          <option key={c.id} value={c.id}>
                            {label(c.id)}
                          </option>
                        ))}
                      </select>
                      <SubmitButton variant="secondary" pendingText="…">Cruzar con otro</SubmitButton>
                    </form>
                  )}
                  {open && matchable && options(m.amount).length > 1 && (
                    <details className="w-full">
                      <summary className="cursor-pointer text-meta text-ink underline-offset-4 hover:underline">Cruzar con varios comprobantes</summary>
                      <form action={groupAction} className="mt-2 grid gap-1.5">
                        <Org id={orgId} />
                        <input type="hidden" name="statement" value={v.st.id} />
                        <input type="hidden" name="movement" value={m.id} />
                        {options(m.amount).map((c) => (
                          <label key={c.id} className="flex items-center gap-2 text-meta">
                            <input type="checkbox" name="candidate" value={c.id} /> {label(c.id)}
                          </label>
                        ))}
                        <div>
                          <SubmitButton variant="secondary" pendingText="…">Conciliar los elegidos</SubmitButton>
                        </div>
                      </form>
                    </details>
                  )}
                  {open && m.amount < 0 && (
                    <form action={movementAction}>
                      <Org id={orgId} />
                      <input type="hidden" name="statement" value={v.st.id} />
                      <input type="hidden" name="id" value={m.id} />
                      <input type="hidden" name="op" value="sin_factura" />
                      <SubmitButton variant="secondary" pendingText="…">Sin factura</SubmitButton>
                    </form>
                  )}
                  {open && (
                    <form action={movementAction}>
                      <Org id={orgId} />
                      <input type="hidden" name="statement" value={v.st.id} />
                      <input type="hidden" name="id" value={m.id} />
                      <input type="hidden" name="op" value="ignorar" />
                      <SubmitButton variant="danger" pendingText="…">Ignorar</SubmitButton>
                    </form>
                  )}
                  {!open && m.confirmed_at && (
                    <form action={movementAction}>
                      <Org id={orgId} />
                      <input type="hidden" name="statement" value={v.st.id} />
                      <input type="hidden" name="id" value={m.id} />
                      <input type="hidden" name="op" value="deshacer" />
                      <SubmitButton variant="secondary" pendingText="…">Deshacer</SubmitButton>
                    </form>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
      {v.pending.length > 0 && (
        <section aria-label="Comprobantes sin movimiento" className="grid gap-2">
          <h2 className="text-title font-semibold text-ink">Comprobantes sin movimiento</h2>
          <ul className="divide-y divide-line rounded-md border border-line bg-surface">
            {v.pending.map((c) => {
              const movs = v.movs.filter((m) => (m.status === "sin_conciliar" || m.status === "sugerido") && !m.match_group_id && (m.cls === "cobro" || m.cls === "pago") && (m.amount > 0) === (c.type === "emitido") && Math.abs(m.amount) < c.total);
              return (
                <li key={c.id} className="grid gap-1.5 px-4 py-2.5 text-ui">
                  {label(c.id)}
                  {movs.length > 1 && (
                    <details>
                      <summary className="cursor-pointer text-meta underline-offset-4 hover:underline">Cruzar con varios movimientos</summary>
                      <form action={groupAction} className="mt-2 grid gap-1.5">
                        <Org id={orgId} />
                        <input type="hidden" name="statement" value={v.st.id} />
                        <input type="hidden" name="candidate" value={c.id} />
                        {movs.map((m) => (
                          <label key={m.id} className="flex items-center gap-2 text-meta">
                            <input type="checkbox" name="movement" value={m.id} /> {formatDate(m.date, "numeric")} · {m.description} · {formatMoney(m.amount)}
                          </label>
                        ))}
                        <div>
                          <SubmitButton variant="secondary" pendingText="…">Conciliar los elegidos</SubmitButton>
                        </div>
                      </form>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {v.entries.length > 0 && (
        <section aria-label="Asientos de ajuste" className="grid gap-2">
          <h2 className="flex items-center gap-2 text-title font-semibold text-ink">
            <BookOpenCheck className="size-5 text-rose-deep" aria-hidden /> Asientos de ajuste
          </h2>
          <Table label="Asientos de ajuste" minWidth={560}>
            <thead>
              <tr>
                <th scope="col">Fecha</th>
                <th scope="col">Cuenta</th>
                <th scope="col" className="text-right">Debe</th>
                <th scope="col" className="text-right">Haber</th>
                <th scope="col">Estado</th>
              </tr>
            </thead>
            <tbody>
              {v.entries.flatMap((e) =>
                e.lines.map((l, i) => (
                  <tr key={`${e.id}-${i}`}>
                    <td className="num">{i === 0 ? formatDate(e.date, "numeric") : ""}</td>
                    <td>{l.account}</td>
                    <td className="num text-right">{l.debit ? formatMoney(l.debit) : ""}</td>
                    <td className="num text-right">{l.credit ? formatMoney(l.credit) : ""}</td>
                    <td>
                      {i === 0 &&
                        (e.status === "borrador" ? (
                          <form action={entryAction}>
                            <Org id={orgId} />
                            <input type="hidden" name="statement" value={v.st.id} />
                            <input type="hidden" name="id" value={e.id} />
                            <SubmitButton variant="secondary" pendingText="…">Registrar</SubmitButton>
                          </form>
                        ) : (
                          <ToneBadge tone={e.status === "registrado" ? "ok" : "neutral"}>{e.status === "registrado" ? "Registrado" : "Anulado"}</ToneBadge>
                        ))}
                    </td>
                  </tr>
                )),
              )}
            </tbody>
          </Table>
        </section>
      )}
      <RulesSection orgId={orgId} rules={rules} statement={v.st.id} />
    </div>
  );
}
