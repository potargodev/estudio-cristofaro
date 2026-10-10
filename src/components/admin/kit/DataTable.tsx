"use client";

import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Search, SlidersHorizontal, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";

export interface DTColumn {
  key: string;
  header: string;
  sortable?: boolean;
  align?: "left" | "right" | "center";
  className?: string;
  /** Ancho mínimo de la columna en escritorio (ej. "12rem") */
  width?: string;
}

export interface DTRow {
  id: string;
  /** Celdas ya renderizadas (pueden venir del servidor) */
  cells: Record<string, React.ReactNode>;
  /** Valores para ordenar por columna */
  sort?: Record<string, string | number | null | undefined>;
  /** Texto en el que busca el buscador */
  search?: string;
  /** Valores para los filtros (clave del filtro → valor o valores) */
  facets?: Record<string, string | string[]>;
  /** Al hacer clic en la fila (o Enter con foco) navega acá */
  href?: string;
  /** Vista de tarjeta para el celular; si falta, se arma con las celdas */
  card?: React.ReactNode;
}

export interface DTFilter {
  key: string;
  label: string;
  options: { value: string; label: string }[];
}

export interface DTBulkAction {
  label: string;
  /** Server action que recibe `ids` (uno por fila elegida) y `extra` si hay */
  action: (fd: FormData) => void | Promise<void>;
  hidden?: Record<string, string>;
  tone?: "primary" | "secondary";
}

const PAGE_SIZES = [25, 50, 100];

/**
 * Tabla del backoffice: encabezado fijo, filas de 52 px con hover, columnas
 * ordenables, filtros como chips, búsqueda, paginación, selección múltiple con
 * acciones en lote y vista de tarjetas en el celular.
 */
