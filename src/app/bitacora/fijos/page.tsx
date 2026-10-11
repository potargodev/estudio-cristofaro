import type { Metadata } from "next";
import { addRecurringAction, recurringAction, weeklyPrefAction } from "@/app/bitacora/plus-actions";
import { getPrefs } from "@/lib/prefs";
import { SubmitButton } from "@/components/admin/ui";
import { Feedback } from "@/components/app/Feedback";
import { money } from "@/modules/bitacora/catalog";
import { listRecurring, refreshRecurring } from "@/modules/bitacora/recurring";
import { requireUser } from "@/modules/bitacora/session";

export const metadata: Metadata = { title: "Gastos fijos y suscripciones" };

const d = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;

/** Gastos fijos y suscripciones: los detectamos solos por recurrencia y avisamos antes de cada vencimiento */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const me = await requireUser();
  await refreshRecurring(me.id);
  const [list, prefs] = await Promise.all([listRecurring(me.id), getPrefs(me.id)]);
  const weekly = prefs.weeklySummary !== false;
  const monthly = list.reduce((s, r) => s + r.last_amount, 0);
  return (
    <div className="grid gap-4">
      <Feedback sp={sp} />
      <p className="rounded-md border border-line bg-surface p-4 text-ui">
        Tus fijos y suscripciones suman <span className="num font-medium">{money(monthly)}</span> por mes. Te avisamos antes de que venzan, cuando se renuevan y si suben de precio.
      </p>
      {list.length === 0 ? (
        <p className="text-ui text-muted">Todavía no detectamos gastos que se repitan. Con dos o tres meses cargados (o importando tus resúmenes) aparecen solos.</p>
      ) : (
        <ul className="divide-y divide-line rounded-md border border-line bg-surface">
          {list.map((r) => (
            <li key={r.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[1fr_auto] sm:items-center">
              <div className="min-w-0">
                <p className="truncate text-body">
                  {r.label} <span className="text-caption text-muted">· {r.kind === "suscripcion" ? "suscripción" : "fijo"}{r.status === "detectado" ? " · detectado" : ""}</span>
                </p>
                <p className="text-meta text-muted">
                  <span className="num">{money(r.last_amount)}</span> · próximo el {d(r.next_date)}
                  {r.price_change_pct && <span className="text-[#8f2a1c]"> · subió {Number(r.price_change_pct)}%</span>}
                  {r.still_used === false && <span className="text-[#8f2a1c]"> · dijiste que no la usás</span>}
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {r.status === "detectado" && (
                  <form action={recurringAction}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="op" value="confirmar" />
                    <SubmitButton variant="secondary" pendingText="…">Es fijo</SubmitButton>
                  </form>
                )}
                {r.kind === "suscripcion" && r.still_used == null && (
                  <>
                    <form action={recurringAction}>
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="op" value="la_uso" />
                      <SubmitButton variant="secondary" pendingText="…">La uso</SubmitButton>
                    </form>
                    <form action={recurringAction}>
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="op" value="no_la_uso" />
                      <SubmitButton variant="secondary" pendingText="…">No la uso</SubmitButton>
                    </form>
                  </>
                )}
                <form action={recurringAction}>
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="op" value="descartar" />
                  <SubmitButton variant="danger" pendingText="…">No es fijo</SubmitButton>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
      <form action={addRecurringAction} className="grid gap-2 rounded-md border border-line bg-surface p-4 sm:grid-cols-[1fr_9rem_6rem_9rem_auto] sm:items-end">
        <p className="text-ui font-medium sm:col-span-5">Agregar uno a mano</p>
        <label className="text-meta text-muted">
          Qué es
          <input name="label" required placeholder="Ej.: Alquiler" className="mt-1 block h-9 w-full rounded-md border border-line bg-surface px-2 text-ui text-ink" />
        </label>
        <label className="text-meta text-muted">
          Monto
          <input name="amount" inputMode="decimal" required className="mt-1 block h-9 w-full rounded-md border border-line bg-surface px-2 text-ui text-ink" />
        </label>
        <label className="text-meta text-muted">
          Día
          <input name="day" type="number" min={1} max={28} defaultValue={10} className="mt-1 block h-9 w-full rounded-md border border-line bg-surface px-2 text-ui text-ink" />
        </label>
        <label className="text-meta text-muted">
          Tipo
          <select name="kind" className="mt-1 block h-9 w-full rounded-md border border-line bg-surface px-2 text-ui text-ink">
            <option value="fijo">Gasto fijo</option>
            <option value="suscripcion">Suscripción</option>
          </select>
        </label>
        <SubmitButton pendingText="…">Agregar</SubmitButton>
      </form>
      <form action={weeklyPrefAction} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-surface p-4">
        <input type="hidden" name="on" value={weekly ? "0" : "1"} />
        <p className="text-ui">Resumen de la semana, cada domingo: <span className="font-medium">{weekly ? "prendido" : "apagado"}</span></p>
        <SubmitButton variant="secondary" pendingText="…">{weekly ? "Apagar" : "Prender"}</SubmitButton>
      </form>
    </div>
  );
}
