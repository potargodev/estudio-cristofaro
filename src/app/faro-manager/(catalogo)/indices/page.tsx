import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/kit/PageHeader";
import { SubmitButton } from "@/components/admin/ui";
import { Feedback } from "@/components/app/Feedback";
import { requireFaro } from "@/lib/auth";
import { ipcTable } from "@/modules/bitacora/planning";
import { fetchInflationAction, inflationSourceAction, saveInflationIndexesAction, saveIpcAction } from "../../indices-actions";
import { indexSource, platformIndexes } from "@/modules/contabilidad/inflacion-server";
import { formatNumber } from "@/lib/format";

export const metadata: Metadata = { title: "Índices" };

/** Serie del IPC para los valores reales de la Bitácora (ajustados por inflación) */
export default async function IndicesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const me = await requireFaro();
  const [rows, facpce, source] = await Promise.all([ipcTable(), platformIndexes(), indexSource()]);
  const owner = me.faroRole === "faro_owner";
  return (
    <div className="grid gap-5">
      <PageHeader level={2} title="Índices" description="Serie mensual del IPC (INDEC). La Bitácora la usa para mostrar montos ajustados por inflación; el dólar MEP se guarda solo todos los días." className="mb-0" />
      <Feedback sp={sp} />
      {owner && (
        <form action={saveIpcAction} className="grid gap-3 rounded-md border border-line bg-surface p-4">
          <label className="text-meta text-muted">
            Serie (una fila por mes: AAAA-MM;valor)
            <textarea name="series" required rows={6} placeholder={"2026-08;9876,5\n2026-09;10012,3"} className="mt-1 block w-full rounded-md border border-line bg-surface p-2 font-mono text-meta text-ink" />
          </label>
          <label className="text-meta text-muted">
            Fuente
            <input name="source" placeholder="INDEC · IPC nivel general (base dic-2016 = 100)" className="mt-1 block h-(--control-h) w-full rounded-md border border-line bg-surface px-2 text-ui text-ink" />
          </label>
          <div>
            <SubmitButton>Guardar</SubmitButton>
          </div>
        </form>
      )}
      {rows.length === 0 ? (
        <p className="text-ui text-muted">Todavía no hay valores del IPC: la Bitácora muestra los montos en pesos de cada mes.</p>
      ) : (
        <table className="w-full rounded-md border border-line bg-surface text-meta">
          <thead className="text-left text-muted">
            <tr>
              <th className="px-3 py-2">Mes</th>
              <th>Valor</th>
              <th className="hidden sm:table-cell">Fuente</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.month} className="border-t border-line">
                <td className="num px-3 py-1.5">{r.month}</td>
                <td className="num">{formatNumber(Number(r.value), 4)}</td>
                <td className="hidden text-muted sm:table-cell">{r.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <section className="grid gap-3 border-t border-line pt-5">
        <h3 className="text-title">Índice FACPCE · ajuste por inflación contable</h3>
        <p className="text-ui text-muted">Serie mensual que usan los estudios para el ajuste por inflación (RT 6): IPIM hasta 2016 e IPC nacional desde 2017 (Res. JG 539/18). Se trae de la fuente configurada o se pega a mano; cada estudio puede completar meses para una organización.</p>
        {owner && (
          <div className="grid gap-3 lg:grid-cols-2">
            <form action={saveInflationIndexesAction} className="grid gap-3 rounded-md border border-line bg-surface p-4">
              <label className="text-meta text-muted">
                Serie (una fila por mes: AAAA-MM;valor)
                <textarea name="series" required rows={5} placeholder={"2025-11;10234,5\n2025-12;10512,1"} className="mt-1 block w-full rounded-md border border-line bg-surface p-2 font-mono text-meta text-ink" />
              </label>
              <label className="text-meta text-muted">
                Fuente
                <input name="source" placeholder="FACPCE · Res. JG 539/18" className="mt-1 block h-(--control-h) w-full rounded-md border border-line bg-surface px-2 text-ui text-ink" />
              </label>
              <div>
                <SubmitButton>Guardar la serie</SubmitButton>
              </div>
            </form>
            <div className="grid content-start gap-3 rounded-md border border-line bg-surface p-4">
              <form action={inflationSourceAction} className="grid gap-3">
                <label className="text-meta text-muted">
                  Fuente automática (CSV «AAAA-MM;valor»)
                  <input name="url" type="url" defaultValue={source?.url ?? ""} placeholder="https://…/indices-facpce.csv" className="mt-1 block h-(--control-h) w-full rounded-md border border-line bg-surface px-2 text-ui text-ink" />
                </label>
                <label className="text-meta text-muted">
                  Nombre de la fuente
                  <input name="name" defaultValue={source?.name ?? ""} placeholder="FACPCE" className="mt-1 block h-(--control-h) w-full rounded-md border border-line bg-surface px-2 text-ui text-ink" />
                </label>
                <div>
                  <SubmitButton variant="secondary">Guardar la fuente</SubmitButton>
                </div>
              </form>
              {source && (
                <form action={fetchInflationAction}>
                  <SubmitButton variant="secondary" pendingText="Trayendo…">
                    Traer ahora
                  </SubmitButton>
                </form>
              )}
            </div>
          </div>
        )}
        {facpce.length === 0 ? (
          <p className="text-ui text-muted">Todavía no hay índices FACPCE: los estudios los pueden cargar a mano para cada organización.</p>
        ) : (
          <table className="w-full rounded-md border border-line bg-surface text-meta">
            <thead className="text-left text-muted">
              <tr>
                <th className="px-3 py-2">Mes</th>
                <th>Índice</th>
                <th className="hidden sm:table-cell">Fuente</th>
              </tr>
            </thead>
            <tbody>
              {facpce.slice(-24).reverse().map((r) => (
                <tr key={r.month} className="border-t border-line">
                  <td className="num px-3 py-1.5">{r.month}</td>
                  <td className="num">{formatNumber(Number(r.value), 4)}</td>
                  <td className="hidden text-muted sm:table-cell">{r.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
