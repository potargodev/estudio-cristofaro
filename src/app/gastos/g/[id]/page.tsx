import { ArrowRightLeft, Download, Paperclip, Plus, Repeat } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Notice } from "@/components/admin/AdminField";
import { CategoryChart, MonthChart } from "@/components/gastos/Charts";
import { BalanceLine, GroupDot } from "@/components/gastos/Money";
import { CopyButton, InviteForm, MeForm, PartnerForm, RenewLinkForm, SettingsForm } from "@/components/gastos/forms";
import { cn } from "@/lib/utils";
import { GROUP_TYPES, SETTLEMENT_METHODS, categoryName, formatMoney, type GroupType } from "@/modules/gastos/constants";
import { requireGastos } from "@/modules/gastos/server/actor";
import { GastosError, getGroupView } from "@/modules/gastos/server/service";
import { answerSettlementAction, archiveGroupAction, removeMemberAction, toggleSimplifyAction } from "../../actions";

export const metadata = { title: "Grupo" };

const TABS = [
  { key: "actividad", label: "Actividad" },
  { key: "saldos", label: "Saldos" },
  { key: "graficos", label: "Gráficos" },
  { key: "integrantes", label: "Integrantes" },
] as const;

const SAVED: Record<string, string> = { gasto: "Gasto guardado.", pago: "Pago registrado. Cuando la otra persona lo confirme, queda confirmado.", borrado: "Gasto borrado." };

const when = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires" });
const day = (d: string) => new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));

