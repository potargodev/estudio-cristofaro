import { Plus } from "lucide-react";
import Link from "next/link";
import { BalanceLine, GroupDot } from "@/components/gastos/Money";
import { GROUP_TYPES, formatMoney, type GroupType } from "@/modules/gastos/constants";
import { requireGastos } from "@/modules/gastos/server/actor";
import { listGroups } from "@/modules/gastos/server/service";

export const metadata = { title: "Tus grupos" };

export default async function GastosHome() {
  const actor = await requireGastos();
  const groups = await listGroups(actor);
  // Totales por moneda: lo que te deben y lo que debés
  const totals: Record<string, { owed: number; owe: number }> = {};
  for (const g of groups)
    for (const [cur, v] of Object.entries(g.mine)) {
      totals[cur] ??= { owed: 0, owe: 0 };
      if (v > 0) totals[cur].owed += v;
      else totals[cur].owe += -v;
    }
  const currencies = Object.keys(totals).sort((a, b) => (a === "ARS" ? -1 : b === "ARS" ? 1 : a.localeCompare(b)));

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[clamp(2.1rem,6vw,3rem)] leading-none">Gastos compartidos</h1>
          <p className="mt-2 text-muted">{actor.kind === "guest" ? `Hola, ${actor.name}. Este es el grupo al que te invitaron.` : "Quién pagó qué, cuánto debe cada uno y cómo saldarlo."}</p>
        </div>
        {actor.kind === "user" && (
          <Link href="/gastos/nuevo" className="inline-flex h-11 items-center gap-2 bg-navy px-4 text-paper hover:bg-navy-deep">
            <Plus className="size-4" aria-hidden />
            Nuevo grupo
          </Link>
        )}
      </div>

      <section aria-label="Tu saldo total" className="mt-6 grid gap-3 sm:grid-cols-2">
        <div className="border border-line bg-surface p-5">
          <p className="text-[13px] text-muted">Te deben</p>
          <p className="mt-1 font-display text-3xl tabular-nums text-[#24583a]">{currencies.length ? currencies.filter((c) => totals[c].owed).map((c) => formatMoney(totals[c].owed, c)).join(" · ") || formatMoney(0) : formatMoney(0)}</p>
        </div>
        <div className="border border-line bg-surface p-5">
          <p className="text-[13px] text-muted">Debés</p>
          <p className="mt-1 font-display text-3xl tabular-nums text-rose-deep">{currencies.length ? currencies.filter((c) => totals[c].owe).map((c) => formatMoney(totals[c].owe, c)).join(" · ") || formatMoney(0) : formatMoney(0)}</p>
        </div>
      </section>

      <h2 className="mt-10 text-[13px] font-medium uppercase tracking-[0.14em] text-muted">Tus grupos</h2>
      {groups.length === 0 ? (
        <div className="mt-4 border border-dashed border-line bg-surface px-6 py-12 text-center">
          <p className="font-display text-2xl">Todavía no tenés grupos</p>
          <p className="mx-auto mt-2 max-w-sm text-muted">Armá uno para un viaje, la oficina, un proyecto o tus socios, y sumá a las personas (aunque no tengan cuenta).</p>
          {actor.kind === "user" && (
            <Link href="/gastos/nuevo" className="mt-6 inline-flex h-11 items-center gap-2 bg-navy px-5 text-paper hover:bg-navy-deep">
              <Plus className="size-4" aria-hidden />
              Crear el primer grupo
            </Link>
          )}
        </div>
      ) : (
        <ul className="mt-3 divide-y divide-line border-y border-line">
          {groups.map((g) => {
            const curs = Object.keys(g.mine);
            return (
              <li key={g.id}>
                <Link href={`/gastos/g/${g.id}`} className="flex items-center gap-4 px-1 py-4 transition-colors hover:bg-navy-soft/50">
                  <GroupDot color={g.color} name={g.name} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[16px] font-medium">{g.name}</span>
                    <span className="block text-[13px] text-muted">
                      {GROUP_TYPES[g.type as GroupType] ?? g.type} · {g.members} {g.members === 1 ? "persona" : "personas"}
                    </span>
                  </span>
                  <span className="text-right text-[14px]">
                    {curs.length === 0 ? (
                      <BalanceLine cents={0} currency={g.baseCurrency} />
                    ) : (
                      curs.map((c) => (
                        <BalanceLine key={c} cents={g.mine[c]} currency={c} className="block" />
                      ))
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
