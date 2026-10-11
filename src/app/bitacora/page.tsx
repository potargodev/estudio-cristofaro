import { ArrowDownLeft, ArrowUpRight, ChevronLeft, ChevronRight, Download, Settings2, Users, WandSparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EntryForm } from "@/components/bitacora/EntryForm";
import { cn } from "@/lib/utils";
import { isMonth, money, monthLabel, monthOf, PAYMENT_METHODS, prevMonth } from "@/modules/bitacora/catalog";
import { listCategories, monthSummary } from "@/modules/bitacora/server";
import { ipcFactor, mepFor } from "@/modules/bitacora/planning";
import { listInsights } from "@/modules/bitacora/recurring";
import { Insights } from "@/components/bitacora/Insights";
import { requireUser } from "@/modules/bitacora/session";
import { mySharedBoxes } from "@/modules/cajas/shared";
import { createEntryAction, restoreEntryAction } from "./actions";

export const metadata: Metadata = { title: { absolute: "Bitácora · Faro" } };

const nextMonth = (m: string) => {
  const [y, mm] = m.split("-").map(Number);
  return mm === 12 ? `${y + 1}-01` : `${y}-${String(mm + 1).padStart(2, "0")}`;
};
const day = (iso: string) => new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));

function Delta({ now, before }: { now: number; before: number }) {
  if (!before) return <span className="text-[12px] text-muted">Sin datos del mes anterior</span>;
  const pct = Math.round(((now - before) / before) * 100);
  return (
    <span className={cn("text-[12px]", pct > 0 ? "text-danger" : "text-[#2f7a4c]")}>
      {pct > 0 ? "+" : ""}
      {pct}% vs. mes anterior
    </span>
  );
}