export default async function GroupPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; guardado?: string; error?: string; nuevo?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const actor = await requireGastos();
  let v;
  try {
    v = await getGroupView(actor, id);
  } catch (e) {
    if (e instanceof GastosError) notFound();
    throw e;
  }
  const { group, me } = v;
  const isSocios = group.type === "socios";
  const tabs = [...TABS, ...(isSocios ? [{ key: "socios", label: "Socios" } as const] : []), ...(me.role === "admin" ? [{ key: "ajustes", label: "Ajustes" } as const] : [])];
  const tab = tabs.some((t) => t.key === sp.tab) ? sp.tab! : "actividad";
  const name = (mid: string | null) => v.allMembers.find((m) => m.id === mid)?.name ?? "Alguien";
  const myCurrencies = Object.entries(v.balances).filter(([, b]) => b[me.id]);
  const pendingForMe = v.settlements.filter((s) => s.status === "informado" && ((s.to_member === me.id && !s.confirmed_by_to) || (s.from_member === me.id && !s.confirmed_by_from)));
  const href = (t: string) => `/gastos/g/${group.id}${t === "actividad" ? "" : `?tab=${t}`}`;

  return (
    <>
      {sp.guardado && SAVED[sp.guardado] && <Notice>{SAVED[sp.guardado]}</Notice>}
      {sp.error && <Notice tone="error">{sp.error.slice(0, 200)}</Notice>}
      <Link href="/gastos" className="text-[14px] text-rose-deep underline-offset-4 hover:underline">
        ← Tus grupos
      </Link>

      <header className="mt-4 flex items-start gap-4">
        <GroupDot color={group.color} name={group.name} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-[clamp(1.9rem,6vw,2.7rem)] leading-[1.05]">{group.name}</h1>
          <p className="mt-1 text-[14px] text-muted">
            {GROUP_TYPES[group.type as GroupType]} · {v.members.length} {v.members.length === 1 ? "persona" : "personas"} · en {group.base_currency}
            {v.organizationName && <> · Contabilidad de {v.organizationName}</>}
            {group.context_tenant && <> · Conectado a tus gastos de la actividad</>}
          </p>
        </div>
      </header>

      <section aria-label="Tu saldo" className="mt-5 border border-line bg-surface p-5">
        <p className="text-[13px] text-muted">Tu saldo en este grupo</p>
        <p className="mt-1 font-display text-[30px] leading-tight">
          {myCurrencies.length === 0 ? <span className="text-muted">Estás al día</span> : myCurrencies.map(([cur, b]) => <BalanceLine key={cur} cents={b[me.id]} currency={cur} className="block" />)}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:flex">
          <Link href={`/gastos/g/${group.id}/gasto`} className="col-span-2 inline-flex h-14 items-center justify-center gap-2 bg-navy px-6 text-[17px] text-paper hover:bg-navy-deep sm:h-12 sm:text-[16px]">
            <Plus className="size-5" aria-hidden />
            Agregar gasto
          </Link>
          <Link href={`/gastos/g/${group.id}/saldar`} className="inline-flex h-12 items-center justify-center gap-2 border border-navy/30 px-5 text-navy hover:bg-navy-soft">
            <ArrowRightLeft className="size-4" aria-hidden />
            Saldar
          </Link>
          <details className="relative">
            <summary className="inline-flex h-12 w-full cursor-pointer list-none items-center justify-center gap-2 border border-navy/30 px-5 text-navy hover:bg-navy-soft">
              <Download className="size-4" aria-hidden />
              Exportar
            </summary>
            <div className="absolute right-0 z-10 mt-1 grid min-w-44 border border-line bg-surface py-1 shadow-lg">
              {[
                ["csv", "CSV"],
                ["xlsx", "Excel (XLSX)"],
                ["pdf", "Resumen en PDF"],
              ].map(([f, l]) => (
                <a key={f} href={`/api/gastos/exportar/${group.id}?formato=${f}`} className="px-4 py-2.5 text-[14px] hover:bg-navy-soft">
                  {l}
                </a>
              ))}
            </div>
          </details>
        </div>
      </section>

      {pendingForMe.length > 0 && (
        <section aria-label="Pagos para confirmar" className="mt-4 grid gap-2">
          {pendingForMe.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-3 border border-gold/60 bg-[#fbf7ee] p-4">
              <p className="min-w-0 flex-1 text-[14px]">
                {s.created_by === me.id ? "Esperando que confirmen" : `${name(s.created_by)} informó`}: <strong>{name(s.from_member)}</strong> le pagó <strong className="tabular-nums">{formatMoney(s.amount, s.currency)}</strong> a <strong>{name(s.to_member)}</strong> ({SETTLEMENT_METHODS[s.method]}).
              </p>
              <form action={answerSettlementAction} className="flex gap-2">
                <input type="hidden" name="group" value={group.id} />
                <input type="hidden" name="settlement" value={s.id} />
                <button name="accept" value="1" className="h-10 bg-navy px-4 text-[14px] text-paper hover:bg-navy-deep">
                  Confirmar
                </button>
                <button name="accept" value="0" className="h-10 border border-line px-4 text-[14px] hover:bg-navy-soft">
                  Rechazar
                </button>
              </form>
            </div>
          ))}
        </section>
      )}

      <nav aria-label="Secciones del grupo" className="-mx-4 mt-8 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0">
        <ul className="flex min-w-max gap-1">
          {tabs.map((t) => (
            <li key={t.key}>
              <Link href={href(t.key)} aria-current={tab === t.key ? "page" : undefined} className={cn("block border-b-2 px-3 py-3 text-[15px]", tab === t.key ? "border-navy font-medium text-ink" : "border-transparent text-muted hover:text-ink")}>
                {t.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-6">
        {tab === "actividad" && (
          <>
            {v.expenses.length === 0 && v.activity.length <= 1 && (
              <div className="border border-dashed border-line bg-surface px-6 py-10 text-center">
                <p className="font-display text-2xl">{sp.nuevo ? "¡Listo el grupo!" : "Sin gastos todavía"}</p>
                <p className="mx-auto mt-2 max-w-sm text-muted">Sumá a las personas en Integrantes y cargá el primer gasto.</p>
              </div>
            )}
            <ol className="grid">
              {v.activity.map((a) => {
                const e = a.expense_id ? v.expenses.find((x) => x.id === a.expense_id) : null;
                const body = (
                  <>
                    <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", a.kind.startsWith("pago") ? "bg-gold" : a.kind === "gasto" ? "bg-navy" : "bg-line")} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px]">{a.text}</span>
                      <span className="block text-[12px] text-muted">
                        {when.format(a.created_at)}
                        {e && (
                          <>
                            {" · "}
                            {categoryName(e.category)}
                            {e.shares[me.id] ? ` · tu parte ${formatMoney(e.shares[me.id], e.currency)}` : ""}
                          </>
                        )}
                      </span>
                    </span>
                    {e?.receipt_path && <Paperclip className="mt-1 size-4 text-muted" aria-label="Con comprobante" />}
                    {e?.recurrence && <Repeat className="mt-1 size-4 text-muted" aria-label="Se repite" />}
                  </>
                );
                return (
                  <li key={a.id} className="border-b border-line last:border-0">
                    {e ? (
                      <Link href={`/gastos/g/${group.id}/gasto/${e.id}`} className="flex gap-3 px-1 py-3.5 hover:bg-navy-soft/50">
                        {body}
                      </Link>
                    ) : (
                      <div className="flex gap-3 px-1 py-3.5">{body}</div>
                    )}
                  </li>
                );
              })}
            </ol>
          </>
        )}

        {tab === "saldos" && (
          <div className="grid gap-8">
            {Object.keys(v.balances).length === 0 && <p className="text-muted">Todos están al día.</p>}
            {Object.entries(v.balances).map(([cur, per]) => (
              <section key={cur} aria-label={`Saldos en ${cur}`}>
                <h2 className="font-display text-2xl">Saldos en {cur}</h2>
                <ul className="mt-3 divide-y divide-line border-y border-line">
                  {v.members.map((m) => (
                    <li key={m.id} className="flex items-center justify-between gap-3 py-3 text-[15px]">
                      <span>
                        {m.name}
                        {m.id === me.id && <span className="text-muted"> (vos)</span>}
                      </span>
                      <BalanceLine cents={per[m.id] ?? 0} currency={cur} who="nombre" />
                    </li>
                  ))}
                </ul>
                <h3 className="mt-6 text-[13px] font-medium uppercase tracking-[0.14em] text-muted">{group.simplify_debts ? "Para quedar a mano (deudas simplificadas)" : "Deudas directas"}</h3>
                <ul className="mt-2 grid gap-2">
                  {v.transfers[cur].map((t, i) => {
                    const to = v.members.find((m) => m.id === t.to);
                    const canSettle = t.from === me.id || t.to === me.id || me.role === "admin";
                    return (
                      <li key={i} className="flex flex-wrap items-center gap-3 border border-line bg-surface p-4" data-testid="transfer">
                        <p className="min-w-0 flex-1 text-[15px]">
                          <strong>{name(t.from)}</strong> le debe <strong className="tabular-nums">{formatMoney(t.amount, cur)}</strong> a <strong>{name(t.to)}</strong>
                          {(to?.alias || to?.cvu) && (
                            <span className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-muted">
                              {to.alias && (
                                <>
                                  Alias <code className="text-ink">{to.alias}</code>
                                  <CopyButton value={to.alias} label="Copiar alias" className="h-8" />
                                </>
                              )}
                              {to.cvu && (
                                <>
                                  CVU <code className="text-ink">{to.cvu}</code>
                                  <CopyButton value={to.cvu} label="Copiar CVU" className="h-8" />
                                </>
                              )}
                            </span>
                          )}
                        </p>
                        {canSettle && (
                          <Link href={`/gastos/g/${group.id}/saldar?from=${t.from}&to=${t.to}&monto=${t.amount}&moneda=${cur}`} className="inline-flex h-10 items-center bg-navy px-4 text-[14px] text-paper hover:bg-navy-deep">
                            Saldar
                          </Link>
                        )}
                      </li>
                    );
                  })}
                  {v.transfers[cur].length === 0 && <li className="text-muted">Nadie le debe nada a nadie en {cur}.</li>}
                </ul>
              </section>
            ))}
            {Object.keys(v.balances).length > 1 && (
              <section className="border border-line bg-surface p-5">
                <h2 className="font-display text-xl">Todo pasado a {group.base_currency}</h2>
                {v.baseTransfers ? (
                  <ul className="mt-3 grid gap-1.5 text-[15px]">
                    {v.baseTransfers.map((t, i) => (
                      <li key={i}>
                        {name(t.from)} → {name(t.to)}: <strong className="tabular-nums">{formatMoney(t.amount, group.base_currency)}</strong>
                      </li>
                    ))}
                    {v.baseTransfers.length === 0 && <li className="text-muted">Quedan a mano.</li>}
                  </ul>
                ) : (
                  <p className="mt-2 text-[14px] text-muted">Hay {v.inBase.unconverted} gasto(s) en otra moneda sin cotización: no se pueden pasar a {group.base_currency}.</p>
                )}
                <p className="mt-2 text-[13px] text-muted">Con la cotización guardada en cada gasto.</p>
              </section>
            )}
            {me.role === "admin" && (
              <form action={toggleSimplifyAction} className="text-[14px]">
                <input type="hidden" name="group" value={group.id} />
                <input type="hidden" name="simplify" value={group.simplify_debts ? "0" : "1"} />
                <button className="text-rose-deep underline-offset-4 hover:underline">{group.simplify_debts ? "Ver deudas directas (sin simplificar)" : "Simplificar deudas"}</button>
              </form>
            )}
            <section>
              <h2 className="text-[13px] font-medium uppercase tracking-[0.14em] text-muted">Pagos registrados</h2>
              <ul className="mt-2 divide-y divide-line border-y border-line">
                {v.settlements.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-[14px]">
                    <span>
                      {name(s.from_member)} → {name(s.to_member)} · {SETTLEMENT_METHODS[s.method]}
                      {s.receipt_path && (
                        <a href={`/api/gastos/archivo/pago/${s.id}`} className="ml-2 text-rose-deep underline-offset-4 hover:underline">
                          comprobante
                        </a>
                      )}
                      {s.payment_link && s.status === "informado" && (
                        <a href={s.payment_link} target="_blank" rel="noopener noreferrer" className="ml-2 text-rose-deep underline-offset-4 hover:underline">
                          link de pago
                        </a>
                      )}
                    </span>
                    <span className="tabular-nums">
                      {formatMoney(s.amount, s.currency)} <span className={cn("ml-2 text-[12px]", s.status === "confirmado" ? "text-[#24583a]" : "text-muted")}>{s.status === "confirmado" ? "Confirmado" : "Informado"}</span>
                    </span>
                  </li>
                ))}
                {v.settlements.length === 0 && <li className="py-3 text-muted">Todavía no hay pagos.</li>}
              </ul>
            </section>
          </div>
        )}

        {tab === "graficos" && (
          <div className="grid gap-10">
            <section>
              <h2 className="mb-4 font-display text-2xl">Por categoría</h2>
              <CategoryChart data={v.byCategory} currency={group.base_currency} />
            </section>
            <section>
              <h2 className="mb-4 font-display text-2xl">Por mes</h2>
              <MonthChart data={v.byMonth} currency={group.base_currency} />
            </section>
            <p className="text-[13px] text-muted">En {group.base_currency}. Los gastos en otra moneda sin cotización no se cuentan.</p>
          </div>
        )}

        {tab === "integrantes" && (
          <div className="grid gap-8">
            <ul className="divide-y divide-line border-y border-line">
              {v.members.map((m) => (
                <li key={m.id} className="grid gap-2 py-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[15px]">
                      {m.name}
                      {m.id === me.id && <span className="text-muted"> (vos)</span>}
                      <span className="ml-2 text-[12px] text-muted">
                        {m.role === "admin" ? "Administra" : "Integrante"}
                        {m.guest && " · invitado sin cuenta"}
                        {m.email && ` · ${m.email}`}
                      </span>
                    </span>
                    {(me.role === "admin" || m.id === me.id) && m.role !== "admin" && (
                      <form action={removeMemberAction}>
                        <input type="hidden" name="group" value={group.id} />
                        <input type="hidden" name="member" value={m.id} />
                        <button className="text-[13px] text-muted underline-offset-4 hover:text-danger hover:underline">{m.id === me.id ? "Salir del grupo" : "Sacar"}</button>
                      </form>
                    )}
                  </div>
                  {m.guest && actor.kind === "user" && <RenewLinkForm groupId={group.id} memberId={m.id} />}
                </li>
              ))}
            </ul>
            {actor.kind === "user" && (
              <section>
                <h2 className="mb-3 font-display text-2xl">Sumar a alguien</h2>
                <InviteForm groupId={group.id} />
              </section>
            )}
            <section>
              <h2 className="mb-3 font-display text-2xl">Tus datos para cobrar</h2>
              <MeForm groupId={group.id} alias={me.payment_alias} cvu={me.payment_cvu} optOut={me.reminders_opt_out} />
            </section>
          </div>
        )}

        {tab === "socios" && isSocios && (
          <div className="grid gap-8">
            {Object.keys(v.partners).length === 0 && <p className="text-muted">Todavía no hay aportes ni retiros.</p>}
            {Object.entries(v.partners).map(([cur, per]) => (
              <section key={cur}>
                <h2 className="font-display text-2xl">Saldo por socio en {cur}</h2>
                <ul className="mt-3 divide-y divide-line border-y border-line">
                  {v.members.map((m) => (
                    <li key={m.id} className="flex justify-between py-3 text-[15px]">
                      <span>{m.name}</span>
                      <span className={cn("tabular-nums", (per[m.id] ?? 0) < 0 ? "text-rose-deep" : "")}>{formatMoney(per[m.id] ?? 0, cur, { signed: true })}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            <section>
              <h2 className="mb-3 font-display text-2xl">Registrar aporte o retiro</h2>
              <PartnerForm groupId={group.id} members={v.members.map((m) => ({ id: m.id, name: m.name }))} currency={group.base_currency} />
            </section>
            {v.movements.length > 0 && (
              <ul className="divide-y divide-line border-y border-line text-[14px]">
                {v.movements.map((m) => (
                  <li key={m.id} className="flex justify-between gap-3 py-2.5">
                    <span>
                      {day(m.date)} · {name(m.member_id)} · {m.kind === "aporte" ? "Aporte" : "Retiro"}
                      {m.note && <span className="text-muted"> · {m.note}</span>}
                    </span>
                    <span className="tabular-nums">{formatMoney(m.kind === "aporte" ? m.amount : -m.amount, m.currency, { signed: true })}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {tab === "ajustes" && me.role === "admin" && (
          <div className="grid gap-10">
            <SettingsForm groupId={group.id} name={group.name} simplify={group.simplify_debts} reminders={group.reminder_frequency} color={group.color} />
            <form action={archiveGroupAction} className="border-t border-line pt-6">
              <input type="hidden" name="group" value={group.id} />
              <p className="mb-3 text-[14px] text-muted">Archivar el grupo lo saca de la lista de todos. Los datos quedan guardados.</p>
              <button className="h-11 border border-danger/40 px-5 text-danger hover:bg-danger/5">Archivar grupo</button>
            </form>
          </div>
        )}
      </div>

      <Link
        href={`/gastos/g/${group.id}/gasto`}
        aria-label="Agregar gasto"
        className="fixed bottom-[calc(20px+env(safe-area-inset-bottom))] right-5 z-30 grid size-16 place-items-center rounded-full bg-navy text-paper shadow-[0_12px_30px_-10px_rgba(15,19,32,0.7)] hover:bg-navy-deep sm:hidden"
      >
        <Plus className="size-7" aria-hidden />
      </Link>
    </>
  );
}
