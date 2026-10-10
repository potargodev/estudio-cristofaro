import { and, asc, count, eq, inArray, isNull, max, ne, sql } from "drizzle-orm";
import { CalendarClock, FileText, MessagesSquare, RefreshCw, UserRound, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  staffApproveInvitation,
  staffChangeRole,
  staffInvite,
  staffReactivateMember,
  staffResend,
  staffRevokeInvitation,
  staffRevokeMember,
} from "@/app/admin/member-actions";
import { ActivityTimeline } from "@/components/admin/ActivityTimeline";
import { OrgExpensesTab } from "@/components/admin/OrgExpensesTab";
import { Notice } from "@/components/admin/AdminField";
import { LegalEntitiesSection, OrganizationGeneralForm } from "@/components/admin/OrganizationForms";
import {
  DocumentsTab,
  IntegrationsTab,
  LEGACY_TABS,
  ORG_TABS,
  ObligationsTab,
  PlanTab,
  RequestsTab,
  StaffTab,
  TabNav,
  type OrgTabKey,
} from "@/components/admin/OrganizationTabs";
import { Suspense } from "react";
import { CallsList } from "@/components/admin/CallsList";
import { ListSkeleton } from "@/components/ui/skeleton-blocks";
import { Avatar } from "@/components/admin/kit/Avatar";
import { StatCard } from "@/components/admin/kit/StatCard";
import { StatusBadge, Tag } from "@/components/admin/kit/StatusBadge";
import { TeamPanel } from "@/components/team/TeamPanel";
import { getDb } from "@/db";
import { bookings, documents, legal_entities, obligations, requests, tango_records } from "@/db/schema";
import { requireStaff } from "@/lib/auth";
import { getOrgLimits, getOrgStaff, studioOrganization } from "@/lib/organizations";
import { formatCuit } from "@/lib/types";

export const metadata: Metadata = { title: "Organización" };

const NOTICES: Record<string, string> = {
  guardado: "Cambios guardados.",
  nueva: "Organización creada.",
};

