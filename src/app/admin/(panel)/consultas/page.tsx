import { and, desc, eq, ilike, inArray, max, or } from "drizzle-orm";
import { Columns3, Inbox, Search, Table2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DataTable, type DTRow } from "@/components/admin/kit/DataTable";
import { daysLabel, leadSourceIcon } from "@/components/admin/kit/leadIcons";
import { PageHeader } from "@/components/admin/kit/PageHeader";
import { EmptyState } from "@/components/admin/kit/Panel";
import { StatusBadge } from "@/components/admin/kit/StatusBadge";
import { LeadBoard, type BoardLead } from "@/components/admin/LeadBoard";
import { getDb } from "@/db";
import { audit_log, leads } from "@/db/schema";
import { requireStaff } from "@/lib/auth";
import { likeTerm } from "@/lib/search";
import { CONTRIBUTOR_TYPES, LEAD_SOURCES, LEAD_STATUSES } from "@/lib/types";

export const metadata: Metadata = { title: "Consultas" };

const DAY = 86400000;
const shortDate = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", timeZone: "UTC" });

export default async function ConsultasPage({ searchParams }: { searchParams: Promise<{ q?: string; vista?: string }> }) {
  const { q, vista } = await searchParams;
  const view = vista === "tabla" ? "tabla" : "tablero";
  const { studioId } = await requireStaff();
  const db = getDb();

  const term = q ? likeTerm(q) : null;
  let rows: BoardLead[] = [];
  let error: string | null = null;
  try {
    const base = await db
      .select({
        id: leads.id,
        name: leads.name,
        company: leads.company,
        contributor_type: leads.contributor_type,
        source: leads.source,
        status: leads.status,
        created_at: leads.created_at,
        next_action: leads.next_action,
        next_action_at: leads.next_action_at,
      })
      .from(leads)
      .where(
        and(
          eq(leads.studio_id, studioId),
          term && view === "tablero" ? or(ilike(leads.name, term), ilike(leads.email, term), ilike(leads.company, term), ilike(leads.phone, term)) : undefined,
        ),
      )
      .orderBy(desc(leads.created_at))
      .limit(400);
    // Días en la etapa: desde el último cambio de etapa registrado (o desde que llegó)
    const moves = base.length
      ? await db
          .select({ id: audit_log.entity_id, at: max(audit_log.created_at) })
          .from(audit_log)
          .where(
            and(
              eq(audit_log.studio_id, studioId),
              eq(audit_log.action, "consultas.estado"),
              inArray(
                audit_log.entity_id,
                base.map((b) => b.id),
              ),
            ),
          )
          .groupBy(audit_log.entity_id)
      : [];
    const moved = new Map(moves.map((m) => [m.id, m.at ? new Date(m.at) : null]));
    const now = Date.now();
    rows = base.map((b) => ({ ...b, stageDays: Math.floor((now - (moved.get(b.id) ?? b.created_at).getTime()) / DAY) }));
  } catch (e) {
    error = (e as Error).message;
  }

  const today = new Date().toISOString().slice(0, 10);
  const tableRows: DTRow[] = rows.map((l) => {
    const Source = leadSourceIcon(l.source);
    const overdue = !!l.next_action_at && l.next_action_at < today;
    const company = l.company ?? (l.contributor_type ? (CONTRIBUTOR_TYPES[l.contributor_type] ?? l.contributor_type) : null);
    return {
      id: l.id,
      href: `/admin/consultas/${l.id}`,
      search: [l.name, l.company].filter(Boolean).join(" "),
      facets: { estado: l.status, origen: l.source },
      sort: { name: l.name, status: LEAD_STATUSES.findIndex((s) => s.value === l.status), days: l.stageDays, next: l.next_action_at, created: -l.created_at.getTime() },
      cells: {
        name: (
          <span className="block min-w-0">
            <Link href={`/admin/consultas/${l.id}`} className="block truncate font-medium text-ink underline-offset-4 hover:underline">
              {l.name}
            </Link>
            {company && <span className="block truncate text-[12px] text-muted">{company}</span>}
          </span>
        ),
        status: <StatusBadge status={l.status} />,
        source: (
          <span className="inline-flex items-center gap-1.5 text-[13px] text-ink">
            <Source className="size-4 text-muted" strokeWidth={1.5} aria-hidden />
            {LEAD_SOURCES[l.source]}
          </span>
        ),
        days: <span className="tabular text-[13px] text-ink">{daysLabel(l.stageDays)}</span>,
        next: l.next_action ? (
          <span className={`block max-w-[16rem] truncate text-[13px] ${overdue ? "font-medium text-[#8f2a1c]" : "text-ink"}`}>
            {l.next_action}
            {l.next_action_at && <span className="tabular"> · {shortDate.format(new Date(`${l.next_action_at}T00:00:00Z`))}</span>}
          </span>
        ) : (
          <span className="text-[13px] text-muted">—</span>
        ),
        created: <span className="tabular text-[13px] text-muted">{shortDate.format(l.created_at)}</span>,
      },
    };
  });

  return (
    <>
      <PageHeader
        title="Consultas"
        description={
          view === "tablero"
            ? "Arrastrá las tarjetas entre columnas o usá el selector de cada una para cambiar la etapa."
            : "Todas las consultas con su etapa, origen y próxima acción."
        }
        actions={
          view === "tablero" ? (
            <form className="relative" role="search">
              <label htmlFor="q" className="sr-only">
                Buscar consultas
              </label>
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
              <input
                id="q"
                name="q"
                type="search"
                defaultValue={q}
                placeholder="Nombre, email, empresa…"
                className="h-9 w-64 rounded-[2px] border border-line bg-surface pl-9 pr-3 text-[14px] placeholder:text-muted focus:border-navy focus:outline-none"
              />
            </form>
          ) : undefined
        }
        tabs={[
          { href: "/admin/consultas", label: "Tablero", icon: Columns3, active: view === "tablero" },
          { href: "/admin/consultas?vista=tabla", label: "Tabla", icon: Table2, active: view === "tabla" },
        ]}
      />
      {error ? (
        <p className="border border-line bg-surface p-4 text-[14px] text-[#8f2a1c]">No se pudieron cargar las consultas: {error}</p>
      ) : view === "tablero" ? (
        <LeadBoard leads={rows} />
      ) : (
        <DataTable
          caption="Consultas"
          rows={tableRows}
          columns={[
            { key: "name", header: "Consulta", sortable: true, width: "14rem" },
            { key: "status", header: "Etapa", sortable: true },
            { key: "source", header: "Origen" },
            { key: "days", header: "En la etapa", sortable: true },
            { key: "next", header: "Próxima acción", sortable: true },
            { key: "created", header: "Llegó", sortable: true },
          ]}
          initialSort={{ key: "created", dir: "asc" }}
          searchPlaceholder="Buscar por nombre o empresa"
          filters={[
            { key: "estado", label: "Etapa", options: LEAD_STATUSES.map((s) => ({ value: s.value, label: s.label })) },
            { key: "origen", label: "Origen", options: Object.entries(LEAD_SOURCES).map(([value, label]) => ({ value, label })) },
          ]}
          empty={<EmptyState icon={Inbox} title="No hay consultas con estos filtros" text="Probá con otra etapa u origen." action={{ href: "/admin/consultas/nueva", label: "Cargar consulta" }} />}
        />
      )}
    </>
  );
}
