import { and, asc, count, eq, gt, inArray, isNull, max, ne, sql } from "drizzle-orm";
import { Building2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Avatar } from "@/components/admin/kit/Avatar";
import { DataTable, type DTRow } from "@/components/admin/kit/DataTable";
import { moduleIcon } from "@/components/admin/kit/moduleIcons";
import { PageHeader } from "@/components/admin/kit/PageHeader";
import { EmptyState } from "@/components/admin/kit/Panel";
import { StatusBadge, Tag } from "@/components/admin/kit/StatusBadge";
import { getDb } from "@/db";
import { audit_log, documents, invitations, legal_entities, memberships, obligations, organization_modules, organizations, requests, service_plans } from "@/db/schema";
import { requireStaff } from "@/lib/auth";
import { getModule } from "@/lib/modules/catalog";
import { awaitingApproval, getLeadsFor } from "@/lib/organizations";
import { ORGANIZATION_STATUSES, formatCuit } from "@/lib/types";

export const metadata: Metadata = { title: "Organizaciones" };

const DAY = 86400000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const shortDate = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", timeZone: "UTC" });

function ago(d: Date | null, now: Date) {
  if (!d) return "Sin actividad";
  const days = Math.floor((now.getTime() - d.getTime()) / DAY);
  if (days <= 0) return "Hoy";
  if (days === 1) return "Ayer";
  if (days < 30) return `Hace ${days} días`;
  const m = Math.floor(days / 30);
  return m === 1 ? "Hace 1 mes" : `Hace ${m} meses`;
}

