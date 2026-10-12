import type { Metadata } from "next";
import Link from "next/link";
import { importUndoAction, importUploadAction } from "@/app/bitacora/plus-actions";
import { SubmitButton } from "@/components/admin/ui";
import { Feedback } from "@/components/app/Feedback";
import { importsThisMonth, listImports } from "@/modules/bitacora/imports";
import { bitacoraPlan } from "@/modules/bitacora/plus";
import { requireUser } from "@/modules/bitacora/session";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Importar resúmenes" };

const SOURCE: Record<string, string> = { csv: "CSV", pdf: "PDF", mercadopago_csv: "Mercado Pago" };
const STATUS: Record<string, string> = { vista_previa: "Sin confirmar", importado: "Importado", descartado: "Descartado" };

/** Importación de resúmenes del banco o la tarjeta (CSV o PDF) y del CSV de Mercado Pago */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const me = await requireUser();
  const [list, plan, used] = await Promise.all([listImports(me.id), bitacoraPlan(me), importsThisMonth(me.id)]);
  const limit = plan.limits.importsPerMonth;
  return (
    <div className="grid gap-4">
      <Feedback sp={sp} />
      <form action={importUploadAction} className="grid gap-3 rounded-md border border-line bg-surface p-4">
        <p className="text-ui">
          Subí el resumen de tu banco o tarjeta (CSV o PDF con texto) o el CSV de movimientos de Mercado Pago. Antes de cargar nada te mostramos cómo quedó, para que elijas qué columnas son qué y qué filas entran. Las que ya estaban no se duplican.
        </p>
        <label className="text-meta text-muted">
          Archivo
          <input type="file" name="file" required accept=".csv,.txt,.pdf,text/csv,application/pdf" className="mt-1 block w-full text-ui text-ink" />
        </label>
        <label className="text-meta text-muted">
          Qué es
          <select name="source" className="mt-1 block h-(--control-h) w-full rounded-md border border-line bg-surface px-2 text-ui text-ink sm:w-72">
            <option value="auto">Resumen del banco o la tarjeta</option>
            <option value="mercadopago_csv">Movimientos de Mercado Pago (CSV)</option>
          </select>
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <SubmitButton pendingText="Leyendo…">Ver vista previa</SubmitButton>
          {limit != null && (
            <span className="text-meta text-muted">
              <span className="num">{used}</span> de <span className="num">{limit}</span> importaciones este mes (Bitácora Gratis).
            </span>
          )}
        </div>
      </form>
      <Link href="/bitacora/tickets" className="flex items-center justify-between gap-2 rounded-md border border-line bg-surface p-4 text-ui hover:border-muted">
        <span>
          <span className="font-medium">Foto de un ticket o una factura</span>
          <span className="block text-meta text-muted">Faro la lee, te muestra los datos y la cargás como gasto con un toque.</span>
        </span>
        <span aria-hidden>→</span>
      </Link>
      {list.length > 0 && (
        <ul className="divide-y divide-line rounded-md border border-line bg-surface">
          {list.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-body">{i.fileName}</p>
                <p className="text-meta text-muted">
                  {SOURCE[i.source] ?? i.source} · {STATUS[i.status] ?? i.status} · {formatDate(i.createdAt, "numeric")}
                  {i.status === "importado" && (
                    <>
                      {" "}· <span className="num">{i.imported}</span> cargados{i.duplicates ? <>, <span className="num">{i.duplicates}</span> repetidos</> : null}
                    </>
                  )}
                </p>
              </div>
              {i.status === "vista_previa" && (
                <Link href={`/bitacora/importar/${i.id}`} className="text-ui text-navy underline">
                  Seguir
                </Link>
              )}
              {i.status === "importado" && (
                <form action={importUndoAction}>
                  <input type="hidden" name="id" value={i.id} />
                  <SubmitButton variant="danger" pendingText="…">Deshacer</SubmitButton>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
