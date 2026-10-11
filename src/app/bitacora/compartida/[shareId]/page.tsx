import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { sharedEntryAction } from "@/app/bitacora/plus-actions";
import { SubmitButton } from "@/components/admin/ui";
import { Feedback } from "@/components/app/Feedback";
import { isMonth, money, monthLabel, monthOf } from "@/modules/bitacora/catalog";
import { monthSummary } from "@/modules/bitacora/server";
import { sharedAccess } from "@/modules/bitacora/shares";
import { requireUser } from "@/modules/bitacora/session";
import { fieldClass } from "@/components/ds/primitives";

export const metadata: Metadata = { title: "Bitácora compartida" };
const field = `mt-1 ${fieldClass}`;

/** Bitácora de otra persona: solo con una invitación aceptada y vigente (si no, 404) */
export default async function Page({ params, searchParams }: { params: Promise<{ shareId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const [{ shareId }, sp] = await Promise.all([params, searchParams]);
  const me = await requireUser();
  const share = await sharedAccess(me.id, shareId);
  if (!share) notFound();
  const month = isMonth(sp.mes) ? sp.mes : monthOf();
  const sum = await monthSummary(share.ownerId, month);
  const ars = sum.byCurrency.ARS.now;
  const list = sum.movements.filter((m) => m.source !== "grupo");
  return (
    <div className="grid gap-4">
      <Link href="/bitacora/compartida" className="text-meta text-muted hover:text-ink">← Hogar</Link>
      <Feedback sp={sp} />
      <h2 className="text-title font-semibold">
        Bitácora de {share.owner} · <span className="font-normal">{monthLabel(month)}</span>
      </h2>
      <dl className="grid grid-cols-3 gap-2 rounded-md border border-line bg-surface p-4 text-meta">
        <div><dt className="text-muted">Entró</dt><dd className="num text-lead">{money(ars.in)}</dd></div>
        <div><dt className="text-muted">Salió</dt><dd className="num text-lead">{money(ars.out)}</dd></div>
        <div><dt className="text-muted">Queda</dt><dd className="num text-lead">{money(ars.left)}</dd></div>
      </dl>
      {share.permission === "cargar" && (
        <form action={sharedEntryAction} className="grid gap-2 rounded-md border border-line bg-surface p-4 sm:grid-cols-[8rem_1fr_9rem_9rem_auto] sm:items-end">
          <input type="hidden" name="share" value={share.id} />
          <label className="text-meta text-muted">
            Tipo
            <select name="kind" className={field}>
              <option value="gasto">Gasto</option>
              <option value="ingreso">Ingreso</option>
            </select>
          </label>
          <label className="text-meta text-muted">
            Qué fue
            <input name="description" required className={field} />
          </label>
          <label className="text-meta text-muted">
            Monto
            <input name="amount" inputMode="decimal" required className={field} />
          </label>
          <label className="text-meta text-muted">
            Fecha
            <input name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className={field} />
          </label>
          <SubmitButton pendingText="…">Cargar</SubmitButton>
        </form>
      )}
      {list.length === 0 ? (
        <p className="text-ui text-muted">No hay movimientos este mes.</p>
      ) : (
        <ul className="divide-y divide-line rounded-md border border-line bg-surface">
          {list.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-ui">{m.description}</p>
                <p className="text-caption text-muted">{m.date.split("-").reverse().join("/")} · {m.categoryName}</p>
              </div>
              <span className="num text-ui">{m.kind === "ingreso" ? "+" : "−"}{money(m.amount, m.currency)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
