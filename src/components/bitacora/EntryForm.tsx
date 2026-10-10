import { SubmitButton } from "@/components/admin/ui";
import { PAYMENT_METHODS } from "@/modules/bitacora/catalog";

const field = "mt-1 h-11 w-full rounded-md border border-line bg-surface px-3 text-[15px] text-ink focus:border-navy focus:outline-none";
const label = "text-[13px] text-muted";

export interface EntryDefaults {
  id?: string;
  kind?: "gasto" | "ingreso";
  amount?: string;
  currency?: string;
  date?: string;
  categoryId?: string | null;
  description?: string;
  paymentMethod?: string | null;
  note?: string | null;
}

/** Formulario de un movimiento de Bitácora (cargar a mano, editar, o editar lo que propuso el Copiloto) */
export function EntryForm({
  action,
  categories,
  d = {},
  submit = "Guardar",
  hidden,
}: {
  action: (fd: FormData) => void | Promise<void>;
  categories: { id: string; name: string; kind: string }[];
  d?: EntryDefaults;
  submit?: string;
  hidden?: Record<string, string>;
}) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      {d.id && <input type="hidden" name="id" value={d.id} />}
      {Object.entries(hidden ?? {}).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <fieldset className="sm:col-span-2">
        <legend className="sr-only">Tipo</legend>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ["gasto", "Gasto"],
              ["ingreso", "Ingreso"],
            ] as const
          ).map(([v, l]) => (
            <label key={v} className="flex h-11 cursor-pointer items-center justify-center rounded-md border border-line text-[15px] has-[:checked]:border-navy has-[:checked]:bg-navy has-[:checked]:text-paper">
              <input type="radio" name="kind" value={v} defaultChecked={(d.kind ?? "gasto") === v} className="sr-only" />
              {l}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <label className={label}>
          Monto
          <input name="amount" required inputMode="decimal" defaultValue={d.amount} placeholder="0" autoComplete="off" className={`${field} tabular-nums text-[18px]`} />
        </label>
        <label className={label}>
          Moneda
          <select name="currency" defaultValue={d.currency ?? "ARS"} className={field}>
            <option value="ARS">ARS</option>
            <option value="USD">USD</option>
          </select>
        </label>
      </div>
      <label className={label}>
        Fecha
        <input name="date" type="date" required defaultValue={d.date ?? today} max="2100-12-31" className={field} />
      </label>
      <label className={`${label} sm:col-span-2`}>
        Comercio o descripción
        <input name="description" required maxLength={160} defaultValue={d.description} placeholder="Ej.: Supermercado Coto" className={field} />
      </label>
      <label className={label}>
        Categoría
        <select name="category" defaultValue={d.categoryId ?? ""} className={field}>
          <option value="">Sin categoría</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className={label}>
        Medio de pago
        <select name="method" defaultValue={d.paymentMethod ?? ""} className={field}>
          <option value="">Sin indicar</option>
          {Object.entries(PAYMENT_METHODS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <label className={`${label} sm:col-span-2`}>
        Nota (opcional)
        <input name="note" maxLength={500} defaultValue={d.note ?? ""} className={field} />
      </label>
      <div className="sm:col-span-2">
        <SubmitButton pendingText="Guardando…">{submit}</SubmitButton>
      </div>
    </form>
  );
}
