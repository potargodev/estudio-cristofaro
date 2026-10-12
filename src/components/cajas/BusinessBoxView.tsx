import { Eye, ArrowDownLeft, ArrowUpRight, Briefcase, ChevronLeft, ChevronRight, HandCoins, PiggyBank, Wallet } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/admin/kit/PageHeader";
import { SubmitButton } from "@/components/admin/ui";
import { Feedback } from "@/components/app/Feedback";
import { addBusinessEntryAction, contributeAction, deleteBoxEntryAction, paySalaryAction, setSalaryAction } from "@/app/cajas/actions";
import { cn } from "@/lib/utils";
import { prevMonth } from "@/modules/bitacora/catalog";
import { BUSINESS_CATEGORIES, categoryName, SALARY_FREQUENCIES, TRANSFER_KINDS } from "@/modules/cajas/catalog";
import { boxEntries, businessSummary, salaryOf, salarySuggestion, type Box } from "@/modules/cajas/server";
import { CHANGA_CONTEXT, NO_REEMPLAZA } from "@/modules/escudo/catalog";
import { grayZone } from "@/modules/escudo/server";
import { Derivaciones } from "@/components/escudo/Derivaciones";
import { fieldClass } from "@/components/ds/primitives";
import { formatDate, formatMoney, formatNumber, formatPeriod, todayAR } from "@/lib/format";

const field = `mt-1 ${fieldClass}`;
const lbl = "block text-meta text-muted";
const card = "rounded-lg border border-line bg-surface p-5";
const nextMonth = (m: string) => {
  const [y, mm] = m.split("-").map(Number);
  return mm === 12 ? `${y + 1}-01` : `${y}-${String(mm + 1).padStart(2, "0")}`;
};

type Me = { id: string; name: string; email: string; studioId: string; role: string; tenantKind: string };

