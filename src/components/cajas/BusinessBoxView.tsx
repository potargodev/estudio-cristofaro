import { ArrowDownLeft, ArrowUpRight, Briefcase, ChevronLeft, ChevronRight, HandCoins, PiggyBank, Wallet } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/admin/kit/PageHeader";
import { SubmitButton } from "@/components/admin/ui";
import { Feedback } from "@/components/app/Feedback";
import { addBusinessEntryAction, contributeAction, deleteBoxEntryAction, paySalaryAction, setSalaryAction } from "@/app/cajas/actions";
import { cn } from "@/lib/utils";
import { money, monthLabel, prevMonth } from "@/modules/bitacora/catalog";
import { BUSINESS_CATEGORIES, categoryName, SALARY_FREQUENCIES, TRANSFER_KINDS } from "@/modules/cajas/catalog";
import { boxEntries, businessSummary, salaryOf, salarySuggestion, type Box } from "@/modules/cajas/server";
import { todayAR } from "@/modules/gastos/constants";
import { NO_REEMPLAZA } from "@/modules/escudo/catalog";

const field = "mt-1 h-10 w-full rounded-md border border-line bg-surface px-2.5 text-[14px] text-ink";
const lbl = "block text-[13px] text-muted";
const card = "rounded-lg border border-line bg-surface p-5";
const nextMonth = (m: string) => {
  const [y, mm] = m.split("-").map(Number);
  return mm === 12 ? `${y + 1}-01` : `${y}-${String(mm + 1).padStart(2, "0")}`;
};
const day = (iso: string) => new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));
const amountText = (c: number) => (c / 100).toLocaleString("es-AR", { maximumFractionDigits: 2 });

type Me = { id: string; name: string; email: string; studioId: string };

