import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EntryForm } from "@/components/bitacora/EntryForm";
import { BitacoraError, getEntry, listCategories } from "@/modules/bitacora/server";
import { requireUser } from "@/modules/bitacora/session";
import { deleteEntryAction, updateEntryAction } from "../actions";

export const metadata: Metadata = { title: "Movimiento" };

/** Editar un movimiento propio (y ver de qué mensaje del Copiloto salió) */
export default async function EntryPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ mes?: string; error?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const me = await requireUser();
  let e;
  try {
    e = await getEntry(me.id, id);
  } catch (err) {
    if (err instanceof BitacoraError) notFound();
    throw err;
  }
  if (e.deleted_at) notFound();
  const cats = await listCategories(me.id);
  const mes = sp.mes ?? e.date.slice(0, 7);
  return (
    <div className="grid max-w-2xl gap-5">
      <Link href={`/bitacora?mes=${mes}`} className="text-[13px] text-muted hover:text-ink">
        ← Bitácora
      </Link>
      <h1 className="font-display text-[32px] leading-tight">{e.kind === "ingreso" ? "Ingreso" : "Gasto"}</h1>
      {sp.error && (
        <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 px-4 py-2.5 text-[14px] text-danger">
          {sp.error}
        </p>
      )}
      <div className="rounded-lg border border-line bg-surface p-5">
        <EntryForm
          action={updateEntryAction}
          categories={cats}
          hidden={{ mes }}
          d={{ id: e.id, kind: e.kind, amount: (e.amount / 100).toLocaleString("es-AR", { maximumFractionDigits: 2 }), currency: e.currency, date: e.date, categoryId: e.category_id, description: e.description, paymentMethod: e.payment_method, note: e.note }}
        />
      </div>
      <form action={deleteEntryAction}>
        <input type="hidden" name="id" value={e.id} />
        <input type="hidden" name="mes" value={mes} />
        <button type="submit" className="h-10 rounded-md border border-danger/40 px-4 text-[14px] text-danger hover:bg-danger/10">
          Borrar movimiento
        </button>
      </form>
    </div>
  );
}
