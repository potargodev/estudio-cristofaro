import { Lock } from "lucide-react";
import { SubmitButton } from "@/components/admin/ui";
import { studioActAction } from "@/app/admin/conexiones-actions";
import { money } from "@/modules/bitacora/catalog";
import { BUSINESS_CATEGORIES, categoryName } from "@/modules/cajas/catalog";
import type { liveView } from "@/modules/conexiones/server";
import { fieldInlineClass } from "@/components/ds/primitives";

type View = NonNullable<Awaited<ReturnType<typeof liveView>>>;
const card = "rounded-lg border border-line bg-surface p-5";
const field = fieldInlineClass;

/**
 * La cuenta conectada, en vivo y con el mismo formato para cualquier estudio
 * (principios §4): caja de negocio, lo fiscal y, solo si la persona lo
 * activó, sus cajas personales. Nada se copia al estudio.
 */
export function LiveAccount({ v, volver, canAct }: { v: View; volver: string; canAct: boolean }) {
  const act = canAct && v.level === "total";
  return (
    <div className="grid gap-4">
      {v.level !== "total" && (
        <p className="flex items-center gap-2 rounded-md border border-line bg-navy-soft px-4 py-2.5 text-ui text-ink">
          <Lock className="size-4" aria-hidden /> {v.level === "admision" ? "Admisión: ves el resumen de lo que la persona autorizó. No podés operar hasta que estén conectados." : "En cierre: solo lectura hasta que venza el plazo."}
        </p>
      )}
      <section className={card} aria-labelledby="fiscal">
        <h2 id="fiscal" className="text-lead font-semibold">
          Lo fiscal
        </h2>
        <dl className="mt-2 grid gap-1 text-ui sm:grid-cols-2">
          <div>
            <dt className="text-caption text-muted">CUIT</dt>
            <dd className="num">{v.fiscal.cuit ?? "Sin cargar"}</dd>
          </div>
          <div>
            <dt className="text-caption text-muted">Régimen</dt>
            <dd>{v.fiscal.regime ?? (v.tenantKind === "persona" ? "Sin actividad inscripta" : "—")}</dd>
          </div>
        </dl>
        {v.fiscal.semaforo && <p className="mt-2 text-ui">{v.fiscal.semaforo}</p>}
      </section>

      <section className={card} aria-labelledby="negocio">
        <h2 id="negocio" className="text-lead font-semibold">
          Caja de negocio
        </h2>
        {!v.box || !v.summary ? (
          <p className="mt-1 text-ui text-muted">Todavía no abrió su caja de negocio.</p>
        ) : (
          <>
            <dl className="mt-2 grid grid-cols-2 gap-2 text-ui sm:grid-cols-4">
              {[
                ["Entró", v.summary.income],
                ["Salió", v.summary.expenses],
                ["Resultado", v.summary.result],
                ["Sin facturar", v.summary.uninvoiced],
              ].map(([k, n]) => (
                <div key={k as string} className="rounded-md border border-line p-2">
                  <dt className="text-caption text-muted">{k}</dt>
                  <dd className="num">{money(n as number)}</dd>
                </div>
              ))}
            </dl>
            <ul className="mt-3 divide-y divide-line">
              {v.entries.map((e) => (
                <li key={e.id} className="grid gap-2 py-2.5 text-ui sm:grid-cols-[1fr_auto]" data-movimiento={e.description}>
                  <span className="min-w-0">
                    <span className="block truncate">{e.description}</span>
                    <span className="block text-caption text-muted">
                      {e.date} · {e.kind} · {e.kind === "retiro" ? "Sueldo del dueño" : e.kind === "aporte" ? "Aporte" : categoryName("negocio", null, e.category)}
                      {e.deductible ? " · con comprobante" : ""}
                      {e.kind === "ingreso" ? (e.invoiced ? " · facturado" : " · sin facturar") : ""}
                      {e.source === "contador" ? " · cargado por el estudio" : ""}
                    </span>
                  </span>
                  <span className="flex flex-wrap items-center gap-2 sm:justify-end">
                    <span className="num">{money(e.amount)}</span>
                    {act && (e.kind === "gasto" || e.kind === "ingreso") && (
                      <form action={studioActAction} className="flex flex-wrap items-center gap-1.5">
                        <input type="hidden" name="id" value={v.conn.id} />
                        <input type="hidden" name="op" value="editar_movimiento" />
                        <input type="hidden" name="entry" value={e.id} />
                        <input type="hidden" name="volver" value={volver} />
                        <select name="category" defaultValue={e.category} aria-label={`Categoría de ${e.description}`} className={field}>
                          {BUSINESS_CATEGORIES.filter((c) => c.kind === e.kind).map((c) => (
                            <option key={c.key} value={c.key}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                        {e.kind === "gasto" ? (
                          <label className="flex items-center gap-1 text-caption">
                            <input type="hidden" name="deductible_set" value="1" />
                            <input type="checkbox" name="deductible" defaultChecked={e.deductible} className="size-4 accent-navy" /> Comprobante
                          </label>
                        ) : (
                          <label className="flex items-center gap-1 text-caption">
                            <input type="hidden" name="invoiced_set" value="1" />
                            <input type="checkbox" name="invoiced" defaultChecked={e.invoiced} className="size-4 accent-navy" /> Facturado
                          </label>
                        )}
                        <button className="h-9 rounded-md border border-line px-2 text-caption hover:border-muted">Guardar</button>
                      </form>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
        {act && (
          <form action={studioActAction} className="mt-4 grid gap-2 border-t border-line pt-4 sm:grid-cols-6 sm:items-end">
            <input type="hidden" name="id" value={v.conn.id} />
            <input type="hidden" name="op" value="crear_movimiento" />
            <input type="hidden" name="volver" value={volver} />
            <select name="kind" aria-label="Tipo" className={field}>
              <option value="gasto">Gasto</option>
              <option value="ingreso">Ingreso</option>
            </select>
            <input name="amount" required inputMode="decimal" placeholder="Monto" aria-label="Monto" className={field} />
            <input name="description" required maxLength={160} placeholder="En qué fue" aria-label="En qué fue" className={`${field} sm:col-span-2`} />
            <select name="category" aria-label="Categoría" className={field}>
              {BUSINESS_CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.name}
                </option>
              ))}
            </select>
            <SubmitButton variant="secondary" pendingText="…">Cargar</SubmitButton>
          </form>
        )}
      </section>

      <section className={card} aria-labelledby="personal">
        <h2 id="personal" className="text-lead font-semibold">
          Cajas personales
        </h2>
        {v.personal === null ? (
          <p className="mt-1 flex items-center gap-2 text-ui text-muted">
            <Lock className="size-4" aria-hidden /> No compartidas: la persona no activó este alcance.
          </p>
        ) : v.personal.length === 0 ? (
          <p className="mt-1 text-ui text-muted">Sin movimientos este mes.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line text-ui">
            {v.personal.map((e) => (
              <li key={e.id} className="flex justify-between gap-2 py-2">
                <span className="min-w-0 truncate">{e.description}</span>
                <span className="num shrink-0">
                  {e.kind === "ingreso" ? "+" : "−"}
                  {money(e.amount, e.currency)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