export default async function OrganizacionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { studioId } = await requireStaff();
  const org = await studioOrganization(id, studioId);
  if (!org) notFound();
  const db = getDb();

  const asked = LEGACY_TABS[sp.tab ?? ""] ?? sp.tab;
  const tab: OrgTabKey = ORG_TABS.some((t) => t.key === asked) ? (asked as OrgTabKey) : "general";

  const today = new Date().toISOString().slice(0, 10);
  const in14 = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  const [entities, [newDocs], [openReqs], [tango], limits, team, [dues]] = await Promise.all([
    db
      .select()
      .from(legal_entities)
      .where(and(eq(legal_entities.organization_id, org.id), eq(legal_entities.studio_id, studioId)))
      .orderBy(asc(legal_entities.created_at)),
    db
      .select({ n: count() })
      .from(documents)
      .where(
        and(eq(documents.organization_id, org.id), eq(documents.studio_id, studioId), eq(documents.source, "cliente"), isNull(documents.reviewed_at)),
      ),
    db
      .select({ n: count() })
      .from(requests)
      .where(and(eq(requests.organization_id, org.id), eq(requests.studio_id, studioId), inArray(requests.status, ["abierta", "en_curso"]))),
    db
      .select({ n: count(), lastSync: max(tango_records.synced_at) })
      .from(tango_records)
      .where(and(eq(tango_records.organization_id, org.id), eq(tango_records.studio_id, studioId))),
    getOrgLimits(org.id),
    getOrgStaff(org.id),
    db
      .select({
        late: sql<number>`count(*) filter (where ${obligations.due_date} < ${today})`.mapWith(Number),
        soon: sql<number>`count(*) filter (where ${obligations.due_date} >= ${today})`.mapWith(Number),
      })
      .from(obligations)
      .where(
        and(
          eq(obligations.organization_id, org.id),
          eq(obligations.studio_id, studioId),
          ne(obligations.status, "presentado"),
          ne(obligations.status, "pagado"),
          sql`${obligations.due_date} <= ${in14}`,
        ),
      ),
  ]);
  const entityOptions = entities.map((e) => ({ value: e.id, label: e.business_name }));
  const lead = team.find((t) => t.assignment === "responsable");
  const limitText = limits.max
    ? `${limits.used.legal_entities} de ${limits.max.legal_entities} según el plan ${limits.planName}`
    : "Sin plan asignado: no se aplican límites";

  const usersText = limits.max
    ? `${limits.used.users} de ${limits.max.users} usuarios del plan ${limits.planName} (incluye invitaciones pendientes)`
    : "Sin plan asignado: no se aplican límites";
  const notice = Object.keys(NOTICES).find((k) => sp[k]);
  const errorText = sp.error
    ? sp.error === "vencimiento"
      ? "Revisá los datos del vencimiento: impuesto, período, fecha, monto y un link que empiece con https://."
      : sp.error === "usuario"
        ? "Elegí a alguien del estudio."
        : sp.error === "plan" || sp.error === "modulo"
          ? "Opción inválida."
          : sp.error === "archivo"
            ? null
            : sp.error
    : null;

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-start gap-4">
        <Avatar name={org.name} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-[28px] leading-tight text-ink sm:text-[40px] sm:leading-none">{org.name}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-muted">
            <StatusBadge status={org.status} />
            {limits.planName ? <Tag>{limits.planName}</Tag> : <span>Sin plan</span>}
            <span className="tabular">
              {entities.length === 1 ? `CUIT ${formatCuit(entities[0].cuit, "sin cargar")}` : `${entities.length} razones sociales`}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <UserRound className="size-4" strokeWidth={1.5} aria-hidden />
              {lead ? lead.name : "Sin responsable"}
            </span>
            {org.contact_name && <span>Contacto: {org.contact_name}</span>}
            {tango.n > 0 && (
              <span className="inline-flex items-center gap-1.5 text-[#24583a]">
                <RefreshCw className="size-4" strokeWidth={1.5} aria-hidden />
                Vinculada con Tango · última sincronización {tango.lastSync ? new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(tango.lastSync)) : "pendiente"}
              </span>
            )}
          </div>
        </div>
      </header>
      <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <StatCard
          icon={CalendarClock}
          label="Vencimientos próximos"
          value={dues.soon + dues.late}
          tone={dues.late ? "alert" : "default"}
          hint={dues.late ? `${dues.late} vencidos sin presentar` : "Próximos 14 días"}
          href={`/admin/organizaciones/${org.id}?tab=vencimientos`}
        />
        <StatCard icon={MessagesSquare} label="Solicitudes abiertas" value={openReqs.n} hint="Abiertas o en curso" href={`/admin/organizaciones/${org.id}?tab=solicitudes`} />
        <StatCard icon={FileText} label="Documentos sin revisar" value={newDocs.n} hint="Subidos por el cliente" href={`/admin/organizaciones/${org.id}?tab=documentos`} />
        <StatCard
          icon={Users}
          label="Usuarios"
          value={limits.used.users}
          suffix={limits.max ? ` / ${limits.max.users}` : undefined}
          hint={limits.max ? `Del plan ${limits.planName}` : "Sin plan: sin límite"}
          href={`/admin/organizaciones/${org.id}?tab=miembros`}
        />
      </div>
      {notice && <Notice>{NOTICES[notice]}</Notice>}
      {errorText && (
        <div className="mb-4">
          <Notice tone="error">{errorText}</Notice>
        </div>
      )}

      <TabNav orgId={org.id} active={tab} counts={{ documentos: newDocs.n, solicitudes: openReqs.n }} />

      <div key={tab} className="tab-in">
        {tab === "general" && (
          <div className="grid gap-8 xl:grid-cols-[1fr_320px]">
            <div className="space-y-8">
              <OrganizationGeneralForm org={org} />
              <LegalEntitiesSection orgId={org.id} entities={entities} limitText={limitText} />
            </div>
            <aside className="space-y-4">
              <div className="border border-line bg-surface p-5">
                <h2 className="text-[16px] font-medium">Responsable del estudio</h2>
                <p className="mt-1 text-[15px] text-muted">{lead ? `${lead.name} · ${lead.email}` : "Sin asignar."}</p>
                <Link
                  href={`/admin/organizaciones/${org.id}?tab=equipo`}
                  className="mt-2 inline-block text-[14px] text-ink underline underline-offset-4 hover:text-rose-deep"
                >
                  Gestionar equipo
                </Link>
              </div>
              <div>
                <h2 className="mb-2 text-[16px] font-medium">Llamadas</h2>
                <Suspense fallback={<ListSkeleton rows={2} />}>
                  <CallsList studioId={studioId} where={eq(bookings.organization_id, org.id)} empty="Todavía no agendaron llamadas." />
                </Suspense>
              </div>
              {org.lead_id && (
                <div className="border border-line bg-surface p-5">
                  <h2 className="text-[16px] font-medium">Origen</h2>
                  <p className="mt-1 text-[15px] text-muted">Llegó como consulta.</p>
                  <Link href={`/admin/consultas/${org.lead_id}`} className="mt-2 inline-block text-[14px] text-ink underline underline-offset-4 hover:text-rose-deep">
                    Ver consulta original
                  </Link>
                </div>
              )}
            </aside>
          </div>
        )}
        {tab === "equipo" && <StaffTab orgId={org.id} studioId={studioId} />}
        {tab === "vencimientos" && <ObligationsTab orgId={org.id} studioId={studioId} entities={entityOptions} />}
        {tab === "documentos" && <DocumentsTab orgId={org.id} studioId={studioId} error={sp.error} entities={entityOptions} />}
        {tab === "solicitudes" && <RequestsTab orgId={org.id} studioId={studioId} />}
        {tab === "integraciones" && <IntegrationsTab orgId={org.id} studioId={studioId} />}
        {tab === "gastos" && <OrgExpensesTab orgId={org.id} studioId={studioId} />}
        {tab === "miembros" && (
          <TeamPanel
            organizationId={org.id}
            usersText={usersText}
            actions={{
              invite: staffInvite,
              resend: staffResend,
              revokeInvitation: staffRevokeInvitation,
              changeRole: staffChangeRole,
              revoke: staffRevokeMember,
              reactivate: staffReactivateMember,
              approve: staffApproveInvitation,
            }}
          />
        )}
        {tab === "actividad" && <ActivityTimeline orgId={org.id} studioId={studioId} before={sp.antes} />}
      </div>
      {tab === "plan" && <PlanTab orgId={org.id} studioId={studioId} planId={org.service_plan_id} />}
    </div>
  );
}
