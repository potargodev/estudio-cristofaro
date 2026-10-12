import { ArrowDownLeft, ArrowUpRight, Landmark } from "lucide-react";
import Link from "next/link";
import { deleteRuleAction, importStatementAction, movementAction, ruleAction } from "@/app/admin/conciliacion-actions";
import { SubmitButton } from "@/components/admin/ui";
import { Feedback } from "@/components/app/Feedback";
import type { StaffUser } from "@/lib/auth";
import { hasModule } from "@/lib/faro/entitlements";
import { listRules, listStatements, statementView, type RecScope } from "@/modules/bank-rec/server";
import { fieldClass } from "@/components/ds/primitives";
import { formatDate, formatMoney } from "@/lib/format";

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
        <h2 className="text-lead font-semibold">Extractos</h2>
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
    <section aria-label="Reglas" className="grid gap-2">
      <h2 className="text-lead font-semibold">Reglas</h2>
      {rules.length > 0 && (
        <ul className="divide-y divide-line rounded-md border border-line bg-surface">
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
      <form action={ruleAction} className="grid gap-2 rounded-md border border-line bg-surface p-4 sm:grid-cols-4 sm:items-end">
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
        <label className="flex items-center gap-2 text-meta text-muted sm:col-span-3">
          <input type="checkbox" name="all_orgs" /> Para todas las organizaciones del estudio
        </label>
        <SubmitButton variant="secondary" pendingText="…">Guardar regla</SubmitButton>
      </form>
    </section>
  );
}

const STATUS: Record<string, { label: string; tone: string }> = {
  sin_conciliar: { label: "Sin conciliar", tone: "text-danger" },
  sugerido: { label: "Sugerido", tone: "text-[#7a5410]" },
  conciliado: { label: "Conciliado", tone: "text-[#1f5f36]" },
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
      <section aria-label="Movimientos" className="grid gap-2">
        <h2 className="text-lead font-semibold">Movimientos</h2>
        <ul className="divide-y divide-line rounded-md border border-line bg-surface">
          {v.movs.map((m) => {
            const st = STATUS[m.status] ?? STATUS.sin_conciliar;
            const open = m.status === "sin_conciliar" || m.status === "sugerido";
            const matchable = m.cls === "cobro" || m.cls === "pago";
            return (
              <li key={m.id} className="grid gap-2 px-4 py-3" aria-label={m.description}>
                <div className="flex items-start gap-3">
                  {m.amount > 0 ? <ArrowDownLeft className="mt-0.5 size-4 shrink-0 text-[#1f5f36]" aria-hidden /> : <ArrowUpRight className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-ui">{m.description}</p>
                    <p className="text-caption text-muted">
                      {formatDate(m.date, "numeric")} · {CLS[m.cls]} · <span className={st.tone}>{st.label}</span>
                      {m.status === "sugerido" && m.match_score && ` (${Math.round(Number(m.match_score) * 100)}%)`}
                    </p>
                  </div>
                  <span className={`num text-ui ${m.amount > 0 ? "text-[#1f5f36]" : ""}`}>{formatMoney(m.amount)}</span>
                </div>
                {(m.status === "sugerido" || m.status === "conciliado") && (
                  <p className="pl-7 text-meta">
                    {m.status === "sugerido" ? "Sugerencia: " : "Cruza con: "}
                    {label(m.match_id)}
                    {m.status === "sugerido" && m.match_reasons?.length ? <span className="text-muted"> · {m.match_reasons.join(", ")}</span> : null}
                  </p>
                )}
                <div className="flex flex-wrap gap-1.5 pl-7">
                  {m.status === "sugerido" && (
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
          <h2 className="text-lead font-semibold">Comprobantes sin movimiento</h2>
          <ul className="divide-y divide-line rounded-md border border-line bg-surface">
            {v.pending.map((c) => (
              <li key={c.id} className="px-4 py-2.5 text-ui">
                {label(c.id)}
              </li>
            ))}
          </ul>
        </section>
      )}
      <RulesSection orgId={orgId} rules={rules} statement={v.st.id} />
    </div>
  );
}
