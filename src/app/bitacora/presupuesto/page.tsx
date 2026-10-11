import type { Metadata } from "next";
import { applySuggestedAction, saveBudgetAction } from "@/app/bitacora/plus-actions";
import { SubmitButton } from "@/components/admin/ui";
import { Feedback } from "@/components/app/Feedback";
import { cn } from "@/lib/utils";
import { money, monthLabel } from "@/modules/bitacora/catalog";
import { budgetView } from "@/modules/bitacora/planning";
import { requireUser } from "@/modules/bitacora/session";

export const metadata: Metadata = { title: "Sobres" };

/** Presupuesto por categoría ("sobres"): sugerido con lo que solés gastar, editable */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const me = await requireUser();
  const v = await budgetView(me.id);
  const pending = v.list.filter((x) => x.suggested && x.budget == null).length;
  return (
    <div className="grid gap-4">
      <Feedback sp={sp} />
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-surface p-4">
        <p className="text-[14px]">
          {monthLabel(v.month)}: llevás <span className="num">{money(v.totalSpent)}</span> de <span className="num">{money(v.total)}</span> en tus sobres.
        </p>
        {pending > 0 && (
          <form action={applySuggestedAction}>
            <SubmitButton pendingText="…">Usar los {pending} sugeridos</SubmitButton>
          </form>
        )}
      </div>
      {!v.hasHistory && <p className="text-[14px] text-muted">Cuando tengas al menos un mes completo cargado, te sugerimos cuánto poner en cada sobre según lo que solés gastar.</p>}
      <ul className="grid gap-2">
        {v.list.map((x) => {
          const pct = x.budget ? x.spent / x.budget : 0;
          return (
            <li key={x.categoryId} className="rounded-md border border-line bg-surface p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[15px] font-medium">{x.name}</p>
                <p className="num text-[14px] text-muted">
                  {money(x.spent)}
                  {x.budget ? ` de ${money(x.budget)}` : ""}
                </p>
              </div>
              {x.budget ? (
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-canvas" role="progressbar" aria-label={`Uso del sobre ${x.name}`} aria-valuenow={Math.round(pct * 100)} aria-valuemin={0} aria-valuemax={100}>
                  <div className={cn("h-full rounded-full", pct > 1 ? "bg-[#c4482f]" : pct > 0.8 ? "bg-[#d6a32a]" : "bg-navy")} style={{ width: `${Math.min(100, pct * 100)}%` }} />
                </div>
              ) : null}
              <form action={saveBudgetAction} className="mt-3 flex flex-wrap items-end gap-2">
                <input type="hidden" name="category_id" value={x.categoryId} />
                <label className="text-[13px] text-muted">
                  Sobre por mes
                  <input name="amount" inputMode="decimal" defaultValue={x.budget ? String(x.budget / 100) : ""} placeholder={x.suggested ? `Sugerido: ${x.suggested / 100}` : "Sin sobre"} className="mt-1 block h-9 w-40 rounded-md border border-line bg-surface px-2 text-[14px] text-ink" />
                </label>
                <SubmitButton variant="secondary" pendingText="…">Guardar</SubmitButton>
                {x.suggested && <span className="text-[12px] text-muted">Sugerido: {money(x.suggested)} (mediana de los últimos meses)</span>}
              </form>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
