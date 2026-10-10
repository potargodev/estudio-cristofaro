import { and, asc, eq, gte, lte } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { CalendarDays, ChevronLeft, ChevronRight, List } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { setObligationsStatus } from "@/app/admin/obligation-actions";
import { Notice } from "@/components/admin/AdminField";
import { PageHeader } from "@/components/admin/kit/PageHeader";
import { ObligationsBoard, type ObligationRow } from "@/components/admin/ObligationsBoard";
import { getDb } from "@/db";
import { obligations, organization_staff, organizations, users } from "@/db/schema";
import { requireStaff } from "@/lib/auth";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Vencimientos" };

const DAY = 86400000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const monthFmt = new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric", timeZone: "UTC" });

async function loadRows(studioId: string, from: string, to: string): Promise<ObligationRow[]> {
  const assignee = alias(users, "assignee");
  const owner = alias(users, "owner");
  const rows = await getDb()
    .select({
      id: obligations.id,
      orgId: organizations.id,
      org: organizations.name,
      tax: obligations.tax,
      period: obligations.period,
      due: obligations.due_date,
      status: obligations.status,
      amount: obligations.amount,
      assignee: assignee.name,
      owner: owner.name,
    })
    .from(obligations)
    .innerJoin(organizations, and(eq(organizations.id, obligations.organization_id), eq(organizations.studio_id, studioId)))
    .leftJoin(assignee, eq(assignee.id, obligations.assigned_to))
    .leftJoin(organization_staff, and(eq(organization_staff.organization_id, organizations.id), eq(organization_staff.assignment, "responsable")))
    .leftJoin(owner, eq(owner.id, organization_staff.user_id))
    .where(and(eq(obligations.studio_id, studioId), gte(obligations.due_date, from), lte(obligations.due_date, to)))
    .orderBy(asc(obligations.due_date), asc(organizations.name));
  const today = iso(new Date());
  return rows.map((r) => ({
    id: r.id,
    orgId: r.orgId,
    org: r.org,
    tax: r.tax,
    period: r.period,
    due: r.due,
    status: r.due < today && r.status !== "presentado" && r.status !== "pagado" ? "vencido" : r.status,
    amount: r.amount != null ? Number(r.amount) : null,
    responsible: r.assignee ?? r.owner ?? null,
  }));
}

function Calendar({ rows, month }: { rows: ObligationRow[]; month: string }) {
  const first = new Date(`${month}-01T00:00:00Z`);
  const start = new Date(first.getTime() - ((first.getUTCDay() + 6) % 7) * DAY);
  const today = iso(new Date());
  const cells = Array.from({ length: 42 }, (_, i) => iso(new Date(start.getTime() + i * DAY)));
  const byDay = new Map<string, ObligationRow[]>();
  for (const r of rows) byDay.set(r.due, [...(byDay.get(r.due) ?? []), r]);
  const tone = (s: string) =>
    s === "vencido" ? "border-l-[#b42318] bg-[#fbecea]" : s === "pagado" || s === "presentado" ? "border-l-[#3f7f57] bg-[#ecf6ef]" : "border-l-navy bg-navy-soft";
  return (
    <div className="border border-line bg-surface">
      <div className="hidden grid-cols-7 border-b border-line bg-paper text-[12px] text-muted md:grid">
        {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => (
          <span key={d} className="px-2 py-2">
            {d}
          </span>
        ))}
      </div>
      <ol className="grid grid-cols-1 md:grid-cols-7">
        {cells.map((d) => {
          const items = byDay.get(d) ?? [];
          const inMonth = d.startsWith(month);
          if (!inMonth && items.length === 0) return <li key={d} aria-hidden className="hidden min-h-28 border-b border-r border-line bg-paper/60 md:block" />;
          return (
            <li key={d} className={cn("min-h-28 border-b border-line p-2 md:border-r", !inMonth && "bg-paper/60", items.length === 0 && "hidden md:block")}>
              <p className={cn("tabular mb-1.5 text-[12px]", d === today ? "font-semibold text-gold-ink" : "text-muted")}>
                <span className="md:hidden">{new Intl.DateTimeFormat("es-AR", { weekday: "long", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`))} </span>
                {Number(d.slice(8))}
                {d === today && " · hoy"}
              </p>
              <ul className="space-y-1">
                {items.slice(0, 4).map((r) => (
                  <li key={r.id}>
                    <Link href={`/admin/organizaciones/${r.orgId}?tab=vencimientos`} className={cn("block truncate border-l-2 px-1.5 py-1 text-[12px] text-ink hover:underline", tone(r.status))} title={`${r.tax} ${r.period} · ${r.org}`}>
                      <span className="font-medium">{r.tax}</span> · {r.org}
                    </Link>
                  </li>
                ))}
                {items.length > 4 && <li className="text-[12px] text-muted">+{items.length - 4} más</li>}
              </ul>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export default async function VencimientosPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { studioId } = await requireStaff();
  const view = sp.vista === "calendario" ? "calendario" : "lista";
  const now = new Date();
  const month = /^\d{4}-\d{2}$/.test(sp.mes ?? "") ? sp.mes! : iso(now).slice(0, 7);
  const monthDate = new Date(`${month}-01T00:00:00Z`);
  const shift = (n: number) => iso(new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth() + n, 1))).slice(0, 7);

  const rows =
    view === "lista"
      ? await loadRows(studioId, iso(new Date(now.getTime() - 60 * DAY)), iso(new Date(now.getTime() + 120 * DAY)))
      : await loadRows(studioId, iso(new Date(monthDate.getTime() - 7 * DAY)), iso(new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth() + 1, 7))));
  const back = view === "lista" ? "/admin/vencimientos" : `/admin/vencimientos?vista=calendario&mes=${month}`;

  return (
    <>
      <PageHeader
        title="Vencimientos"
        description="Todas las obligaciones de las organizaciones, por semana. Elegí varias para marcarlas presentadas o pagadas."
        tabs={[
          { href: "/admin/vencimientos", label: "Lista", icon: List, active: view === "lista" },
          { href: `/admin/vencimientos?vista=calendario&mes=${month}`, label: "Calendario", icon: CalendarDays, active: view === "calendario" },
        ]}
      />
      {sp.guardado && <Notice>{Number(sp.guardado) === 1 ? "Actualizamos 1 vencimiento." : `Actualizamos ${Number(sp.guardado) || 0} vencimientos.`}</Notice>}
      {view === "lista" ? (
        <ObligationsBoard rows={rows} action={setObligationsStatus} back={back} initialOrg={sp.org} today={iso(now)} />
      ) : (
        <>
          <div className="mb-4 flex items-center gap-3">
            <Link href={`/admin/vencimientos?vista=calendario&mes=${shift(-1)}`} aria-label="Mes anterior" className="grid size-9 place-items-center border border-line bg-surface">
              <ChevronLeft className="size-4" aria-hidden />
            </Link>
            <h2 className="font-display text-[20px] first-letter:uppercase">{monthFmt.format(monthDate)}</h2>
            <Link href={`/admin/vencimientos?vista=calendario&mes=${shift(1)}`} aria-label="Mes siguiente" className="grid size-9 place-items-center border border-line bg-surface">
              <ChevronRight className="size-4" aria-hidden />
            </Link>
            <Link href="/admin/vencimientos?vista=calendario" className="ml-2 text-[13px] text-muted underline-offset-4 hover:text-ink hover:underline">
              Hoy
            </Link>
          </div>
          <Calendar rows={rows} month={month} />
        </>
      )}
    </>
  );
}
