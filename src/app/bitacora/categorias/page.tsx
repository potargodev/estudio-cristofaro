import type { Metadata } from "next";
import Link from "next/link";
import { SubmitButton } from "@/components/admin/ui";
import { listCategories } from "@/modules/bitacora/server";
import { requireUser } from "@/modules/bitacora/session";
import { archiveCategoryAction, saveCategoryAction } from "../actions";

export const metadata: Metadata = { title: "Categorías" };

const field = "h-10 rounded-md border border-line bg-surface px-3 text-[14px] text-ink";

/** Categorías propias: renombrar, sumar y archivar (las archivadas no se borran de los movimientos) */
export default async function CategoriasPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const me = await requireUser();
  const cats = await listCategories(me.id, true);
  return (
    <div className="grid max-w-2xl gap-5">
      <Link href="/bitacora" className="text-[13px] text-muted hover:text-ink">
        ← Bitácora
      </Link>
      <h1 className="font-display text-[32px] leading-tight">Categorías</h1>
      {sp.ok && <p role="status" className="rounded-md bg-navy-soft px-4 py-2.5 text-[14px]">{sp.ok}</p>}
      {sp.error && <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 px-4 py-2.5 text-[14px] text-danger">{sp.error}</p>}
      <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
        {cats.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
            <form action={saveCategoryAction} className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <input type="hidden" name="id" value={c.id} />
              <label className="sr-only" htmlFor={`n-${c.id}`}>
                Nombre
              </label>
              <input id={`n-${c.id}`} name="name" defaultValue={c.name} maxLength={40} className={`${field} min-w-0 flex-1 ${c.archived ? "text-muted line-through" : ""}`} />
              <select name="kind" defaultValue={c.kind} aria-label="Tipo" className={field}>
                <option value="gasto">Gasto</option>
                <option value="ingreso">Ingreso</option>
              </select>
              <SubmitButton pendingText="…">Guardar</SubmitButton>
            </form>
            <form action={archiveCategoryAction}>
              <input type="hidden" name="id" value={c.id} />
              <input type="hidden" name="archived" value={c.archived ? "0" : "1"} />
              <button type="submit" className="h-10 rounded-md border border-line px-3 text-[13px] hover:border-muted">
                {c.archived ? "Recuperar" : "Archivar"}
              </button>
            </form>
          </li>
        ))}
      </ul>
      <form action={saveCategoryAction} className="flex flex-wrap items-end gap-2 rounded-lg border border-line bg-surface p-4">
        <label className="grid flex-1 gap-1 text-[13px] text-muted">
          Nueva categoría
          <input name="name" required maxLength={40} className={field} />
        </label>
        <select name="kind" aria-label="Tipo" className={field}>
          <option value="gasto">Gasto</option>
          <option value="ingreso">Ingreso</option>
        </select>
        <SubmitButton pendingText="…">Sumar</SubmitButton>
      </form>
    </div>
  );
}
