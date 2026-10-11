import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { importConfirmAction, importDiscardAction, importRemapAction } from "@/app/bitacora/plus-actions";
import { SubmitButton } from "@/components/admin/ui";
import { Feedback } from "@/components/app/Feedback";
import { money } from "@/modules/bitacora/catalog";
import { previewRows } from "@/modules/bitacora/imports";
import { requireUser } from "@/modules/bitacora/session";
import type { Mapping } from "@/modules/bitacora/smart";
import { fieldClass } from "@/components/ds/primitives";

export const metadata: Metadata = { title: "Vista previa de la importación" };
const field = `mt-1 ${fieldClass}`;

function parseMapping(raw?: string): Mapping | undefined {
  if (!raw) return undefined;
  try {
    const m = JSON.parse(raw) as Mapping;
    return Number.isInteger(m.date) && Number.isInteger(m.description) ? m : undefined;
  } catch {
    return undefined;
  }
}

/** Vista previa: mapeo de columnas, filas convertidas y duplicados marcados */
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const me = await requireUser();
  const p = await previewRows(me.id, id, parseMapping(sp.m));
  if (!p || p.imp.status !== "vista_previa") notFound();
  const raw = p.imp.rows as string[][];
  const header = raw[0] ?? [];
  const cols = Math.max(...raw.slice(0, 20).map((r) => r.length));
  const colName = (c: number) => (p.mapping.skipHeader && header[c] ? header[c] : `Columna ${c + 1}`);
  const opts = [...Array(cols).keys()];
  const m = p.mapping;
  const fresh = p.rows.filter((r) => !r.duplicate);
  const Select = ({ name, value, optional }: { name: string; value?: number; optional?: boolean }) => (
    <select name={name} defaultValue={value ?? ""} className={field}>
      {optional && <option value="">—</option>}
      {opts.map((c) => (
        <option key={c} value={c}>
          {colName(c)}
        </option>
      ))}
    </select>
  );
  const MappingFields = () => (
    <>
      <input type="hidden" name="id" value={p.imp.id} />
      <label className="text-meta text-muted">Fecha<Select name="col_date" value={m.date} /></label>
      <label className="text-meta text-muted">Descripción<Select name="col_description" value={m.description} /></label>
      <label className="text-meta text-muted">Importe (con signo)<Select name="col_amount" value={m.amount} optional /></label>
      <label className="text-meta text-muted">Débito<Select name="col_debit" value={m.debit} optional /></label>
      <label className="text-meta text-muted">Crédito<Select name="col_credit" value={m.credit} optional /></label>
      <label className="flex items-center gap-2 text-meta text-muted">
        <input type="checkbox" name="positive_is_expense" defaultChecked={!!m.positiveIsExpense} /> Los gastos vienen en positivo (tarjeta)
      </label>
      <label className="flex items-center gap-2 text-meta text-muted">
        <input type="checkbox" name="skip_header" defaultChecked={!!m.skipHeader} /> La primera fila son títulos
      </label>
    </>
  );
  return (
    <div className="grid gap-4">
      <Link href="/bitacora/importar" className="text-meta text-muted hover:text-ink">← Importar</Link>
      <Feedback sp={sp} />
      <p className="text-ui">
        <span className="font-medium">{p.imp.file_name}</span>: <span className="num">{p.rows.length}</span> movimientos leídos, <span className="num">{p.rows.length - fresh.length}</span> ya estaban en tu Bitácora.
      </p>
      <details className="rounded-md border border-line bg-surface p-4" open={!p.rows.length}>
        <summary className="cursor-pointer text-ui font-medium">Qué columna es qué</summary>
        <form action={importRemapAction} className="mt-3 grid gap-2 sm:grid-cols-3">
          <MappingFields />
          <div className="sm:col-span-3">
            <SubmitButton variant="secondary" pendingText="…">Volver a leer</SubmitButton>
          </div>
        </form>
      </details>
      {p.rows.length === 0 ? (
        <p className="text-ui text-muted">Con estas columnas no encontramos movimientos. Revisá qué columna es la fecha y cuál el importe.</p>
      ) : (
        <form action={importConfirmAction} className="grid gap-3">
          <div className="hidden">
            <MappingFields />
          </div>
          <ul className="divide-y divide-line rounded-md border border-line bg-surface">
            {p.rows.slice(0, 300).map((r) => (
              <li key={r.externalId} className={`flex items-center gap-3 px-4 py-2.5 ${r.duplicate ? "opacity-60" : ""}`}>
                <input type="checkbox" name="row" value={r.externalId} defaultChecked={!r.duplicate} disabled={r.duplicate} aria-label={`Importar ${r.description}`} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-ui">{r.description}</p>
                  <p className="text-caption text-muted">
                    {r.date.split("-").reverse().join("/")}
                    {r.duplicate && " · ya estaba cargado"}
                  </p>
                </div>
                <span className={`num text-ui ${r.kind === "ingreso" ? "text-[#1f6b3d]" : ""}`}>
                  {r.kind === "ingreso" ? "+" : "−"}
                  {money(r.amount)}
                </span>
              </li>
            ))}
          </ul>
          {p.rows.length > 300 && <p className="text-meta text-muted">Mostramos los primeros 300; se importan los que marques de esta lista.</p>}
          <div className="flex flex-wrap gap-2">
            <SubmitButton pendingText="Importando…">Importar {fresh.length} movimientos</SubmitButton>
          </div>
        </form>
      )}
      <form action={importDiscardAction}>
        <input type="hidden" name="id" value={p.imp.id} />
        <SubmitButton variant="danger" pendingText="…">Descartar</SubmitButton>
      </form>
    </div>
  );
}
