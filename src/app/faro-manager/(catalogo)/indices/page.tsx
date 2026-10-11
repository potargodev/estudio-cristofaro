import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/kit/PageHeader";
import { SubmitButton } from "@/components/admin/ui";
import { Feedback } from "@/components/app/Feedback";
import { requireFaro } from "@/lib/auth";
import { ipcTable } from "@/modules/bitacora/planning";
import { saveIpcAction } from "../../indices-actions";

export const metadata: Metadata = { title: "Índices" };

/** Serie del IPC para los valores reales de la Bitácora (ajustados por inflación) */
export default async function IndicesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const me = await requireFaro();
  const rows = await ipcTable();
  return (
    <div className="grid gap-5">
      <PageHeader level={2} title="Índices" description="Serie mensual del IPC (INDEC). La Bitácora la usa para mostrar montos ajustados por inflación; el dólar MEP se guarda solo todos los días." className="mb-0" />
      <Feedback sp={sp} />
      {me.faroRole === "faro_owner" && (
        <form action={saveIpcAction} className="grid gap-3 rounded-md border border-line bg-surface p-4">
          <label className="text-[13px] text-muted">
            Serie (una fila por mes: AAAA-MM;valor)
            <textarea name="series" required rows={6} placeholder={"2026-08;9876,5\n2026-09;10012,3"} className="mt-1 block w-full rounded-md border border-line bg-surface p-2 font-mono text-[13px] text-ink" />
          </label>
          <label className="text-[13px] text-muted">
            Fuente
            <input name="source" placeholder="INDEC · IPC nivel general (base dic-2016 = 100)" className="mt-1 block h-9 w-full rounded-md border border-line bg-surface px-2 text-[14px] text-ink" />
          </label>
          <div>
            <SubmitButton>Guardar</SubmitButton>
          </div>
        </form>
      )}
      {rows.length === 0 ? (
        <p className="text-[14px] text-muted">Todavía no hay valores del IPC: la Bitácora muestra los montos en pesos de cada mes.</p>
      ) : (
        <table className="w-full rounded-md border border-line bg-surface text-[13px]">
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
                <td className="num">{Number(r.value).toLocaleString("es-AR")}</td>
                <td className="hidden text-muted sm:table-cell">{r.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
