"use client";

import { CalendarCheck, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/admin/kit/Panel";
import { StatusBadge } from "@/components/admin/kit/StatusBadge";
import { cn } from "@/lib/utils";

export interface ObligationRow {
  id: string;
  orgId: string;
  org: string;
  tax: string;
  period: string;
  due: string; // YYYY-MM-DD
  status: string; // estado efectivo (incluye "vencido")
  amount: number | null;
  responsible: string | null;
}

const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const dayFmt = new Intl.DateTimeFormat("es-AR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const weekFmt = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "long", timeZone: "UTC" });
const STATUS_OPTIONS = [
  ["vencido", "Vencidos"],
  ["pendiente", "Pendientes"],
  ["en_proceso", "En proceso"],
  ["presentado", "Presentados"],
  ["pagado", "Pagados"],
] as const;

function weekKey(due: string) {
  const d = new Date(`${due}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn("h-7 rounded-[2px] border px-2.5 text-[13px] transition-colors", on ? "border-navy bg-navy text-paper" : "border-line bg-surface text-ink hover:border-muted")}
    >
      {children}
    </button>
  );
}

/**
 * Lista de vencimientos agrupada por semana, con filtros (organización,
 * impuesto, estado, responsable), selección y acciones en lote (marcar
 * presentado o pagado). En el celular cada vencimiento es una tarjeta.
 */
export function ObligationsBoard({
  rows,
  action,
  back,
  initialOrg,
  today,
}: {
  rows: ObligationRow[];
  action: (fd: FormData) => void | Promise<void>;
  back: string;
  initialOrg?: string;
  today: string;
}) {
  const [q, setQ] = useState("");
  const [org, setOrg] = useState(initialOrg ?? "");
  const [taxes, setTaxes] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>(["vencido", "pendiente", "en_proceso"]);
  const [resp, setResp] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const orgs = useMemo(() => [...new Map(rows.map((r) => [r.orgId, r.org])).entries()].sort((a, b) => a[1].localeCompare(b[1], "es")), [rows]);
  const allTaxes = useMemo(() => [...new Set(rows.map((r) => r.tax))].sort(), [rows]);
  const allResp = useMemo(() => [...new Set(rows.map((r) => r.responsible ?? "Sin responsable"))].sort(), [rows]);
  const toggle = (list: string[], set: (v: string[]) => void, v: string) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const filtered = rows.filter(
    (r) =>
      (!org || r.orgId === org) &&
      (!taxes.length || taxes.includes(r.tax)) &&
      (!statuses.length || statuses.includes(r.status)) &&
      (!resp.length || resp.includes(r.responsible ?? "Sin responsable")) &&
      (!q.trim() || `${r.org} ${r.tax} ${r.period}`.toLowerCase().includes(q.trim().toLowerCase())),
  );
  const groups = new Map<string, ObligationRow[]>();
  for (const r of filtered) groups.set(weekKey(r.due), [...(groups.get(weekKey(r.due)) ?? []), r]);
  const thisWeek = weekKey(today);

  const toggleRow = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const toggleGroup = (list: ObligationRow[]) =>
    setSelected((s) => {
      const n = new Set(s);
      const all = list.every((r) => n.has(r.id));
      list.forEach((r) => (all ? n.delete(r.id) : n.add(r.id)));
      return n;
    });

  return (
    <div className="border border-line bg-surface">
      <div className="space-y-3 border-b border-line p-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="relative min-w-56 flex-1 sm:max-w-xs">
            <span className="sr-only">Buscar vencimientos</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar organización, impuesto o período…"
              className="h-9 w-full rounded-[2px] border border-line bg-paper pl-9 pr-3 text-[14px] placeholder:text-muted focus:border-navy focus:outline-none"
            />
          </label>
          <label className="flex items-center gap-2 text-[13px] text-muted">
            Organización
            <select value={org} onChange={(e) => setOrg(e.target.value)} className="h-9 max-w-56 rounded-[2px] border border-line bg-surface px-2 text-[14px] text-ink">
              <option value="">Todas</option>
              {orgs.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <p className="tabular ml-auto text-[13px] text-muted" aria-live="polite">
            {filtered.length} vencimientos
          </p>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <div role="group" aria-label="Estado" className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[13px] text-muted">Estado</span>
            {STATUS_OPTIONS.map(([v, l]) => (
              <Chip key={v} on={statuses.includes(v)} onClick={() => toggle(statuses, setStatuses, v)}>
                {l}
              </Chip>
            ))}
          </div>
          {allTaxes.length > 1 && (
            <div role="group" aria-label="Impuesto" className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[13px] text-muted">Impuesto</span>
              {allTaxes.map((t) => (
                <Chip key={t} on={taxes.includes(t)} onClick={() => toggle(taxes, setTaxes, t)}>
                  {t}
                </Chip>
              ))}
            </div>
          )}
          {allResp.length > 1 && (
            <div role="group" aria-label="Responsable" className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[13px] text-muted">Responsable</span>
              {allResp.map((t) => (
                <Chip key={t} on={resp.includes(t)} onClick={() => toggle(resp, setResp, t)}>
                  {t}
                </Chip>
              ))}
            </div>
          )}
        </div>
      </div>

      {selected.size > 0 && (
        <div className="sticky top-14 z-10 flex flex-wrap items-center gap-3 border-b border-line bg-navy px-4 py-2.5 text-[14px] text-paper">
          <span className="tabular">{selected.size} seleccionados</span>
          {(
            [
              ["presentado", "Marcar presentados"],
              ["pagado", "Marcar pagados"],
            ] as const
          ).map(([status, label]) => (
            <form key={status} action={action}>
              {[...selected].map((id) => (
                <input key={id} type="hidden" name="ids" value={id} />
              ))}
              <input type="hidden" name="status" value={status} />
              <input type="hidden" name="back" value={back} />
              <button type="submit" className="h-8 rounded-[2px] bg-rose-light px-3 text-[13px] font-medium text-night hover:bg-paper">
                {label}
              </button>
            </form>
          ))}
          <button type="button" onClick={() => setSelected(new Set())} className="ml-auto text-[13px] text-paper/80 underline-offset-4 hover:underline">
            Deseleccionar
          </button>
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState icon={CalendarCheck} title="No hay vencimientos con estos filtros" text="Probá con otros estados o importá el calendario del mes." action={{ href: "/admin/vencimientos/importar", label: "Importar vencimientos" }} />
      ) : (
        [...groups.entries()].map(([week, list]) => {
          const allOn = list.every((r) => selected.has(r.id));
          const late = list.filter((r) => r.status === "vencido").length;
          return (
            <section key={week} aria-label={`Semana del ${weekFmt.format(new Date(`${week}T00:00:00Z`))}`}>
              <header className="flex items-center gap-3 border-b border-line bg-paper px-4 py-2 text-[13px]">
                <input type="checkbox" checked={allOn} onChange={() => toggleGroup(list)} aria-label="Elegir toda la semana" className="size-4 accent-[var(--color-navy)]" />
                <span className="font-medium text-ink">
                  {week === thisWeek ? "Esta semana" : `Semana del ${weekFmt.format(new Date(`${week}T00:00:00Z`))}`}
                </span>
                <span className="tabular text-muted">{list.length}</span>
                {late > 0 && <StatusBadge status="vencido" label={`${late} vencidos`} />}
              </header>
              <ul className="divide-y divide-line">
                {list.map((r) => (
                  <li
                    key={r.id}
                    className={cn(
                      "grid min-h-[52px] grid-cols-[auto_1fr_auto] items-center gap-x-3 px-4 py-2.5 md:grid-cols-[auto_7.5rem_1fr_9rem_8rem_10rem] md:py-2",
                      selected.has(r.id) && "bg-navy-soft/60",
                    )}
                  >
                    <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleRow(r.id)} aria-label={`Elegir ${r.tax} ${r.period} de ${r.org}`} className="size-4 accent-[var(--color-navy)]" />
                    <span className={cn("tabular hidden text-[13px] md:block", r.status === "vencido" ? "font-medium text-[#8f2a1c]" : "text-muted")}>
                      {dayFmt.format(new Date(`${r.due}T00:00:00Z`))}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-medium text-ink">
                        {r.tax} <span className="font-normal text-muted">{r.period}</span>
                      </span>
                      <Link href={`/admin/organizaciones/${r.orgId}?tab=vencimientos`} className="block truncate text-[13px] text-muted underline-offset-4 hover:text-ink hover:underline">
                        {r.org}
                      </Link>
                      {/* Celular: fecha, importe y responsable en una línea */}
                      <span className="tabular mt-0.5 block truncate text-[13px] text-muted md:hidden">
                        <span className={r.status === "vencido" ? "font-medium text-[#8f2a1c]" : ""}>{dayFmt.format(new Date(`${r.due}T00:00:00Z`))}</span>
                        {" · "}
                        {r.amount != null ? money.format(r.amount) : "sin importe"}
                        {" · "}
                        {r.responsible ?? "sin responsable"}
                      </span>
                    </span>
                    <span className="tabular hidden text-right text-[14px] text-ink md:block">{r.amount != null ? money.format(r.amount) : "—"}</span>
                    <span className="hidden truncate text-[13px] text-muted md:block">{r.responsible ?? "Sin responsable"}</span>
                    <span className="text-right">
                      <StatusBadge status={r.status} />
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}
