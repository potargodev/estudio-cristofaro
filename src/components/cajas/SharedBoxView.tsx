import { CheckCircle2, Clock, Scale, Target, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/admin/kit/PageHeader";
import { SubmitButton } from "@/components/admin/ui";
import { Feedback } from "@/components/app/Feedback";
import { addSharedEntryAction, confirmEntryAction, createGoalAction, deleteSharedEntryAction, leaveBoxAction } from "@/app/cajas/actions";
import { cn } from "@/lib/utils";
import { categoryName, templateOf } from "@/modules/cajas/catalog";
import type { Box } from "@/modules/cajas/server";
import { sharedBreakdown, sharedEntries } from "@/modules/cajas/shared";
import { BoxInvite } from "./BoxInvite";
import { fieldClass } from "@/components/ds/primitives";
import { formatDate, formatMoney, todayAR } from "@/lib/format";

const field = `mt-1 ${fieldClass}`;
const lbl = "block text-meta text-muted";
const card = "rounded-lg border border-line bg-surface p-5";

type Me = { id: string; name: string; email: string; studioId: string };

/**
 * Caja compartida (registro compartido, §18): llevar la cuenta juntos. Una
 * carga con dos finales (solo registrar o dividir), confirmación de pago y
 * desglose de quién se hizo cargo de qué, cuánto y cuándo.
 */
export async function SharedBoxView({ me, box, sp }: { me: Me; box: Box; month: string; sp: Record<string, string | undefined> }) {
  const t = templateOf(box.purpose)!;
  const [b, list] = await Promise.all([sharedBreakdown(me, box.id), sharedEntries(me, box.id)]);
  const nameOf = (id: string | null) => (id === me.id ? "Vos" : (b.people.find((p) => p.id === id)?.name ?? "Alguien que ya no está"));
  const myPending = list.filter((e) => (e.status === "pendiente" && e.paid_by === me.id) || (e.mode === "dividir" && e.shares.some((s) => s.user_id === me.id && !s.paid_at)));
  const hidden = (
    <>
      <input type="hidden" name="box" value={box.id} />
    </>
  );
  const others = b.people.filter((p) => p.id !== me.id);
  return (
    <div className="grid gap-6 pb-10 [&>*]:min-w-0">
      <Link href="/cajas" className="text-meta text-muted hover:text-ink">
        ← Mis cajas
      </Link>
      <PageHeader title={box.name} description={`${t.description} ${t.breakdown}`} className="mb-0" />
      <Feedback sp={sp} />

      <section aria-labelledby="gente" className={card}>
        <h2 id="gente" className="flex items-center gap-2 text-lead font-semibold">
          <Users className="size-5 text-rose-deep" aria-hidden /> Quiénes están
        </h2>
        <p className="mt-1 text-ui text-ink">{b.people.map((p) => (p.id === me.id ? `${p.name} (vos)` : p.name)).join(" · ")}</p>
        <p className="mt-1 text-meta text-muted">Pueden sumarse: {t.who.toLowerCase()}. Solo ven esta caja: nada de sus cajas personales.</p>
        <div className="mt-3">
          <BoxInvite boxId={box.id} boxName={box.name} owner={box.owner_id === me.id} />
        </div>
      </section>

      {myPending.length > 0 && (
        <section aria-labelledby="confirmar" className="rounded-lg border border-rose/40 bg-rose-soft p-5">
          <h2 id="confirmar" className="flex items-center gap-2 text-lead font-semibold text-ink">
            <Clock className="size-5 text-rose-deep" aria-hidden /> Para confirmar
          </h2>
          <p className="mt-1 text-ui text-muted">No cuenta en tu seguimiento hasta que confirmes que lo pagaste.</p>
          <ul className="mt-3 divide-y divide-line">
            {myPending.map((e) => {
              const share = e.shares.find((s) => s.user_id === me.id && !s.paid_at);
              const what = e.status === "pendiente" && e.paid_by === me.id ? "carga" : "parte";
              return (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <span className="min-w-0 text-ui">
                    {what === "carga" ? `${nameOf(e.created_by)} cargó que pagaste ${e.description}: ${formatMoney(e.amount, "ARS", { decimals: "auto" })}` : `Tu parte de ${e.description} (pagó ${nameOf(e.paid_by)}): ${formatMoney(share!.amount, "ARS", { decimals: "auto" })}`}
                  </span>
                  <form action={confirmEntryAction}>
                    {hidden}
                    <input type="hidden" name="id" value={e.id} />
                    <input type="hidden" name="what" value={what} />
                    <SubmitButton variant="secondary" pendingText="…">{what === "carga" ? "Sí, lo pagué" : "Ya la pagué"}</SubmitButton>
                  </form>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section aria-labelledby="cargar" className={card}>
        <h2 id="cargar" className="text-lead font-semibold">
          Cargar
        </h2>
        <form action={addSharedEntryAction} className="mt-3 grid gap-3 sm:grid-cols-2">
          {hidden}
          <fieldset className="flex flex-wrap gap-4 sm:col-span-2">
            <legend className="sr-only">Qué es</legend>
            <label className="flex items-center gap-2 text-ui">
              <input type="radio" name="kind" value="gasto" defaultChecked className="size-4 accent-navy" /> Gasto
            </label>
            <label className="flex items-center gap-2 text-ui">
              <input type="radio" name="kind" value="ahorro" className="size-4 accent-navy" /> Ahorro
            </label>
            {box.purpose === "negocio" && (
              <label className="flex items-center gap-2 text-ui">
                <input type="radio" name="kind" value="ingreso" className="size-4 accent-navy" /> Ingreso
              </label>
            )}
          </fieldset>
          <label>
            <span className={lbl}>Monto</span>
            <input name="amount" inputMode="decimal" required placeholder="Ej.: 3.000" className={field} />
          </label>
          <label>
            <span className={lbl}>En qué fue</span>
            <input name="description" maxLength={160} placeholder="Ej.: Cena" className={field} />
          </label>
          <label>
            <span className={lbl}>Categoría</span>
            <select name="category" className={field}>
              {t.categories
                .filter((c) => c.kind !== "ahorro")
                .map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            <span className={lbl}>Pagó</span>
            <select name="paid_by" defaultValue={me.id} className={field}>
              {b.people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.id === me.id ? "Yo" : p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className={lbl}>Fecha</span>
            <input name="date" type="date" defaultValue={todayAR()} className={field} />
          </label>
          {b.goals.length > 0 && (
            <label>
              <span className={lbl}>Meta (si es un ahorro)</span>
              <select name="goal" className={field}>
                <option value="">—</option>
                {b.goals.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <fieldset className="grid gap-2 rounded-md border border-line p-3 sm:col-span-2">
            <legend className="px-1 text-meta text-muted">¿Cómo queda?</legend>
            <label className="flex items-start gap-2 text-ui">
              <input type="radio" name="final" value="registrar" defaultChecked={t.defaultMode === "registrar"} className="mt-0.5 size-4 accent-navy" />
              <span>
                <strong className="font-medium">Solo registrar</strong>
                <span className="block text-meta text-muted">Queda que lo puso quien pagó. Nadie le debe nada.</span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-ui">
              <input type="radio" name="final" value="dividir" defaultChecked={t.defaultMode === "dividir"} className="mt-0.5 size-4 accent-navy" />
              <span>
                <strong className="font-medium">Dividir</strong>
                <span className="block text-meta text-muted">Se reparte en partes iguales y cada parte queda pendiente hasta que quien la debe confirme que la pagó.</span>
              </span>
            </label>
            {others.length > 0 && (
              <div className="flex flex-wrap gap-3 pl-6 text-meta">
                <span className="text-muted">Dividir entre:</span>
                {b.people.map((p) => (
                  <label key={p.id} className="flex items-center gap-1.5">
                    <input type="checkbox" name="split" value={p.id} defaultChecked className="size-4 accent-navy" /> {p.id === me.id ? "Yo" : p.name}
                  </label>
                ))}
              </div>
            )}
          </fieldset>
          <label className="flex items-center gap-2 text-ui sm:col-span-2">
            <input type="checkbox" name="personal" defaultChecked className="size-4 accent-navy" /> Si lo pagué yo, que también quede en mi caja personal (una sola carga: si se divide, va mi parte)
          </label>
          <div className="sm:col-span-2">
            <SubmitButton pendingText="Cargando…">Cargar</SubmitButton>
          </div>
        </form>
      </section>

      <section aria-labelledby="desglose" className={card}>
        <h2 id="desglose" className="flex items-center gap-2 text-lead font-semibold">
          <Scale className="size-5 text-rose-deep" aria-hidden /> Quién puso qué
        </h2>
        <p data-parejos={b.even ? "si" : "no"} className={cn("mt-2 flex items-center gap-2 text-body font-medium", b.even ? "text-[#1f5f36]" : "text-ink")}>
          {b.even ? <CheckCircle2 className="size-5" aria-hidden /> : <Scale className="size-5" aria-hidden />}
          {b.total === 0 ? "Todavía no hay nada confirmado." : b.even ? "Están parejos." : "Todavía no están parejos."}
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[30rem] text-ui">
            <thead className="text-left text-caption text-muted">
              <tr>
                <th className="py-1.5 pr-2 font-normal">Persona</th>
                <th className="py-1.5 pr-2 text-right font-normal">Puso</th>
                <th className="py-1.5 pr-2 text-right font-normal">Debe</th>
                <th className="py-1.5 pr-2 text-right font-normal">Sin confirmar</th>
                <th className="py-1.5 text-right font-normal">Contra lo parejo</th>
              </tr>
            </thead>
            <tbody>
              {b.members.map((m) => (
                <tr key={m.userId} className="border-t border-line" data-persona={m.name}>
                  <td className="py-2 pr-2">{m.userId === me.id ? `${m.name} (vos)` : m.name}</td>
                  <td className="num py-2 pr-2 text-right">{formatMoney(m.put, "ARS", { decimals: "auto" })}</td>
                  <td className="num py-2 pr-2 text-right">{m.owes ? formatMoney(m.owes, "ARS", { decimals: "auto" }) : "—"}</td>
                  <td className="num py-2 pr-2 text-right">{m.pendingConfirm ? formatMoney(m.pendingConfirm, "ARS", { decimals: "auto" }) : "—"}</td>
                  <td className={cn("num py-2 text-right", m.diff > 0 ? "text-[#1f5f36]" : m.diff < 0 ? "text-danger" : "")}>{m.diff === 0 ? "—" : `${m.diff > 0 ? "+" : "−"}${formatMoney(Math.abs(m.diff), "ARS", { decimals: "auto" })}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {b.debts.length > 0 && (
          <ul className="mt-3 grid gap-1 text-ui" aria-label="Quién le debe a quién">
            {b.debts.map((d) => (
              <li key={`${d.from}-${d.to}`} data-deuda>
                {d.from === me.id ? "Vos le debés" : `${d.fromName} le debe`} {formatMoney(d.amount, "ARS", { decimals: "auto" })} a {d.to === me.id ? "vos" : d.toName} <span className="text-muted">(pendiente hasta que confirme que pagó)</span>
              </li>
            ))}
          </ul>
        )}
        {b.byCategory.length > 0 && (
          <p className="mt-3 text-meta text-muted">
            En qué se fue: {b.byCategory.map((c) => `${c.name} ${formatMoney(c.amount, "ARS", { decimals: "auto" })}`).join(" · ")}
          </p>
        )}
      </section>

      <section aria-labelledby="metas" className={card}>
        <h2 id="metas" className="flex items-center gap-2 text-lead font-semibold">
          <Target className="size-5 text-rose-deep" aria-hidden /> Metas de ahorro
        </h2>
        {b.goals.length === 0 ? (
          <p className="mt-1 text-ui text-muted">Ahorren juntos para algo: un viaje, el auto, la facultad, los quince.</p>
        ) : (
          <ul className="mt-3 grid gap-3">
            {b.goals.map((g) => (
              <li key={g.id}>
                <p className="flex justify-between gap-2 text-ui">
                  <span className="font-medium">{g.name}</span>
                  <span className="num">
                    {formatMoney(g.saved, "ARS", { decimals: "auto" })} de {formatMoney(g.target, "ARS", { decimals: "auto" })}
                  </span>
                </p>
                <div className="mt-1 h-2 rounded-full bg-canvas" role="progressbar" aria-valuenow={g.pct} aria-valuemin={0} aria-valuemax={100} aria-label={`Meta ${g.name}`}>
                  <div className="h-2 rounded-full bg-navy" style={{ width: `${g.pct}%` }} />
                </div>
                {g.byMember.length > 0 && <p className="mt-1 text-meta text-muted">{g.byMember.map((x) => `${x.userId === me.id ? "Vos" : x.name} ${formatMoney(x.amount, "ARS", { decimals: "auto" })}`).join(" · ")}</p>}
              </li>
            ))}
          </ul>
        )}
        <form action={createGoalAction} className="mt-4 flex flex-wrap items-end gap-3 border-t border-line pt-4">
          {hidden}
          <label className="min-w-0 flex-1">
            <span className={lbl}>Meta nueva</span>
            <input name="name" required maxLength={80} placeholder="Ej.: Vacaciones" className={field} />
          </label>
          <label>
            <span className={lbl}>Objetivo</span>
            <input name="target" inputMode="decimal" required className={cn(field, "w-36")} />
          </label>
          <SubmitButton variant="secondary" pendingText="…">Crear meta</SubmitButton>
        </form>
      </section>

      <section aria-labelledby="movs" className="rounded-lg border border-line bg-surface">
        <h2 id="movs" className="px-5 pt-4 text-lead font-semibold">
          Movimientos
        </h2>
        {list.length === 0 ? (
          <p className="px-5 pb-5 pt-2 text-ui text-muted">Todavía nada. Cargá lo primero arriba.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {list.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-3 px-5 py-3" data-movimiento={e.description}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body text-ink">{e.description}</span>
                  <span className="block text-meta text-muted">
                    {formatDate(e.date, "short")} · pagó {nameOf(e.paid_by)} · {e.kind === "ahorro" ? "Ahorro" : categoryName("compartida", box.purpose, e.category)} · {e.mode === "dividir" ? "dividido" : "solo registrado"}
                    {e.status === "pendiente" ? " · sin confirmar" : ""}
                    {e.mode === "dividir" && e.shares.some((s) => !s.paid_at) ? ` · partes pendientes: ${e.shares.filter((s) => !s.paid_at).map((s) => `${nameOf(s.user_id)} ${formatMoney(s.amount, "ARS", { decimals: "auto" })}`).join(", ")}` : ""}
                  </span>
                </span>
                <span className="num shrink-0 text-body">{formatMoney(e.amount, "ARS", { decimals: "auto" })}</span>
                {e.created_by === me.id && (
                  <form action={deleteSharedEntryAction}>
                    {hidden}
                    <input type="hidden" name="id" value={e.id} />
                    <button type="submit" className="h-9 rounded-md px-2 text-meta text-muted hover:text-danger" aria-label={`Borrar ${e.description}`}>
                      Borrar
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {box.owner_id !== me.id && (
        <form action={leaveBoxAction}>
          {hidden}
          <button type="submit" className="inline-flex h-10 items-center gap-2 rounded-md border border-line px-4 text-ui text-muted hover:text-danger">
            <UserPlus className="size-4 rotate-180" aria-hidden /> Salir de la caja
          </button>
        </form>
      )}
    </div>
  );
}