export default async function OrganizacionesPage({ searchParams }: { searchParams: Promise<{ q?: string; estado?: string; plan?: string }> }) {
  const { q, estado = "vigentes", plan: planParam } = await searchParams;
  const { studioId } = await requireStaff();
  const db = getDb();
  const now = new Date();
  const today = iso(now);
  const in14 = iso(new Date(now.getTime() + 14 * DAY));

  const [orgs, plans] = await Promise.all([
    db
      .select({ org: organizations, planName: service_plans.name, plan: service_plans })
      .from(organizations)
      .leftJoin(service_plans, eq(service_plans.id, organizations.service_plan_id))
      .where(eq(organizations.studio_id, studioId))
      .orderBy(asc(organizations.name)),
    db
      .select({ id: service_plans.id, name: service_plans.name })
      .from(service_plans)
      .where(eq(service_plans.studio_id, studioId))
      .orderBy(asc(service_plans.position)),
  ]);

  const ids = orgs.map((o) => o.org.id);
  const none = ids.length === 0;
  const [leads, entities, mods, admins, pendingApproval, openReqs, newDocs, seats, pendingSeats, dues, activity] = await Promise.all([
    getLeadsFor(ids),
    none
      ? []
      : db
          .select({ org: legal_entities.organization_id, cuit: legal_entities.cuit, name: legal_entities.business_name })
          .from(legal_entities)
          .where(inArray(legal_entities.organization_id, ids)),
    none
      ? []
      : db
          .select({ org: organization_modules.organization_id, key: organization_modules.module_key })
          .from(organization_modules)
          .where(and(inArray(organization_modules.organization_id, ids), eq(organization_modules.active, true))),
    none
      ? []
      : db
          .select({ org: memberships.organization_id, n: count() })
          .from(memberships)
          .where(and(inArray(memberships.organization_id, ids), eq(memberships.role, "administrador"), eq(memberships.status, "activa")))
          .groupBy(memberships.organization_id),
    none
      ? []
      : db
          .select({ org: invitations.organization_id, n: count() })
          .from(invitations)
          .where(and(inArray(invitations.organization_id, ids), awaitingApproval()))
          .groupBy(invitations.organization_id),
    none
      ? []
      : db
          .select({ org: requests.organization_id, n: count() })
          .from(requests)
          .where(and(inArray(requests.organization_id, ids), inArray(requests.status, ["abierta", "en_curso"])))
          .groupBy(requests.organization_id),
    none
      ? []
      : db
          .select({ org: documents.organization_id, n: count() })
          .from(documents)
          .where(and(inArray(documents.organization_id, ids), eq(documents.source, "cliente"), isNull(documents.reviewed_at)))
          .groupBy(documents.organization_id),
    // Lugares de usuarios ocupados: membresías activas + invitaciones pendientes vigentes
    none
      ? []
      : db
          .select({ org: memberships.organization_id, n: count() })
          .from(memberships)
          .where(and(inArray(memberships.organization_id, ids), eq(memberships.status, "activa")))
          .groupBy(memberships.organization_id),
    none
      ? []
      : db
          .select({ org: invitations.organization_id, n: count() })
          .from(invitations)
          .where(and(inArray(invitations.organization_id, ids), eq(invitations.status, "pendiente"), gt(invitations.expires_at, new Date())))
          .groupBy(invitations.organization_id),
    // Vencimientos sin presentar: vencidos y de los próximos 14 días
    none
      ? []
      : db
          .select({
            org: obligations.organization_id,
            late: sql<number>`count(*) filter (where ${obligations.due_date} < ${today})`.mapWith(Number),
            soon: sql<number>`count(*) filter (where ${obligations.due_date} >= ${today})`.mapWith(Number),
            next: sql<string | null>`min(${obligations.due_date}) filter (where ${obligations.due_date} >= ${today})`,
          })
          .from(obligations)
          .where(
            and(
              eq(obligations.studio_id, studioId),
              inArray(obligations.organization_id, ids),
              ne(obligations.status, "presentado"),
              ne(obligations.status, "pagado"),
              sql`${obligations.due_date} <= ${in14}`,
            ),
          )
          .groupBy(obligations.organization_id),
    // Última actividad registrada en la auditoría
    none
      ? []
      : db
          .select({ org: sql<string>`${audit_log.organization_id}`, at: max(audit_log.created_at) })
          .from(audit_log)
          .where(and(eq(audit_log.studio_id, studioId), inArray(audit_log.organization_id, ids)))
          .groupBy(audit_log.organization_id),
  ]);
  const group = <T extends { org: string }>(rows: T[]) => {
    const m = new Map<string, T[]>();
    for (const r of rows) m.set(r.org, [...(m.get(r.org) ?? []), r]);
    return m;
  };
  const byOrgEntities = group(entities);
  const byOrgModules = group(mods);
  const counts = (rows: { org: string; n: number }[]) => new Map(rows.map((r) => [r.org, r.n]));
  const adminCount = counts(admins);
  const approvalCount = counts(pendingApproval);
  const reqCount = counts(openReqs);
  const docCount = counts(newDocs);
  const seatCount = counts(seats);
  const pendingSeatCount = counts(pendingSeats);

  const dueMap = new Map(dues.map((d) => [d.org, d]));
  const lastActivity = new Map(activity.map((a) => [a.org, a.at ? new Date(a.at) : null]));

  const rows: DTRow[] = orgs.map(({ org, planName, plan }) => {
    const les = byOrgEntities.get(org.id) ?? [];
    const ms = byOrgModules.get(org.id) ?? [];
    const lead = leads.get(org.id) ?? null;
    const due = dueMap.get(org.id);
    const late = due?.late ?? 0;
    const soon = due?.soon ?? 0;
    const reqs = reqCount.get(org.id) ?? 0;
    const last = lastActivity.get(org.id) ?? null;

    // Motivos de riesgo: los graves suben a "alto", los demás a "medio"
    const high: string[] = [];
    const medium: string[] = [];
    if (late) high.push(late === 1 ? "1 vencimiento vencido" : `${late} vencimientos vencidos`);
    if (org.risk_level === "alto") high.push("Marcada con riesgo alto");
    if (approvalCount.get(org.id)) high.push("Invitación por confirmar");
    if (plan) {
      const extra = org.limit_overrides ?? {};
      const exceeds =
        les.length > plan.max_legal_entities + (extra.legal_entities ?? 0) ||
        (seatCount.get(org.id) ?? 0) + (pendingSeatCount.get(org.id) ?? 0) > plan.max_users + (extra.users ?? 0) ||
        ms.length > plan.max_modules + (extra.modules ?? 0);
      if (exceeds) high.push("Excede el plan");
    }
    if (org.status !== "baja") {
      if (!planName) medium.push("Sin plan");
      if (!lead) medium.push("Sin responsable");
      if (!adminCount.get(org.id)) medium.push("Sin administrador");
      if (org.risk_level === "medio") medium.push("Marcada con riesgo medio");
      if (docCount.get(org.id)) medium.push(`${docCount.get(org.id)} documentos sin revisar`);
    }
    const reasons = [...high, ...medium];
    const risk = high.length ? "alto" : medium.length ? "medio" : "bajo";
    const cuits = les.map((l) => formatCuit(l.cuit, "")).filter(Boolean);
    const sub = les.length === 1 ? formatCuit(les[0].cuit, "Sin CUIT") : les.length ? `${les.length} razones sociales` : "Sin razón social";

    const health = (
      <span className="block min-w-0" title={reasons.join(" · ") || undefined}>
        <StatusBadge status={`riesgo_${risk}`} />
        {reasons.length > 0 && (
          <span className="mt-1 block truncate text-[12px] text-muted">
            {reasons[0]}
            {reasons.length > 1 && ` +${reasons.length - 1}`}
          </span>
        )}
      </span>
    );
    const modules = ms.length ? (
      <ul className="flex flex-wrap gap-1" aria-label="Módulos activos">
        {ms.map((m) => {
          const Icon = moduleIcon(m.key);
          const name = getModule(m.key)?.name ?? m.key;
          return (
            <li key={m.key} title={name} className="grid size-7 place-items-center border border-line text-ink/80">
              <Icon className="size-4" strokeWidth={1.5} aria-hidden />
              <span className="sr-only">{name}</span>
            </li>
          );
        })}
      </ul>
    ) : (
      <span className="text-[13px] text-muted">Ninguno</span>
    );
    const dueCell = soon || late ? (
      <Link href={`/admin/vencimientos?org=${org.id}`} className="tabular block text-[14px] underline-offset-4 hover:underline">
        <span className={late ? "font-medium text-[#8f2a1c]" : "text-ink"}>{soon + late}</span>
        <span className="ml-1.5 text-[12px] text-muted">{due?.next ? `próx. ${shortDate.format(new Date(`${due.next}T00:00:00Z`))}` : "vencidos"}</span>
      </Link>
    ) : (
      <span className="text-[13px] text-muted">—</span>
    );
    const reqCell = reqs ? (
      <Link href={`/admin/organizaciones/${org.id}?tab=solicitudes`} className="tabular text-[14px] text-ink underline-offset-4 hover:underline">
        {reqs}
      </Link>
    ) : (
      <span className="text-[13px] text-muted">—</span>
    );
    const name = (
      <span className="flex min-w-0 items-center gap-3">
        <Avatar name={org.name} />
        <span className="min-w-0">
          <Link href={`/admin/organizaciones/${org.id}`} className="block truncate font-medium text-ink underline-offset-4 hover:underline">
            {org.name}
          </Link>
          <span className="tabular block truncate text-[12px] text-muted">
            {sub}
            {org.status !== "activa" && ` · ${ORGANIZATION_STATUSES[org.status]}`}
          </span>
        </span>
      </span>
    );
    return {
      id: org.id,
      href: `/admin/organizaciones/${org.id}`,
      search: [org.name, org.contact_name, ...les.map((l) => l.name), ...les.map((l) => l.cuit), ...cuits].filter(Boolean).join(" "),
      facets: { estado: org.status, plan: org.service_plan_id ?? "sin", responsable: lead ?? "sin", riesgo: risk },
      sort: {
        name: org.name,
        plan: planName ?? null,
        lead: lead ?? null,
        due: soon + late || null,
        reqs: reqs || null,
        risk: risk === "alto" ? 0 : risk === "medio" ? 1 : 2,
        last: last ? -last.getTime() : null,
      },
      cells: {
        name,
        plan: planName ? <Tag>{planName}</Tag> : <span className="text-[13px] text-muted">Sin plan</span>,
        lead: lead ? <span className="text-[14px] text-ink">{lead}</span> : <span className="text-[13px] text-muted">Sin responsable</span>,
        modules,
        due: dueCell,
        reqs: reqCell,
        risk: health,
        last: <span className={`text-[13px] ${last ? "text-ink" : "text-muted"}`}>{ago(last, now)}</span>,
      },
      card: (
        <div className="space-y-2.5">
          <div className="flex items-start justify-between gap-3">
            {name}
            <StatusBadge status={`riesgo_${risk}`} />
          </div>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-12 text-[13px] text-muted">
            {planName ? <Tag>{planName}</Tag> : <span>Sin plan</span>}
            <span>{lead ?? "Sin responsable"}</span>
          </p>
          <p className="tabular flex flex-wrap gap-x-4 gap-y-1 pl-12 text-[13px] text-muted">
            <span>
              <span className={late ? "font-medium text-[#8f2a1c]" : "text-ink"}>{soon + late}</span> vencimientos
            </span>
            <span>
              <span className="text-ink">{reqs}</span> solicitudes
            </span>
            <span>{ago(last, now)}</span>
          </p>
          {reasons.length > 0 && <p className="pl-12 text-[12px] text-muted">{reasons.join(" · ")}</p>}
        </div>
      ),
    };
  });

  const responsables = [...new Set(orgs.map(({ org }) => leads.get(org.id)).filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b, "es"));
  const initialFilters: Record<string, string[]> = {};
  if (estado === "vigentes") initialFilters.estado = ["onboarding", "activa", "pausada"];
  else if (estado in ORGANIZATION_STATUSES) initialFilters.estado = [estado];
  if (planParam) initialFilters.plan = [planParam];

  return (
    <>
      <PageHeader title="Organizaciones" description="Clientes del estudio con su plan, responsable, módulos y estado de salud. Los vencimientos cuentan los próximos 14 días y los atrasados." />
      {orgs.length === 0 ? (
        <div className="border border-line bg-surface">
          <EmptyState icon={Building2} title="Todavía no hay organizaciones" text="Creá la primera o convertí una consulta ganada." action={{ href: "/admin/organizaciones/nueva", label: "Nueva organización" }} />
        </div>
      ) : (
        <DataTable
          caption="Organizaciones"
          columns={[
            { key: "name", header: "Organización", sortable: true, width: "16rem" },
            { key: "plan", header: "Plan", sortable: true },
            { key: "lead", header: "Responsable", sortable: true },
            { key: "modules", header: "Módulos" },
            { key: "due", header: "Vencimientos", sortable: true },
            { key: "reqs", header: "Solicitudes", sortable: true, align: "right" },
            { key: "risk", header: "Salud", sortable: true, width: "10rem", className: "max-w-[14rem]" },
            { key: "last", header: "Última actividad", sortable: true },
          ]}
          rows={rows}
          initialSort={{ key: "name", dir: "asc" }}
          initialFilters={initialFilters}
          initialQuery={q ?? ""}
          searchPlaceholder="Nombre, razón social o CUIT"
          filters={[
            { key: "riesgo", label: "Salud", options: [{ value: "alto", label: "Riesgo alto" }, { value: "medio", label: "Riesgo medio" }, { value: "bajo", label: "Al día" }] },
            { key: "estado", label: "Estado", options: Object.entries(ORGANIZATION_STATUSES).map(([value, label]) => ({ value, label })) },
            { key: "plan", label: "Plan", options: [...plans.map((p) => ({ value: p.id, label: p.name })), { value: "sin", label: "Sin plan" }] },
            ...(responsables.length ? [{ key: "responsable", label: "Responsable", options: [...responsables.map((r) => ({ value: r, label: r })), { value: "sin", label: "Sin responsable" }] }] : []),
          ]}
          empty={<EmptyState icon={Building2} title="No hay organizaciones con estos filtros" text="Probá con otros filtros o buscá por CUIT." />}
        />
      )}
    </>
  );
}