/** Caja de negocio (§10 y §11): lo de la actividad, el sueldo del dueño y los aportes */
export async function BusinessBoxView({ me, box, month, sp }: { me: Me; box: Box; month: string; sp: Record<string, string | undefined> }) {
  const [s, list, salary, suggestion, gray] = await Promise.all([businessSummary(me, box.id, month), boxEntries(me, box.id, month), salaryOf(me, box.id), salarySuggestion(me, box.id), grayZone(me)]);
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
      <Link href="/cajas" className="text-meta text-muted hover:text-ink">
        ← Mis cajas
      </Link>
      <PageHeader title={box.name} description="Caja de negocio: lo de tu actividad, separado de lo personal. Tu contador, si lo conectás, ve esta caja y lo fiscal; lo personal, no." className="mb-0" />
      <Feedback sp={sp} />

      {gray && gray.withoutRegime && gray.total > 0 && (
        <section aria-labelledby="foto" data-zona-gris className="rounded-lg border border-rose/40 bg-rose-soft p-5">
          <h2 id="foto" className="flex items-center gap-2 text-lead font-semibold text-ink">
            <Eye className="size-5 text-rose-deep" aria-hidden /> Esto ya es una actividad
          </h2>
          <p className="mt-1 text-ui text-ink">
            Según lo que registraste, en los últimos 12 meses cobraste <span className="num font-medium">{formatMoney(gray.total, "ARS", { decimals: "auto" })}</span> sin facturar, en {gray.months} {gray.months === 1 ? "mes" : "meses"}. No es un juicio: es la foto de lo que cargaste.
          </p>
          <p className="mt-2 text-meta text-muted">{CHANGA_CONTEXT}</p>
          <p className="mt-2 text-meta text-muted">
            Cuando crece, lo que corresponde es anotarse en el monotributo con un contador.{" "}
            <Link href="/red-contable?necesito=changa_actividad" className="font-medium text-rose-deep underline underline-offset-4">
              Buscar un contador
            </Link>
          </p>
        </section>
      )}
      <Derivaciones me={me} volver={`/cajas/${box.id}`} max={1} />

      <nav aria-label="Mes" className="flex items-center justify-between gap-2">
        <Link href={`/cajas/${box.id}?mes=${prevMonth(month)}`} className="inline-flex h-10 items-center gap-1 rounded-md border border-line px-3 text-ui">
          <ChevronLeft className="size-4" aria-hidden /> <span className="sr-only sm:not-sr-only">Anterior</span>
        </Link>
        <p className="text-lead font-medium capitalize text-ink">{formatPeriod(month)}</p>
        <Link href={`/cajas/${box.id}?mes=${nextMonth(month)}`} className="inline-flex h-10 items-center gap-1 rounded-md border border-line px-3 text-ui">
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
            <dt className="text-meta text-muted">{k}</dt>
            <dd className={cn("num mt-1 truncate text-title sm:text-section", (v as number) < 0 ? "text-danger" : "text-ink")}>{formatMoney(v as number, "ARS", { decimals: "auto" })}</dd>
          </div>
        ))}
      </dl>
      <p className="-mt-3 text-meta text-muted">
        Sueldo del dueño este mes: <span className="num">{formatMoney(s.salary, "ARS", { decimals: "auto" })}</span> · aportes: <span className="num">{formatMoney(s.contributions, "ARS", { decimals: "auto" })}</span>
        {s.uninvoiced > 0 && (
          <>
            {" "}· sin facturar: <span className="num">{formatMoney(s.uninvoiced, "ARS", { decimals: "auto" })}</span>
          </>
        )}
      </p>

      <section aria-labelledby="cargar" className={card}>
        <h2 id="cargar" className="text-lead font-semibold">
          Cargar en el negocio
        </h2>
        <form action={addBusinessEntryAction} className="mt-3 grid gap-3 sm:grid-cols-2">
          {hidden}
          <fieldset className="flex gap-4 sm:col-span-2">
            <legend className="sr-only">Tipo</legend>
            <label className="flex items-center gap-2 text-ui">
              <input type="radio" name="kind" value="gasto" defaultChecked className="size-4 accent-navy" /> Gasto
            </label>
            <label className="flex items-center gap-2 text-ui">
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
            <label className="flex items-center gap-2 text-ui">
              <input type="checkbox" name="invoiced" className="size-4 accent-navy" /> Ingreso con factura
            </label>
            <label className="flex items-center gap-2 text-ui">
              <input type="checkbox" name="deductible" className="size-4 accent-navy" /> Gasto con comprobante a mi nombre
            </label>
          </div>
          <div className="sm:col-span-2">
            <SubmitButton pendingText="Cargando…">Cargar</SubmitButton>
          </div>
        </form>
      </section>

      <section aria-labelledby="movs" className="rounded-lg border border-line bg-surface">
        <h2 id="movs" className="px-5 pt-4 text-lead font-semibold">
          Movimientos de {formatPeriod(month)}
        </h2>
        {list.length === 0 ? (
          <p className="px-5 pb-5 pt-2 text-ui text-muted">Todavía nada este mes.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {list.map((e) => {
              const transfer = e.kind === "retiro" || e.kind === "aporte";
              const Icon = e.kind === "ingreso" || e.kind === "aporte" ? ArrowDownLeft : ArrowUpRight;
              return (
                <li key={e.id} className="flex items-center gap-3 px-5 py-3" data-kind={e.kind}>
                  <Icon className={cn("size-4 shrink-0", e.kind === "ingreso" || e.kind === "aporte" ? "text-[#2f7a4c]" : "text-muted")} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body text-ink">{e.description}</span>
                    <span className="block text-meta text-muted">
                      {formatDate(e.date, "short")} · {transfer ? TRANSFER_KINDS[e.kind as "retiro" | "aporte"] : categoryName("negocio", null, e.category)}
                      {e.kind === "ingreso" && !e.invoiced ? " · sin facturar" : ""}
                      {e.source === "bitacora" ? " · movido de lo personal" : ""}
                    </span>
                  </span>
                  <span className={cn("num shrink-0 text-body", e.kind === "ingreso" || e.kind === "aporte" ? "text-[#2f7a4c]" : "text-ink")}>
                    {e.kind === "ingreso" || e.kind === "aporte" ? "+" : "−"}
                    {formatMoney(e.amount, e.currency, { decimals: "auto" })}
                  </span>
                  <form action={deleteBoxEntryAction}>
                    {hidden}
                    <input type="hidden" name="id" value={e.id} />
                    <button type="submit" className="h-9 rounded-md px-2 text-meta text-muted hover:text-danger" aria-label={`Borrar ${e.description}`}>
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
          <h2 id="sueldo" className="flex items-center gap-2 text-lead font-semibold">
            <Wallet className="size-5 text-rose-deep" aria-hidden /> Tu sueldo
          </h2>
          <p className="mt-1 text-ui text-muted">El negocio te paga una cifra y esa es la única plata que pasa del negocio a lo personal. Todo lo demás queda en el negocio: así ves de verdad si ganás o perdés.</p>
          {suggestion && (
            <p data-sugerencia className="mt-3 rounded-md border border-line bg-navy-soft px-4 py-2.5 text-ui text-ink">
              {suggestion.average > 0
                ? `Según lo que cargaste, el negocio dejó en promedio ${formatMoney(suggestion.average, "ARS", { decimals: "auto" })} por mes en los últimos meses. Un sueldo de ${formatMoney(suggestion.suggestion, "ARS", { decimals: "auto" })} deja un 30 % en la caja.`
                : `Según lo que cargaste, el negocio no dejó resultado positivo en los últimos meses (promedio ${formatMoney(suggestion.average, "ARS", { decimals: "auto" })}).`}{" "}
              Es un dato, no una recomendación. {NO_REEMPLAZA}
            </p>
          )}
          <form action={setSalaryAction} className="mt-4 grid gap-3 sm:grid-cols-4 sm:items-end">
            {hidden}
            <label>
              <span className={lbl}>Monto</span>
              <input name="amount" inputMode="decimal" required defaultValue={salary ? formatNumber(salary.amount / 100, 2) : suggestion?.suggestion ? formatNumber(suggestion.suggestion / 100, 2) : ""} className={field} />
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
            <label className="flex h-10 items-center gap-2 text-ui">
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
              <input name="amount" inputMode="decimal" required defaultValue={salary ? formatNumber(salary.amount / 100, 2) : ""} className={cn(field, "w-40")} />
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
        <h2 id="aporte" className="flex items-center gap-2 text-lead font-semibold">
          <PiggyBank className="size-5 text-rose-deep" aria-hidden /> Poner plata en el negocio
        </h2>
        <p className="mt-1 text-ui text-muted">Un aporte sale de tu caja personal (queda en la Bitácora) y entra en el negocio. Es el otro movimiento permitido entre cajas.</p>
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

      <p className="flex items-center gap-2 text-meta text-muted">
        <Briefcase className="size-4" aria-hidden /> {NO_REEMPLAZA} Los números son los que cargaste.
      </p>
    </div>
  );
}
