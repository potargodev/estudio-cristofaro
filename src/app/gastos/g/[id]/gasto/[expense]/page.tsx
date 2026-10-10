import { Paperclip } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CommentForm } from "@/components/gastos/forms";
import { CATEGORIES, FX_SOURCES, RECURRENCES, SPLIT_METHODS, formatMoney, type Category } from "@/modules/gastos/constants";
import { requireGastos } from "@/modules/gastos/server/session";
import { GastosError, getGroupView } from "@/modules/gastos/server/service";
import { deleteExpenseAction, stopRecurrenceAction } from "../../../../actions";

export const metadata = { title: "Gasto" };

const when = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires" });

export default async function GastoDetalle({ params }: { params: Promise<{ id: string; expense: string }> }) {
  const { id, expense } = await params;
  const actor = await requireGastos();
  let v;
  try {
    v = await getGroupView(actor, id);
  } catch (e) {
    if (e instanceof GastosError) notFound();
    throw e;
  }
  const e = v.expenses.find((x) => x.id === expense);
  if (!e) notFound();
  const name = (mid: string | null) => v.allMembers.find((m) => m.id === mid)?.name ?? "Alguien";
  const comments = v.comments.filter((c) => c.expense_id === e.id);
  const canDelete = e.created_by === v.me.id || v.me.role === "admin";
  const date = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${e.date}T12:00:00Z`));
  return (
    <>
      <Link href={`/gastos/g/${v.group.id}`} className="text-[14px] text-rose-deep underline-offset-4 hover:underline">
        ← {v.group.name}
      </Link>
      <p className="mt-4 text-[13px] text-muted">
        {CATEGORIES[e.category as Category] ?? "Otros"} · {date}
      </p>
      <h1 className="mt-1 font-display text-4xl leading-tight">{e.description}</h1>
      <p className="mt-2 font-display text-[44px] leading-none tabular-nums">{formatMoney(e.amount, e.currency)}</p>
      {e.fx_rate && (
        <p className="mt-2 text-[14px] text-muted">
          ≈ {formatMoney(Math.round(e.amount * Number(e.fx_rate)), v.group.base_currency)} · 1 {e.currency} = {Number(e.fx_rate).toLocaleString("es-AR")} {v.group.base_currency} ({FX_SOURCES[e.fx_source as keyof typeof FX_SOURCES] ?? e.fx_source}, {e.fx_date})
        </p>
      )}
      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <section className="border border-line bg-surface p-4">
          <h2 className="text-[13px] font-medium uppercase tracking-[0.14em] text-muted">Pagó</h2>
          <ul className="mt-2 grid gap-1 text-[15px]">
            {Object.entries(e.payers).map(([m, a]) => (
              <li key={m} className="flex justify-between">
                <span>{name(m)}</span>
                <span className="tabular-nums">{formatMoney(a, e.currency)}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="border border-line bg-surface p-4">
          <h2 className="text-[13px] font-medium uppercase tracking-[0.14em] text-muted">{SPLIT_METHODS[e.split_method]}</h2>
          <ul className="mt-2 grid gap-1 text-[15px]">
            {Object.entries(e.shares).map(([m, a]) => (
              <li key={m} className="flex justify-between">
                <span>{name(m)}</span>
                <span className="tabular-nums">{formatMoney(a, e.currency)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <ul className="mt-4 grid gap-1 text-[14px] text-muted">
        {e.is_company && <li>Gasto de la empresa{v.organizationName ? ` · ${v.organizationName}` : ""}</li>}
        {e.is_deductible && <li>Deducible</li>}
        {e.recurrence && <li>Se repite: {RECURRENCES[e.recurrence as keyof typeof RECURRENCES]} (próximo {e.recurrence_next})</li>}
        {e.notes && <li className="whitespace-pre-line text-ink">{e.notes}</li>}
        <li>Cargado por {name(e.created_by)}</li>
      </ul>
      {e.receipt_path && (
        <a href={`/api/gastos/archivo/gasto/${e.id}`} target="_blank" className="mt-4 inline-flex items-center gap-2 text-[15px] text-rose-deep underline-offset-4 hover:underline">
          <Paperclip className="size-4" aria-hidden />
          Ver comprobante ({e.receipt_name})
        </a>
      )}

      <section className="mt-10">
        <h2 className="mb-3 font-display text-2xl">Comentarios</h2>
        <ul className="mb-4 grid gap-3">
          {comments.map((c) => (
            <li key={c.id} className="border-l-2 border-line pl-3">
              <p className="text-[15px]">{c.body}</p>
              <p className="text-[12px] text-muted">
                {name(c.member_id)} · {when.format(c.created_at)}
              </p>
            </li>
          ))}
          {comments.length === 0 && <li className="text-muted">Sin comentarios.</li>}
        </ul>
        <CommentForm groupId={v.group.id} expenseId={e.id} />
      </section>

      <div className="mt-10 flex flex-wrap gap-3 border-t border-line pt-6">
        {e.recurrence && (
          <form action={stopRecurrenceAction}>
            <input type="hidden" name="group" value={v.group.id} />
            <input type="hidden" name="expense" value={e.id} />
            <button className="h-11 border border-line px-4 text-[14px] hover:bg-navy-soft">Dejar de repetir</button>
          </form>
        )}
        {canDelete && (
          <form action={deleteExpenseAction}>
            <input type="hidden" name="group" value={v.group.id} />
            <input type="hidden" name="expense" value={e.id} />
            <button className="h-11 border border-danger/40 px-4 text-[14px] text-danger hover:bg-danger/5">Borrar gasto</button>
          </form>
        )}
      </div>
    </>
  );
}