export function DataTable({
  columns,
  rows,
  filters = [],
  searchPlaceholder = "Buscar…",
  pageSize: initialPageSize = 25,
  selectable = false,
  bulkActions = [],
  empty,
  initialSort,
  initialFilters,
  initialQuery = "",
  caption,
}: {
  columns: DTColumn[];
  rows: DTRow[];
  filters?: DTFilter[];
  searchPlaceholder?: string;
  pageSize?: number;
  selectable?: boolean;
  bulkActions?: DTBulkAction[];
  empty?: React.ReactNode;
  initialSort?: { key: string; dir: "asc" | "desc" };
  initialFilters?: Record<string, string[]>;
  initialQuery?: string;
  caption: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState(initialQuery);
  const [active, setActive] = useState<Record<string, string[]>>(initialFilters ?? {});
  const [sort, setSort] = useState(initialSort ?? null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    let out = rows.filter((r) => {
      if (term && !(r.search ?? "").toLowerCase().includes(term)) return false;
      for (const [k, vals] of Object.entries(active)) {
        if (!vals.length) continue;
        const f = r.facets?.[k];
        const have = Array.isArray(f) ? f : f ? [f] : [];
        if (!vals.some((v) => have.includes(v))) return false;
      }
      return true;
    });
    if (sort) {
      const dir = sort.dir === "asc" ? 1 : -1;
      out = [...out].sort((a, b) => {
        const x = a.sort?.[sort.key];
        const y = b.sort?.[sort.key];
        if (x == null && y == null) return 0;
        if (x == null) return 1;
        if (y == null) return -1;
        return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "es")) * dir;
      });
    }
    return out;
  }, [rows, q, active, sort]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pages - 1);
  const visible = filtered.slice(current * pageSize, current * pageSize + pageSize);
  const allVisibleSelected = visible.length > 0 && visible.every((r) => selected.has(r.id));

  const toggleFilter = (k: string, v: string) => {
    setPage(0);
    setActive((a) => {
      const cur = a[k] ?? [];
      return { ...a, [k]: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v] };
    });
  };
  const toggleSort = (k: string) =>
    setSort((s) => (s?.key === k ? (s.dir === "asc" ? { key: k, dir: "desc" } : null) : { key: k, dir: "asc" }));
  const toggleRow = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const toggleAll = () =>
    setSelected((s) => {
      const n = new Set(s);
      if (allVisibleSelected) visible.forEach((r) => n.delete(r.id));
      else visible.forEach((r) => n.add(r.id));
      return n;
    });
  const activeChips = Object.entries(active).flatMap(([k, vals]) =>
    vals.map((v) => ({ k, v, label: filters.find((f) => f.key === k)?.options.find((o) => o.value === v)?.label ?? v })),
  );
  const align = (a?: DTColumn["align"]) => (a === "right" ? "text-right" : a === "center" ? "text-center" : "text-left");

  return (
    <div className="border border-line bg-surface">
      {/* Barra: búsqueda y filtros */}
      <div className="space-y-3 border-b border-line p-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="relative min-w-56 flex-1 sm:max-w-sm">
            <span className="sr-only">{searchPlaceholder}</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <input
              type="search"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(0);
              }}
              placeholder={searchPlaceholder}
              className="h-9 w-full rounded-md border border-line bg-canvas pl-9 pr-3 text-[14px] placeholder:text-muted focus:border-navy focus:outline-none"
            />
          </label>
          <p className="tabular text-[13px] text-muted" aria-live="polite">
            {filtered.length} {filtered.length === 1 ? "resultado" : "resultados"}
          </p>
          {filters.length > 0 && (
            <button
              type="button"
              aria-expanded={showFilters}
              onClick={() => setShowFilters((v) => !v)}
              className="ml-auto inline-flex h-9 items-center gap-2 rounded-md border border-line px-3 text-[13px] text-ink md:hidden"
            >
              <SlidersHorizontal className="size-4" strokeWidth={1.5} aria-hidden />
              Filtros{activeChips.length > 0 && <span className="tabular rounded-md bg-navy px-1.5 text-[12px] text-paper">{activeChips.length}</span>}
            </button>
          )}
        </div>
        {filters.length > 0 && (
          <div className={cn("flex-wrap gap-x-5 gap-y-2 md:flex", showFilters ? "flex" : "hidden")}>
            {filters.map((f) => (
              <div key={f.key} role="group" aria-label={f.label} className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-[13px] text-muted">{f.label}</span>
                {f.options.map((o) => {
                  const on = active[f.key]?.includes(o.value);
                  return (
                    <button
                      key={o.value}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleFilter(f.key, o.value)}
                      className={cn(
                        "h-7 rounded-md border px-2.5 text-[13px] transition-colors",
                        on ? "border-navy bg-navy text-paper" : "border-line bg-surface text-ink hover:border-muted",
                      )}
                    >
                      {o.label}
                    </button>
                  );
                })}
              </div>
            ))}
            {activeChips.length > 0 && (
              <button type="button" onClick={() => setActive({})} className="inline-flex items-center gap-1 text-[13px] text-muted underline-offset-4 hover:text-ink hover:underline">
                <X className="size-3.5" aria-hidden /> Limpiar filtros
              </button>
            )}
          </div>
        )}
      </div>

      {/* Acciones en lote */}
      {selectable && selected.size > 0 && bulkActions.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 border-b border-line bg-navy px-4 py-2.5 text-[14px] text-paper">
          <span className="tabular">{selected.size} seleccionados</span>
          {bulkActions.map((b) => (
            <form key={b.label} action={b.action} onSubmit={() => setTimeout(() => setSelected(new Set()), 0)}>
              {[...selected].map((id) => (
                <input key={id} type="hidden" name="ids" value={id} />
              ))}
              {Object.entries(b.hidden ?? {}).map(([k, v]) => (
                <input key={k} type="hidden" name={k} value={v} />
              ))}
              <button
                type="submit"
                className={cn(
                  "h-8 rounded-md px-3 text-[13px] font-medium",
                  b.tone === "secondary" ? "border border-paper/40 text-paper hover:border-paper" : "bg-rose-light text-night hover:bg-paper",
                )}
              >
                {b.label}
              </button>
            </form>
          ))}
          <button type="button" onClick={() => setSelected(new Set())} className="ml-auto text-[13px] text-paper/80 underline-offset-4 hover:underline">
            Deseleccionar
          </button>
        </div>
      )}

      {filtered.length === 0 ? (
        <div>{empty ?? <p className="p-8 text-center text-[14px] text-muted">No hay resultados con estos filtros.</p>}</div>
      ) : (
        <>
          {/* Escritorio: tabla */}
          <div className="hidden md:block">
            <table className="w-full border-collapse text-[14px]">
              <caption className="sr-only">{caption}</caption>
              <thead className="sticky top-14 z-10 bg-canvas">
                <tr className="border-b border-line text-[13px] text-muted">
                  {selectable && (
                    <th scope="col" className="w-10 px-3">
                      <input type="checkbox" checked={allVisibleSelected} onChange={toggleAll} aria-label="Elegir todas las filas visibles" className="size-4 accent-[var(--color-navy)]" />
                    </th>
                  )}
                  {columns.map((c) => (
                    <th
                      key={c.key}
                      scope="col"
                      aria-sort={sort?.key === c.key ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
                      className={cn("h-11 px-3 font-normal", align(c.align), c.className)}
                      style={c.width ? { minWidth: c.width } : undefined}
                    >
                      {c.sortable ? (
                        <button type="button" onClick={() => toggleSort(c.key)} className="inline-flex items-center gap-1 hover:text-ink">
                          {c.header}
                          {sort?.key === c.key ? (
                            sort.dir === "asc" ? (
                              <ArrowUp className="size-3.5" aria-hidden />
                            ) : (
                              <ArrowDown className="size-3.5" aria-hidden />
                            )
                          ) : (
                            <ArrowUpDown className="size-3.5 opacity-50" aria-hidden />
                          )}
                        </button>
                      ) : (
                        c.header
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr
                    key={r.id}
                    onClick={(e) => {
                      if (!r.href || (e.target as HTMLElement).closest("a,button,input,label,select,form")) return;
                      router.push(r.href);
                    }}
                    className={cn("h-[52px] border-b border-line last:border-0 hover:bg-canvas", r.href && "cursor-pointer", selected.has(r.id) && "bg-navy-soft/60")}
                  >
                    {selectable && (
                      <td className="px-3">
                        <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleRow(r.id)} aria-label="Elegir fila" className="size-4 accent-[var(--color-navy)]" />
                      </td>
                    )}
                    {columns.map((c) => (
                      <td key={c.key} className={cn("px-3 py-2 align-middle", align(c.align), c.className)}>
                        {r.cells[c.key]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Celular: tarjetas */}
          <ul className="divide-y divide-line md:hidden">
            {visible.map((r) => (
              <li key={r.id} className="flex gap-3 p-4">
                {selectable && (
                  <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleRow(r.id)} aria-label="Elegir" className="mt-1 size-4 shrink-0 accent-[var(--color-navy)]" />
                )}
                <div className="min-w-0 flex-1">
                  {r.card ?? (
                    <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1.5 text-[14px]">
                      {columns.map((c) => (
                        <div key={c.key} className="contents">
                          <dt className="text-muted">{c.header}</dt>
                          <dd className="min-w-0">{r.cells[c.key]}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {/* Paginación */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-[13px] text-muted">
            <label className="flex items-center gap-2">
              Filas por página
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(0);
                }}
                className="h-8 rounded-md border border-line bg-surface px-2 text-ink"
              >
                {PAGE_SIZES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <div className="flex items-center gap-3">
              <span className="tabular">
                {current * pageSize + 1}–{Math.min(filtered.length, (current + 1) * pageSize)} de {filtered.length}
              </span>
              <button type="button" disabled={current === 0} onClick={() => setPage(current - 1)} aria-label="Página anterior" className="grid size-8 place-items-center border border-line text-ink disabled:opacity-40">
                <ChevronLeft className="size-4" aria-hidden />
              </button>
              <button type="button" disabled={current >= pages - 1} onClick={() => setPage(current + 1)} aria-label="Página siguiente" className="grid size-8 place-items-center border border-line text-ink disabled:opacity-40">
                <ChevronRight className="size-4" aria-hidden />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
