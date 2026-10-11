import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EntryForm } from "@/components/bitacora/EntryForm";
import { CopilotOrigin } from "@/components/copiloto/CopilotOrigin";
import { BitacoraError, getEntry, listCategories } from "@/modules/bitacora/server";
import { requireUser } from "@/modules/bitacora/session";
import { originOf } from "@/modules/copilot/server";
import { deleteEntryAction, updateEntryAction } from "../actions";
import { moveToBusinessAction } from "@/app/cajas/actions";
import { looksLikeBusiness } from "@/modules/cajas/catalog";
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
  const fromBox = !!(e.transfer_id || e.box_entry_id);
  const hint = looksLikeBusiness(e.description, e.note);
  return (
    <div className="grid max-w-2xl gap-5">
      <Link href={`/bitacora?mes=${mes}`} className="text-meta text-muted hover:text-ink">
        ← Bitácora
      </Link>
      <h1 className="font-display text-[28px] leading-tight text-ink sm:text-[32px]">{e.kind === "ingreso" ? "Ingreso" : "Gasto"}</h1>
      {sp.error && (
        <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 px-4 py-2.5 text-ui text-danger">
          {sp.error}
        </p>
      )}
      <div className={fromBox ? "pointer-events-none rounded-lg border border-line bg-surface p-5 opacity-60" : "rounded-lg border border-line bg-surface p-5"} aria-disabled={fromBox || undefined}>
        <EntryForm
          action={updateEntryAction}
          categories={cats}
          hidden={{ mes }}
          d={{
            id: e.id,
            kind: e.kind,
            amount: (e.amount / 100).toLocaleString("es-AR", { maximumFractionDigits: 2 }),
            currency: e.currency,
            date: e.date,
            categoryId: e.category_id,
            description: e.description,
            paymentMethod: e.payment_method,
            note: e.note,
          }}
        />
      </div>
      {sp.ok && (
        <p role="status" className="rounded-md border border-line bg-navy-soft px-4 py-2.5 text-ui text-ink">
          {sp.ok}
        </p>
      )}
      {fromBox ? (
        <p className="rounded-md border border-line bg-navy-soft px-4 py-2.5 text-ui text-ink">
          {e.transfer_id ? "Es un movimiento entre cajas (sueldo del dueño o aporte). Se cambia o se borra desde " : "Este movimiento también está en una caja compartida. Se cambia desde "}
          <Link href="/cajas" className="underline underline-offset-4">
            Mis cajas
          </Link>
          .
        </p>
      ) : (
        <section className="grid gap-3 rounded-lg border border-line bg-surface p-5" aria-label="¿Es de tu negocio?">
          <p className="text-body font-medium">¿Es de tu negocio?</p>
          <p className="text-ui text-muted">
            {hint ? `Parece del trabajo (por «${hint}»). ` : ""}Lo de tu actividad va en la caja de negocio, separado de lo personal. Al moverlo no se duplica: sale de acá y queda allá, con el registro original.
          </p>
          <form action={moveToBusinessAction}>
            <input type="hidden" name="id" value={e.id} />
            <input type="hidden" name="volver" value={`/bitacora/${e.id}`} />
            <SubmitButton variant="secondary" pendingText="…">
              Mover a la caja de negocio
            </SubmitButton>
          </form>
          {e.accounting_expense_id && <p className="text-meta text-muted">Antes lo pasaste a los gastos de tu actividad en Faro Personal; ese registro se conserva.</p>}
        </section>
      )}
      {origin && <CopilotOrigin o={origin} />}
      {!fromBox && (
        <form action={deleteEntryAction}>
          <input type="hidden" name="id" value={e.id} />
          <input type="hidden" name="mes" value={mes} />
          <button type="submit" className="h-10 rounded-md border border-danger/40 px-4 text-ui text-danger hover:bg-danger/10">
            Borrar movimiento
          </button>
        </form>
      )}
    </div>
  );
}
