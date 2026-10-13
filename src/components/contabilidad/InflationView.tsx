import { Calculator, Percent, Scale, Tags } from "lucide-react";
import { classificationAction, inflationAction, ownIndexesAction } from "@/app/admin/contabilidad-actions";
import { Card, Panel, SubmitButton, Table, Tag, ToneBadge, chipClass, fieldClass, fieldInlineClass } from "@/components/ds";
import { formatAmount, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { classification, previewAdjustment } from "@/modules/contabilidad/inflacion-server";
import { KIND_LABEL, type AccountKind } from "@/modules/contabilidad/plan";
import { AccountingError, type Scope } from "@/modules/contabilidad/server";

// Ajuste por inflación contable (A2): índices del ejercicio, clasificación
// monetaria editable, reexpresión, RECPAM, nominal vs homogéneo y el asiento
// en borrador. Faro calcula; el contador revisa y registra (§1).

const $ = (c: number) => formatAmount(c / 100);
const coef = (n: number) => n.toLocaleString("es-AR", { minimumFractionDigits: 4, maximumFractionDigits: 4 });

export async function InflationView({ s, orgId, end }: { s: Scope; orgId: string; end: string }) {
  let pv: Awaited<ReturnType<typeof previewAdjustment>>;
  try {
    pv = await previewAdjustment(s, end);
  } catch (e) {
    if (!(e instanceof AccountingError)) throw e;
    return <Card>{e.message}</Card>;
  }
  const accounts = await classification(s);
  const closing = pv.end.slice(0, 7);
  const exportHref = (f: string) => `/api/contabilidad/${orgId}?reporte=inflacion&desde=${pv.start}&hasta=${pv.end}&formato=${f}`;
  const hidden = (
    <>
      <input type="hidden" name="org" value={orgId} />
      <input type="hidden" name="ver" value="inflacion" />
      <input type="hidden" name="end" value={pv.end} />
    </>
  );
  return (
    <>
      <form method="get" className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="tab" value="contabilidad" />
        <input type="hidden" name="ver" value="inflacion" />
        <label className="grid gap-1 text-meta text-muted">
          Cierre del ejercicio
          <input type="date" name="hasta" defaultValue={pv.end} className={cn(fieldInlineClass, "w-40")} />
        </label>
        <button className={chipClass(false)}>Ver</button>
      </form>

      <Panel title={`Ejercicio del ${formatDate(pv.start, "numeric")} al ${formatDate(pv.end, "numeric")}`} icon={Calculator}>
        <p className="text-body text-muted">
          Reexpresión a moneda de cierre (RT 6) con el índice de la FACPCE: cada partida no monetaria se multiplica por el coeficiente índice de cierre / índice de su mes de origen, y la diferencia con las monetarias es el RECPAM. El método y los índices quedan a validar por el contador; el asiento queda en borrador.
        </p>
        {pv.missing.length > 0 ? (
          <p className="mt-3 text-ui text-danger">Faltan los índices de {pv.missing.join(", ")}. Cargalos abajo o pedí que se actualice la serie en el Faro Manager.</p>
        ) : (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {pv.entry?.status !== "registrado" && (
              <form action={inflationAction}>
                {hidden}
                <SubmitButton pendingText="Calculando…">{pv.entry ? "Rehacer el asiento de ajuste" : "Armar el asiento de ajuste"}</SubmitButton>
              </form>
            )}
            <a href={exportHref("xlsx")} className={chipClass(false)}>
              Papel de trabajo en Excel
            </a>
            <a href={exportHref("pdf")} className={chipClass(false)}>
              PDF
            </a>
            {pv.entry && <ToneBadge tone={pv.entry.status === "registrado" ? "ok" : "progress"}>{pv.entry.status === "registrado" ? `Asiento Nº ${pv.entry.number} registrado` : "Asiento en borrador"}</ToneBadge>}
          </div>
        )}
        {!pv.missing.length && (
          <p className="mt-3 text-ui">
            RECPAM del ejercicio: <span className="num">{$(Math.abs(pv.recpam))}</span> {pv.recpam > 0 ? "(pérdida)" : pv.recpam < 0 ? "(ganancia)" : ""}
          </p>
        )}
      </Panel>

      <Panel title="Índices del ejercicio" icon={Percent} bodyClassName="p-0">
        <Table label="Índices del ejercicio" minWidth={520}>
          <thead>
            <tr className="border-b border-line text-meta text-muted">
              <th className="px-3 py-2 font-medium">Mes</th>
              <th className="px-3 py-2 text-right font-medium">Índice</th>
              <th className="px-3 py-2 text-right font-medium">Coeficiente</th>
              <th className="px-3 py-2 font-medium">Fuente</th>
            </tr>
          </thead>
          <tbody>
            {pv.months.map((m) => {
              const u = pv.used[m];
              const c = u && pv.used[closing] ? pv.used[closing].value / u.value : null;
              return (
                <tr key={m} className="border-b border-line last:border-0">
                  <td className="num px-3 py-2">{m}</td>
                  <td className="num px-3 py-2 text-right">{u ? u.value.toLocaleString("es-AR", { maximumFractionDigits: 4 }) : "—"}</td>
                  <td className="num px-3 py-2 text-right">{c ? coef(c) : "—"}</td>
                  <td className="px-3 py-2 text-muted">{u ? u.source === "manual" ? <Tag>Cargado a mano</Tag> : u.source : <span className="text-danger">Falta</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </Table>
        <form action={ownIndexesAction} className="grid gap-3 border-t border-line p-4">
          {hidden}
          <label className="grid gap-1 text-meta text-muted">
            Cargar índices a mano para esta organización (AAAA-MM;valor, uno por fila)
            <textarea name="series" rows={3} required placeholder={"2025-11;10234,5\n2025-12;10512,1"} className={cn(fieldClass, "py-2 font-mono")} />
          </label>
          <div>
            <SubmitButton variant="secondary" pendingText="Guardando…">
              Guardar índices
            </SubmitButton>
          </div>
        </form>
      </Panel>

      <Panel title="Monetarias y no monetarias" icon={Tags} bodyClassName="p-0">
        <form action={classificationAction}>
          {hidden}
          <Table label="Clasificación monetaria" minWidth={560}>
            <thead>
              <tr className="border-b border-line text-meta text-muted">
                <th className="px-3 py-2 font-medium">Monetaria</th>
                <th className="px-3 py-2 font-medium">Cuenta</th>
                <th className="px-3 py-2 font-medium">Tipo</th>
                <th className="px-3 py-2 font-medium">Sugerencia de Faro</th>
              </tr>
            </thead>
            <tbody>
              {accounts
                .filter((a) => a.role !== "recpam")
                .map((a) => (
                  <tr key={a.code} className="border-b border-line last:border-0">
                    <td className="px-3 py-2">
                      <input type="checkbox" name="monetaria" value={a.code} defaultChecked={a.monetary} aria-label={`${a.name} es monetaria`} className="size-4 accent-navy" />
                    </td>
                    <td className="px-3 py-2">
                      <span className="num text-muted">{a.code}</span> {a.name}
                    </td>
                    <td className="px-3 py-2 text-muted">{KIND_LABEL[a.kind as AccountKind]}</td>
                    <td className="px-3 py-2">{a.suggested === a.monetary ? <span className="text-muted">Igual</span> : <Tag>{a.suggested ? "Sugerimos monetaria" : "Sugerimos no monetaria"}</Tag>}</td>
                  </tr>
                ))}
            </tbody>
          </Table>
          <div className="border-t border-line p-4">
            <SubmitButton variant="secondary" pendingText="Guardando…">
              Guardar la clasificación
            </SubmitButton>
          </div>
        </form>
      </Panel>

      {!pv.missing.length && pv.compare.length === 0 && (
        <Card>
          <p className="text-body text-muted">Todavía no hay asientos registrados en el ejercicio: cuando los haya, acá vas a ver cada saldo nominal al lado del homogéneo.</p>
        </Card>
      )}
      {!pv.missing.length && pv.compare.length > 0 && (
        <Panel title="Nominal y homogéneo" icon={Scale} bodyClassName="p-0">
          <Table label="Saldos nominales y homogéneos" minWidth={640}>
            <thead>
              <tr className="border-b border-line text-meta text-muted">
                <th className="px-3 py-2 font-medium">Cuenta</th>
                <th className="px-3 py-2 text-right font-medium">Nominal</th>
                <th className="px-3 py-2 text-right font-medium">Homogéneo</th>
                <th className="px-3 py-2 text-right font-medium">Ajuste</th>
              </tr>
            </thead>
            <tbody>
              {pv.compare.map((c) => (
                <tr key={c.code} className="border-b border-line last:border-0">
                  <td className="px-3 py-2">
                    <span className="num text-muted">{c.code}</span> {c.name}
                  </td>
                  <td className="num px-3 py-2 text-right">{$(c.nominal)}</td>
                  <td className="num px-3 py-2 text-right">{$(c.homogeneous)}</td>
                  <td className="num px-3 py-2 text-right">{c.homogeneous !== c.nominal ? $(c.homogeneous - c.nominal) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </Table>
          <p className="border-t border-line px-4 py-3 text-meta text-muted">Saldos deudores en positivo y acreedores en negativo, al cierre del ejercicio.</p>
        </Panel>
      )}
    </>
  );
}
