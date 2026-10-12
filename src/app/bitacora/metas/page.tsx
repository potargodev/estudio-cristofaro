import type { Metadata } from "next";
import { archiveGoalAction, createGoalAction, goalMoveAction } from "@/app/bitacora/plus-actions";
import { SubmitButton } from "@/components/admin/ui";
import { Feedback } from "@/components/app/Feedback";
import { listGoals } from "@/modules/bitacora/planning";
import { bitacoraPlan } from "@/modules/bitacora/plus";
import { requireUser } from "@/modules/bitacora/session";
import { fieldClass } from "@/components/ds/primitives";
import { formatDate, formatMoney } from "@/lib/format";

export const metadata: Metadata = { title: "Metas" };
const KIND: Record<string, string> = { viaje: "Viaje", emergencia: "Fondo de emergencia", otro: "Meta" };
const field = `mt-1 ${fieldClass}`;

/** Metas de ahorro con el ahorro sugerido por semana y su progreso */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const me = await requireUser();
  const [goals, plan] = await Promise.all([listGoals(me.id), bitacoraPlan(me)]);
  return (
    <div className="grid gap-4">
      <Feedback sp={sp} />
      {goals.map((g) => (
        <section key={g.id} className="rounded-md border border-line bg-surface p-4" aria-label={g.name}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-lead font-semibold">
              {g.name} <span className="text-caption font-normal text-muted">· {KIND[g.kind]}</span>
            </p>
            <p className="num text-ui">
              {formatMoney(g.saved, "ARS", { decimals: "auto" })} de {formatMoney(g.target, "ARS", { decimals: "auto" })}
            </p>
          </div>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-canvas" role="progressbar" aria-label={`Avance de ${g.name}`} aria-valuenow={Math.round(g.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-navy" style={{ width: `${g.progress * 100}%` }} />
          </div>
          <p className="mt-2 text-meta text-muted">
            {g.progress >= 1 ? "¡Llegaste! " : g.weekly ? `Guardá ${formatMoney(g.weekly, "ARS", { decimals: "auto" })} por semana para llegar${g.deadline ? ` al ${formatDate(g.deadline, "numeric")}` : " en seis meses"}.` : ""}
          </p>
          <form action={goalMoveAction} className="mt-3 flex flex-wrap items-end gap-2">
            <input type="hidden" name="id" value={g.id} />
            <label className="text-meta text-muted">
              Monto
              <input name="amount" inputMode="decimal" required className={`${field} w-36`} />
            </label>
            <select name="op" aria-label="Sumar o sacar" className="h-(--control-h) rounded-md border border-line bg-surface px-2 text-ui">
              <option value="sumar">Sumar</option>
              <option value="sacar">Sacar</option>
            </select>
            <SubmitButton variant="secondary" pendingText="…">Guardar</SubmitButton>
          </form>
          <form action={archiveGoalAction} className="mt-2">
            <input type="hidden" name="id" value={g.id} />
            <button type="submit" className="text-meta text-muted underline-offset-4 hover:underline">
              Archivar
            </button>
          </form>
        </section>
      ))}
      <form action={createGoalAction} className="grid gap-2 rounded-md border border-line bg-surface p-4 sm:grid-cols-2">
        <p className="text-body font-semibold sm:col-span-2">Nueva meta</p>
        {plan.limits.goals != null && goals.length >= plan.limits.goals && <p className="text-meta text-[#7a5410] sm:col-span-2">En Bitácora Gratis tenés {plan.limits.goals} meta activa. Con Plus, todas las que quieras.</p>}
        <label className="text-meta text-muted">
          Para qué
          <input name="name" required placeholder="Ej.: Vacaciones en el sur" className={field} />
        </label>
        <label className="text-meta text-muted">
          Tipo
          <select name="kind" className={field}>
            <option value="viaje">Viaje</option>
            <option value="emergencia">Fondo de emergencia</option>
            <option value="otro">Otra</option>
          </select>
        </label>
        <label className="text-meta text-muted">
          Cuánto querés juntar
          <input name="target" inputMode="decimal" required className={field} />
        </label>
        <label className="text-meta text-muted">
          Para cuándo (opcional)
          <input name="deadline" type="date" className={field} />
        </label>
        <div>
          <SubmitButton pendingText="…">Crear la meta</SubmitButton>
        </div>
      </form>
    </div>
  );
}