/** Caja de negocio (§10 y §11): lo de la actividad, el sueldo del dueño y los aportes */
export async function BusinessBoxView({ me, box, month, sp }: { me: Me; box: Box; month: string; sp: Record<string, string | undefined> }) {
  const [s, list, salary, suggestion] = await Promise.all([businessSummary(me, box.id, month), boxEntries(me, box.id, month), salaryOf(me, box.id), salarySuggestion(me, box.id)]);
  const owner = box.owner_id === me.id;
  const today = todayAR();
  const hidden = (
    <>
      <input type="hidden" name="box" value={box.id} />
      <input type="hidden" name="mes" value={month} />
    </>
  );
  return (
    <div className="grid gap-6 pb-10 [&>*]:min-w-0">
      <Link href="/cajas" className="text-[13px] text-muted hover:text-ink">
        ← Mis cajas
      </Link>
      <PageHeader title={box.name} description="Caja de negocio: lo de tu actividad, separado de lo personal. Tu contador, si lo conectás, ve esta caja y lo fiscal; lo personal, no." className="mb-0" />
      <Feedback sp={sp} />

      <nav aria-label="Mes" className="flex items-center justify-between gap-2">
        <Link href={`/cajas/${box.id}?mes=${prevMonth(month)}`} className="inline-flex h-10 items-center gap-1 rounded-md border border-line px-3 text-[14px]">
          <ChevronLeft className="size-4" aria-hidden /> <span className="sr-only sm:not-sr-only">Anterior</span>
        </Link>
        <p className="text-[16px] font-medium capitalize text-ink">{monthLabel(month)}</p>
        <Link href={`/cajas/${box.id}?mes=${nextMonth(month)}`} className="inline-flex h-10 items-center gap-1 rounded-md border border-line px-3 text-[14px]">
          <span className="sr-only sm:not-sr-only">Siguiente</span> <ChevronRight className="size-4" aria-hidden />
        </Link>
      </nav>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Entró por la actividad", s.income],
          ["Salió por la actividad", s.expenses],
          ["Resultado", s.result],
          ["Queda en la caja", s.left],
        ].map(([k, v]) => (
          <div key={k as string} className="min-w-0 rounded-md border border-line bg-surface p-3">
            <dt className="text-[13px] text-muted">{k}</dt>
            <dd className={cn("num mt-1 truncate text-[18px] sm:text-[20px]", (v as number) < 0 ? "text-danger" : "text-ink")}>{money(v as number)}</dd>
          </div>
        ))}
      </dl>
      <p className="-mt-3 text-[13px] text-muted">
        Sueldo del dueño este mes: <span className="num">{money(s.salary)}</span> · aportes: <span className="num">{money(s.contributions)}</span>
        {s.uninvoiced > 0 && (
          <>
            {" "}· sin facturar: <span className="num">{money(s.uninvoiced)}</span>
          </>
        )}
      </p>

      <section aria-labelledby="cargar" className={card}>
        <h2 id="cargar" className="text-[16px] font-semibold">
          Cargar en el negocio
        </h2>
        <form action={addBusinessEntryAction} className="mt-3 grid gap-3 sm:grid-cols-2">
          {hidden}
          <fieldset className="flex gap-4 sm:col-span-2">
            <legend className="sr-only">Tipo</legend>
            <label className="flex items-center gap-2 text-[14px]">
              <input type="radio" name="kind" value="gasto" defaultChecked className="size-4 accent-navy" /> Gasto
            </label>
            <label className="flex items-center gap-2 text-[14px]">
              <input type="radio" name="kind" value="ingreso" className="size-4 accent-navy" /> Ingreso
            </label>
          </fieldset>
          <label>
            <span className={lbl}>Monto</span>
            <input name="amount" inputMode="decimal" required placeholder="Ej.: 15.000" className={field} />
          </label>
          <label>
            <span className={lbl}>Fecha</span>
            <input name="date" type="date" defaultValue={today} className={field} />
          </label>
          <label className="sm:col-span-2">
            <span className={lbl}>En qué fue</span>
            <input name="description" required maxLength={160} placeholder="Ej.: Licencia de Figma" className={field} />
          </label>
          <label>
            <span className={lbl}>Categoría</span>
            <select name="category" className={field}>
              {BUSINESS_CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.name} {c.kind === "ingreso" ? "(ingreso)" : ""}
                </option>
              ))}
            </select>
          </label>
          <div className="grid content-end gap-1.5">
            <label className="flex items-center gap-2 text-[14px]">
              <input type="checkbox" name="invoiced" className="size-4 accent-navy" /> Ingreso con factura
            </label>
            <label className="flex items-center gap-2 text-[14px]">
              <input type="checkbox" name="deductible" className="size-4 accent-navy" /> Gasto con comprobante a mi nombre
            </label>
          </div>
          <div className="sm:col-span-2">
            <SubmitButton pendingText="Cargando…">Cargar</SubmitButton>
          </div>
        </form>
      </section>

      <section aria-labelledby="movs" className="rounded-lg border border-line bg-surface">
        <h2 id="movs" className="px-5 pt-4 text-[16px] font-semibold">
          Movimientos de {monthLabel(month)}
        </h2>
        {list.length === 0 ? (
          <p className="px-5 pb-5 pt-2 text-[14px] text-muted">Todavía nada este mes.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {list.map((e) => {
              const transfer = e.kind === "retiro" || e.kind === "aporte";
              const Icon = e.kind === "ingreso" || e.kind === "aporte" ? ArrowDownLeft : ArrowUpRight;
              return (
                <li key={e.id} className="flex items-center gap-3 px-5 py-3" data-kind={e.kind}>
                  <Icon className={cn("size-4 shrink-0", e.kind === "ingreso" || e.kind === "aporte" ? "text-[#2f7a4c]" : "text-muted")} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] text-ink">{e.description}</span>
                    <span className="block text-[13px] text-muted">
                      {day(e.date)} · {transfer ? TRANSFER_KINDS[e.kind as "retiro" | "aporte"] : categoryName("negocio", null, e.category)}
                      {e.kind === "ingreso" && !e.invoiced ? " · sin facturar" : ""}
                      {e.source === "bitacora" ? " · movido de lo personal" : ""}
                    </span>
                  </span>
                  <span className={cn("num shrink-0 text-[15px]", e.kind === "ingreso" || e.kind === "aporte" ? "text-[#2f7a4c]" : "text-ink")}>
                    {e.kind === "ingreso" || e.kind === "aporte" ? "+" : "−"}
                    {money(e.amount, e.currency)}
                  </span>
                  <form action={deleteBoxEntryAction}>
                    {hidden}
                    <input type="hidden" name="id" value={e.id} />
                    <button type="submit" className="h-9 rounded-md px-2 text-[13px] text-muted hover:text-danger" aria-label={`Borrar ${e.description}`}>
                      Borrar
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {owner && (
        <section aria-labelledby="sueldo" className={card}>
          <h2 id="sueldo" className="flex items-center gap-2 text-[16px] font-semibold">
            <Wallet className="size-5 text-rose-deep" aria-hidden /> Tu sueldo
          </h2>
          <p className="mt-1 text-[14px] text-muted">El negocio te paga una cifra y esa es la única plata que pasa del negocio a lo personal. Todo lo demás queda en el negocio: así ves de verdad si ganás o perdés.</p>
          {suggestion && (
            <p data-sugerencia className="mt-3 rounded-md border border-line bg-navy-soft px-4 py-2.5 text-[14px] text-ink">
              {suggestion.average > 0
                ? `Según lo que cargaste, el negocio dejó en promedio ${money(suggestion.average)} por mes en los últimos meses. Un sueldo de ${money(suggestion.suggestion)} deja un 30 % en la caja.`
                : `Según lo que cargaste, el negocio no dejó resultado positivo en los últimos meses (promedio ${money(suggestion.average)}).`}{" "}
              Es un dato, no una recomendación. {NO_REEMPLAZA}
            </p>
          )}
          <form action={setSalaryAction} className="mt-4 grid gap-3 sm:grid-cols-4 sm:items-end">
            {hidden}
            <label>
              <span className={lbl}>Monto</span>
              <input name="amount" inputMode="decimal" required defaultValue={salary ? amountText(salary.amount) : suggestion?.suggestion ? amountText(suggestion.suggestion) : ""} className={field} />
            </label>
            <label>
              <span className={lbl}>Frecuencia</span>
              <select name="frequency" defaultValue={salary?.frequency ?? "mensual"} className={field}>
                {Object.entries(SALARY_FREQUENCIES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className={lbl}>Próximo sueldo</span>
              <input name="next_date" type="date" defaultValue={salary?.next_date ?? today} className={field} />
            </label>
            <label className="flex h-10 items-center gap-2 text-[14px]">
              <input type="checkbox" name="active" defaultChecked={salary?.active ?? true} className="size-4 accent-navy" /> Registrarlo solo
            </label>
            <div className="sm:col-span-4">
              <SubmitButton variant="secondary" pendingText="Guardando…">
                Guardar sueldo
              </SubmitButton>
            </div>
          </form>
          <form action={paySalaryAction} className="mt-4 flex flex-wrap items-end gap-3 border-t border-line pt-4">
            {hidden}
            <label>
              <span className={lbl}>Pagarte ahora</span>
              <input name="amount" inputMode="decimal" required defaultValue={salary ? amountText(salary.amount) : ""} className={cn(field, "w-40")} />
            </label>
            <SubmitButton pendingText="…">
              <span className="inline-flex items-center gap-1.5">
                <HandCoins className="size-4" aria-hidden /> Registrar sueldo
              </span>
            </SubmitButton>
          </form>
        </section>
      )}

      <section aria-labelledby="aporte" className={card}>
        <h2 id="aporte" className="flex items-center gap-2 text-[16px] font-semibold">
          <PiggyBank className="size-5 text-rose-deep" aria-hidden /> Poner plata en el negocio
        </h2>
        <p className="mt-1 text-[14px] text-muted">Un aporte sale de tu caja personal (queda en la Bitácora) y entra en el negocio. Es el otro movimiento permitido entre cajas.</p>
        <form action={contributeAction} className="mt-3 flex flex-wrap items-end gap-3">
          {hidden}
          <label>
            <span className={lbl}>Monto</span>
            <input name="amount" inputMode="decimal" required className={cn(field, "w-40")} />
          </label>
          <label className="min-w-0 flex-1">
            <span className={lbl}>Nota (opcional)</span>
            <input name="note" maxLength={200} className={field} />
          </label>
          <SubmitButton variant="secondary" pendingText="…">
            Registrar aporte
          </SubmitButton>
        </form>
      </section>

      <p className="flex items-center gap-2 text-[13px] text-muted">
        <Briefcase className="size-4" aria-hidden /> {NO_REEMPLAZA} Los números son los que cargaste.
      </p>
    </div>
  );
}
