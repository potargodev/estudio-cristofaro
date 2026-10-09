import { and, asc, count, eq, inArray, isNull, max } from "drizzle-orm";
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
import { Badge } from "@/components/portal/ui";
import { TeamPanel } from "@/components/team/TeamPanel";
import { getDb } from "@/db";
import { documents, legal_entities, requests, tango_records } from "@/db/schema";
import { requireStaff } from "@/lib/auth";
import { getOrgLimits, getOrgStaff, studioOrganization } from "@/lib/organizations";
import { ORGANIZATION_STATUSES } from "@/lib/types";

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

  const [entities, [newDocs], [openReqs], [tango], limits, team] = await Promise.all([
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
    <div className="max-w-6xl">
      <Link href="/admin/organizaciones" className="text-sm text-rose-deep underline-offset-4 hover:underline">
        Organizaciones
      </Link>
      <div className="mb-4 mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{org.name}</h1>
        <Badge tone={org.status === "activa" ? "ok" : org.status === "onboarding" ? "warn" : "neutral"}>{ORGANIZATION_STATUSES[org.status]}</Badge>
        {limits.planName && <Badge tone="neutral">{limits.planName}</Badge>}
        {tango.n > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e3efe6] px-2.5 py-0.5 text-xs font-medium text-[#24583a]">
            Vinculada con Tango
            <span className="font-normal">
              · última sincronización{" "}
              {tango.lastSync
                ? new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(
                    new Date(tango.lastSync),
                  )
                : "pendiente"}
            </span>
          </span>
        )}
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
              <div className="rounded-md border border-line bg-surface p-5">
                <h2 className="font-semibold">Responsable del estudio</h2>
                <p className="mt-1 text-[15px] text-muted">{lead ? `${lead.name} · ${lead.email}` : "Sin asignar."}</p>
                <Link
                  href={`/admin/organizaciones/${org.id}?tab=equipo`}
                  className="mt-2 inline-block text-rose-deep underline-offset-4 hover:underline"
                >
                  Gestionar equipo
                </Link>
              </div>
              {org.lead_id && (
                <div className="rounded-md border border-line bg-surface p-5">
                  <h2 className="font-semibold">Origen</h2>
                  <p className="mt-1 text-[15px] text-muted">Llegó como consulta.</p>
                  <Link href={`/admin/consultas/${org.lead_id}`} className="mt-2 inline-block text-rose-deep underline-offset-4 hover:underline">
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
