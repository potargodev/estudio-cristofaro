import { and, asc, count, eq, ilike, inArray, isNull, or } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/AdminField";
import { adminButton } from "@/components/admin/styles";
import { FormSelect } from "@/components/admin/ui";
import { Badge } from "@/components/portal/ui";
import { Input } from "@/components/ui/input";
import { getDb } from "@/db";
import { documents, invitations, legal_entities, memberships, organization_modules, organizations, requests, service_plans } from "@/db/schema";
import { requireStaff } from "@/lib/auth";
import { getModule } from "@/lib/modules/catalog";
import { awaitingApproval, getLeadsFor } from "@/lib/organizations";
import { likeTerm } from "@/lib/search";
import { ORGANIZATION_STATUSES, RISK_LEVELS, formatCuit, type OrganizationStatus } from "@/lib/types";

export const metadata: Metadata = { title: "Organizaciones" };

type Tone = "neutral" | "ok" | "warn" | "danger";
const STATUS_TONE: Record<OrganizationStatus, Tone> = { onboarding: "warn", activa: "ok", pausada: "neutral", baja: "neutral" };

export default async function OrganizacionesPage({ searchParams }: { searchParams: Promise<{ q?: string; estado?: string; plan?: string }> }) {
  const { q, estado = "vigentes", plan } = await searchParams;
  const { studioId } = await requireStaff();
  const db = getDb();

  const term = q?.trim() ? likeTerm(q) : null;
  const digits = q?.replace(/[^0-9]/g, "");
  // Búsqueda por nombre, contacto, razón social o CUIT
  const matchingEntities = term
    ? db
        .select({ id: legal_entities.organization_id })
        .from(legal_entities)
        .where(
          and(
            eq(legal_entities.studio_id, studioId),
            or(ilike(legal_entities.business_name, term), digits ? ilike(legal_entities.cuit, likeTerm(digits)) : undefined),
          ),
        )
    : null;

  const [orgs, plans] = await Promise.all([
    db
      .select({ org: organizations, planName: service_plans.name })
      .from(organizations)
      .leftJoin(service_plans, eq(service_plans.id, organizations.service_plan_id))
      .where(
        and(
          eq(organizations.studio_id, studioId),
          term && matchingEntities
            ? or(ilike(organizations.name, term), ilike(organizations.contact_name, term), inArray(organizations.id, matchingEntities))
            : undefined,
          estado === "vigentes"
            ? inArray(organizations.status, ["onboarding", "activa", "pausada"])
            : estado in ORGANIZATION_STATUSES
              ? eq(organizations.status, estado as OrganizationStatus)
              : undefined,
          plan === "sin" ? isNull(organizations.service_plan_id) : plan ? eq(organizations.service_plan_id, plan) : undefined,
        ),
      )
      .orderBy(asc(organizations.name)),
    db.select({ id: service_plans.id, name: service_plans.name }).from(service_plans).where(eq(service_plans.studio_id, studioId)).orderBy(asc(service_plans.position)),
  ]);

  const ids = orgs.map((o) => o.org.id);
  const none = ids.length === 0;
  const [leads, entities, mods, admins, pendingApproval, openReqs, newDocs] = await Promise.all([
    getLeadsFor(ids),
    none ? [] : db.select({ org: legal_entities.organization_id, cuit: legal_entities.cuit }).from(legal_entities).where(inArray(legal_entities.organization_id, ids)),
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

  return (
    <>
      <AdminPageHeader title="Organizaciones">
        <Link href="/admin/organizaciones/nueva" className={adminButton.primary}>
          Nueva organización
        </Link>
      </AdminPageHeader>

      <form className="mb-5 flex flex-wrap items-end gap-3" role="search">
        <div>
          <label htmlFor="q" className="text-sm text-muted">
            Buscar
          </label>
          <Input id="q" name="q" defaultValue={q} placeholder="Nombre, razón social o CUIT" className="w-64" />
        </div>
        <div>
          <label htmlFor="estado" className="text-sm text-muted">
            Estado
          </label>
          <FormSelect
            id="estado"
            name="estado"
            defaultValue={estado}
            options={[{ value: "vigentes", label: "Vigentes" }, ...Object.entries(ORGANIZATION_STATUSES).map(([value, label]) => ({ value, label })), { value: "todas", label: "Todas" }]}
            className="w-48"
          />
        </div>
        <div>
          <label htmlFor="plan" className="text-sm text-muted">
            Plan
          </label>
          <FormSelect
            id="plan"
            name="plan"
            defaultValue={plan ?? ""}
            options={[{ value: "", label: "Todos" }, ...plans.map((p) => ({ value: p.id, label: p.name })), { value: "sin", label: "Sin plan" }]}
            className="w-52"
          />
        </div>
        <button type="submit" className={adminButton.secondary}>
          Filtrar
        </button>
      </form>

      <div className="overflow-x-auto rounded-md border border-line bg-surface">
        <table className="w-full min-w-[880px] text-left text-[15px]">
          <thead className="border-b border-line bg-paper text-sm text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Organización</th>
              <th className="px-4 py-3 font-medium">Plan</th>
              <th className="px-4 py-3 font-medium">Responsable</th>
              <th className="px-4 py-3 font-medium">Módulos activos</th>
              <th className="px-4 py-3 font-medium">Alertas</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {orgs.map(({ org, planName }) => {
              const les = byOrgEntities.get(org.id) ?? [];
              const ms = byOrgModules.get(org.id) ?? [];
              const alerts: { label: string; tone: Tone }[] = [];
              if (!planName) alerts.push({ label: "Sin plan", tone: "warn" });
              if (!leads.get(org.id)) alerts.push({ label: "Sin responsable", tone: "warn" });
              if (!adminCount.get(org.id) && org.status !== "baja") alerts.push({ label: "Sin administrador", tone: "warn" });
              if (approvalCount.get(org.id)) alerts.push({ label: `${approvalCount.get(org.id)} invitación por confirmar`, tone: "danger" });
              if (reqCount.get(org.id)) alerts.push({ label: `${reqCount.get(org.id)} solicitudes abiertas`, tone: "neutral" });
              if (docCount.get(org.id)) alerts.push({ label: `${docCount.get(org.id)} documentos nuevos`, tone: "neutral" });
              if (org.risk_level === "alto") alerts.push({ label: `Riesgo ${RISK_LEVELS.alto.toLowerCase()}`, tone: "danger" });
              return (
                <tr key={org.id} className={org.status === "baja" ? "text-muted" : ""}>
                  <td className="px-4 py-3.5 align-top">
                    <Link href={`/admin/organizaciones/${org.id}`} className="font-medium hover:text-rose-deep">
                      {org.name}
                    </Link>
                    <span className="mt-0.5 block text-sm text-muted">
                      {les.length === 1 ? formatCuit(les[0].cuit, "Sin CUIT") : `${les.length} razones sociales`} ·{" "}
                      <Badge tone={STATUS_TONE[org.status]}>{ORGANIZATION_STATUSES[org.status]}</Badge>
                    </span>
                  </td>
                  <td className="px-4 py-3.5 align-top">{planName ?? <span className="text-muted">—</span>}</td>
                  <td className="px-4 py-3.5 align-top">{leads.get(org.id) ?? <span className="text-muted">—</span>}</td>
                  <td className="px-4 py-3.5 align-top text-sm">
                    {ms.length ? ms.map((m) => getModule(m.key)?.name ?? m.key).join(", ") : <span className="text-muted">Ninguno</span>}
                  </td>
                  <td className="px-4 py-3.5 align-top">
                    <span className="flex flex-wrap gap-1.5">
                      {alerts.length === 0 ? <span className="text-sm text-muted">Sin alertas</span> : alerts.map((a) => <Badge key={a.label} tone={a.tone}>{a.label}</Badge>)}
                    </span>
                  </td>
                </tr>
              );
            })}
            {orgs.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted">
                  No hay organizaciones con estos filtros. Creá una nueva o convertí una consulta ganada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
