import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EntryForm } from "@/components/bitacora/EntryForm";
import { CopilotOrigin } from "@/components/copiloto/CopilotOrigin";
import { BitacoraError, getEntry, listCategories } from "@/modules/bitacora/server";
import { requireUser } from "@/modules/bitacora/session";
import { originOf } from "@/modules/copilot/server";
import { deleteEntryAction, updateEntryAction } from "../actions";
import { professionalAction } from "../plus-actions";
import { SubmitButton } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Movimiento" };

/** Editar un movimiento propio (y ver de qué mensaje del Vigía salió) */
export default async function EntryPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ mes?: string; error?: string; ok?: string }> }) {
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
  const [cats, origin] = await Promise.all([listCategories(me.id), e.source === "copiloto" ? originOf(me.id, "movimiento", e.id) : null]);
  const mes = sp.mes ?? e.date.slice(0, 7);
  const autonomo = me.role === "titular" && me.tenantKind === "personal";
  return (
    <div className="grid max-w-2xl gap-5">
      <Link href={`/bitacora?mes=${mes}`} className="text-[13px] text-muted hover:text-ink">
        ← Bitácora
      </Link>
      <h1 className="font-display text-[28px] leading-tight text-ink sm:text-[32px]">{e.kind === "ingreso" ? "Ingreso" : "Gasto"}</h1>
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
      {sp.ok && (
        <p role="status" className="rounded-md border border-line bg-navy-soft px-4 py-2.5 text-[14px] text-ink">
          {sp.ok}
        </p>
      )}
      {autonomo && e.kind === "gasto" && (
        <section className="grid gap-3 rounded-lg border border-line bg-surface p-5" aria-label="Personal o de tu actividad">
          <p className="text-[15px] font-medium">¿Es de tu actividad?</p>
          <form action={professionalAction} className="grid gap-2">
            <input type="hidden" name="id" value={e.id} />
            <label className="flex items-center gap-2 text-[14px]">
              <input type="checkbox" name="professional" defaultChecked={e.professional} /> Es un gasto de mi actividad (no personal)
            </label>
            <label className="flex items-center gap-2 text-[14px]">
              <input type="checkbox" name="deductible" defaultChecked={e.deductible} /> Se puede deducir
            </label>
            <div>
              <SubmitButton variant="secondary" pendingText="…">Guardar</SubmitButton>
            </div>
          </form>
          {e.accounting_expense_id ? (
            <p className="text-[13px] text-muted">Ya está en los gastos de tu actividad en Faro Personal.</p>
          ) : (
            <form action={professionalAction}>
              <input type="hidden" name="id" value={e.id} />
              <input type="hidden" name="op" value="pasar" />
              <SubmitButton pendingText="…">Pasar a Faro Personal</SubmitButton>
            </form>
          )}
        </section>
      )}
      {origin && <CopilotOrigin o={origin} />}
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