/** Bitácora: tus finanzas del mes. Privada: solo la ves vos */
export default async function BitacoraPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const me = await requireUser();
  const month = isMonth(sp.mes) ? sp.mes! : monthOf();
  const [cats, shared] = await Promise.all([listCategories(me.id), mySharedBoxes(me.id)]);
  const cat = sp.categoria && cats.some((c) => c.id === sp.categoria) ? sp.categoria : null;
  const [s, insights, factor, mep] = await Promise.all([monthSummary(me.id, month, cat), listInsights(me.id, 4), sp.ver === "real" ? ipcFactor(month) : null, sp.ver === "mep" ? mepFor(month) : null]);
  // Valores reales (IPC de Faro Manager) o en dólares MEP
  const show = (c: number) => (sp.ver === "real" && factor ? money(factor.apply(c) ?? c) : sp.ver === "mep" && mep ? money(Math.round(c / mep.rate), "USD") : money(c));
  const valueNote =
    sp.ver === "real"
      ? factor
        ? `En pesos de ${monthLabel(factor.latestMonth)} según el IPC (${factor.source}).`
        : "Todavía no hay serie de IPC cargada para ese mes: se muestran pesos corrientes."
      : sp.ver === "mep"
        ? mep
          ? `A ${money(Math.round(mep.rate * 100))} por dólar · ${mep.source}.`
          : "No pudimos obtener la cotización del dólar MEP."
        : null;
  const ars = s.byCurrency.ARS;
  const usd = s.byCurrency.USD;
  const maxCat = Math.max(1, ...s.byCategory.map((c) => c.amount));
  const q = (extra: Record<string, string | null>) => {
    const p = new URLSearchParams({ mes: month, ...(cat ? { categoria: cat } : {}), ...(sp.ver ? { ver: sp.ver } : {}) });
    for (const [k, v] of Object.entries(extra)) (v === null ? p.delete(k) : p.set(k, v));
    return `/bitacora?${p.toString()}`;
  };
  return (
    <div className="grid gap-6 pb-6">
      {sp.ok && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-navy-soft px-4 py-2.5 text-[14px]">
          {sp.ok}
          {sp.deshacer && (
            <form action={restoreEntryAction}>
              <input type="hidden" name="id" value={sp.deshacer} />
              <input type="hidden" name="mes" value={month} />
              <button type="submit" className="font-medium underline underline-offset-4">
                Deshacer
              </button>
            </form>
          )}
        </div>
      )}
      {sp.error && (
        <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 px-4 py-2.5 text-[14px] text-danger">
          {sp.error}
        </p>
      )}
      <Insights items={insights} volver="/bitacora" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <nav aria-label="Ver los montos en" className="flex gap-1.5 text-[13px]">
          {[
            { k: "", l: "Pesos" },
            { k: "real", l: "Ajustado por inflación" },
            { k: "mep", l: "Dólares MEP" },
          ].map((v) => (
            <Link key={v.l} href={q({ ver: v.k || null })} aria-current={(sp.ver ?? "") === v.k ? "true" : undefined} className={cn("inline-flex h-8 items-center rounded-full px-3", (sp.ver ?? "") === v.k ? "bg-navy text-paper" : "border border-line text-ink hover:border-muted")}>
              {v.l}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-1">
          <Link href={q({ mes: prevMonth(month) })} aria-label="Mes anterior" className="grid size-9 place-items-center rounded-md border border-line bg-surface hover:border-muted">
            <ChevronLeft className="size-4" aria-hidden />
          </Link>
          <span className="min-w-36 text-center text-[15px] font-medium capitalize">{monthLabel(month)}</span>
          <Link href={q({ mes: nextMonth(month) })} aria-label="Mes siguiente" className="grid size-9 place-items-center rounded-md border border-line bg-surface hover:border-muted">
            <ChevronRight className="size-4" aria-hidden />
          </Link>
        </div>
      </div>
      {valueNote && <p className="-mt-3 text-[12px] text-muted">{valueNote}</p>}

      <section aria-label="Resumen del mes" className="grid grid-cols-3 gap-2 sm:gap-3">
        {[
          { l: "Entró", v: ars.now.in, b: ars.before.in, tone: "text-[#2f7a4c]" },
          { l: "Salió", v: ars.now.out, b: ars.before.out, tone: "text-ink" },
          { l: "Queda", v: ars.now.left, b: null, tone: ars.now.left < 0 ? "text-danger" : "text-ink" },
        ].map((x) => (
          <div key={x.l} className="rounded-lg border border-line bg-surface p-3 sm:p-5">
            <p className="text-[12px] text-muted sm:text-[13px]">{x.l}</p>
            <p className={cn("mt-1 num text-[20px] leading-tight sm:text-[32px]", x.tone)}>{show(x.v)}</p>
            {x.b !== null && (
              <span className="hidden sm:block">
                <Delta now={x.v} before={x.b} />
              </span>
            )}
          </div>
        ))}
      </section>
      <p className="-mt-3 text-[13px] text-muted sm:hidden">
        <Delta now={ars.now.out} before={ars.before.out} /> en gastos
      </p>
      {usd && (usd.now.in > 0 || usd.now.out > 0) && (
        <p className="-mt-2 text-[13px] text-muted">
          En dólares: entró {money(usd.now.in, "USD")} · salió {money(usd.now.out, "USD")} · queda {money(usd.now.left, "USD")}
        </p>
      )}

      <details data-tour="bitacora-cargar" className="rounded-lg border border-line bg-surface" open={!!sp.cargar}>
        <summary className="flex cursor-pointer items-center justify-between gap-3 px-5 py-4 text-[16px] font-semibold">
          Cargar a mano
          <span className="text-[13px] font-normal text-muted">
            o mandáselo al{" "}
            <Link href="/vigia" className="font-medium text-rose-deep underline underline-offset-4">
              Vigía
            </Link>
          </span>
        </summary>
        <div className="border-t border-line p-5">
          <EntryForm action={createEntryAction} categories={cats} hidden={{ mes: month }} submit="Cargar" boxes={shared} />
        </div>
      </details>

      <section aria-labelledby="por-categoria" className="rounded-lg border border-line bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="por-categoria" className="text-[17px] font-semibold">
            Gasto por categoría
          </h2>
          <form method="get" className="flex items-center gap-2">
            <input type="hidden" name="mes" value={month} />
            <label htmlFor="cat" className="sr-only">
              Filtrar por categoría
            </label>
            <select id="cat" name="categoria" defaultValue={cat ?? ""} className="h-9 rounded-md border border-line bg-surface px-2 text-[14px]">
              <option value="">Todas</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button type="submit" className="h-9 rounded-md border border-line px-3 text-[13px] hover:border-muted">
              Filtrar
            </button>
          </form>
        </div>
        {s.byCategory.length === 0 ? (
          <p className="mt-3 text-[14px] text-muted">Todavía no hay gastos este mes.</p>
        ) : (
          <ul className="mt-4 grid gap-3">
            {s.byCategory.map((c) => (
              <li key={c.categoryId ?? "none"}>
                <div className="flex justify-between gap-3 text-[14px]">
                  <Link href={q({ categoria: c.categoryId })} className="hover:underline">
                    {c.name}
                  </Link>
                  <span className="tabular-nums">{money(c.amount)}</span>
                </div>
                <div className="mt-1 h-2 rounded bg-navy-soft">
                  <div className="gastos-bar h-full rounded bg-navy" style={{ width: `${(c.amount / maxCat) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="movimientos" className="rounded-lg border border-line bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4">
          <h2 id="movimientos" className="text-[17px] font-semibold">
            Movimientos
          </h2>
          <div className="flex gap-2">
            <Link href="/bitacora/categorias" data-tour="bitacora-categorias" className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line px-3 text-[13px] hover:border-muted">
              <Settings2 className="size-4" aria-hidden /> Categorías
            </Link>
            <a href={`/api/bitacora/csv?mes=${month}${cat ? `&categoria=${cat}` : ""}`} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line px-3 text-[13px] hover:border-muted">
              <Download className="size-4" aria-hidden /> CSV
            </a>
          </div>
        </div>
        {s.movements.length === 0 ? (
          <p className="border-t border-line px-5 py-4 text-[14px] text-muted">Sin movimientos en {monthLabel(month)}.</p>
        ) : (
          <ul className="divide-y divide-line border-t border-line">
            {s.movements.map((m) => {
              const href = m.source === "grupo" ? `/grupos/g/${m.group!.id}` : `/bitacora/${m.id}?mes=${month}`;
              return (
                <li key={m.id}>
                  <Link href={href} className={cn("flex items-center gap-3 px-5 py-3 hover:bg-canvas", sp.nuevo === m.id && "bg-navy-soft")}>
                    <span className={cn("grid size-9 shrink-0 place-items-center rounded-md", m.kind === "ingreso" ? "bg-[#e3f1e8] text-[#2f7a4c]" : "bg-navy text-gold")}>
                      {m.source === "grupo" ? <Users className="size-4" aria-hidden /> : m.kind === "ingreso" ? <ArrowDownLeft className="size-4" aria-hidden /> : <ArrowUpRight className="size-4" aria-hidden />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 truncate text-[15px] text-ink">
                        {m.description}
                        {m.source === "copiloto" && <WandSparkles className="size-3.5 shrink-0 text-rose-deep" aria-label="Cargado por el Vigía" />}
                      </span>
                      <span className="block truncate text-[12px] text-muted">
                        {m.source === "grupo" ? `Mi parte · ${m.group!.name}` : m.categoryName} · {day(m.date)}
                        {m.paymentMethod && ` · ${PAYMENT_METHODS[m.paymentMethod as keyof typeof PAYMENT_METHODS]}`}
                      </span>
                    </span>
                    <span className={cn("shrink-0 tabular-nums text-[15px]", m.kind === "ingreso" ? "text-[#2f7a4c]" : "text-ink")}>
                      {m.kind === "ingreso" ? "+" : "−"}
                      {money(m.amount, m.currency)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <p className="text-[12px] text-muted">Los gastos de tus grupos cuentan acá como «mi parte» (lo que te toca), sin duplicarse.</p>
    </div>
  );
}
