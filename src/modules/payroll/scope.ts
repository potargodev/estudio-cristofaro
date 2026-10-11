import "server-only";
import { notFound, redirect } from "next/navigation";
import { requireMember, requireStaff } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { studioOrganization } from "@/lib/organizations";
import type { PayrollScope } from "./server";

// Alcance de Sueldos y empleados armado SIEMPRE desde la sesión: la ficha de
// una organización del estudio (el estudio en su nombre) o el portal de la
// organización (quien ve sueldos; administra quien tiene sueldos.gestionar).

export interface ResolvedPayroll {
  scope: PayrollScope;
  actor: { id: string; email: string; name: string };
  base: string;
  orgName: string;
  /** Puede informar novedades al estudio (lado organización) */
  canReport: boolean;
}

export async function resolvePayroll(ambito: "estudio" | "portal", orgId?: string | null): Promise<ResolvedPayroll> {
  if (ambito === "estudio") {
    const me = await requireStaff();
    const org = await studioOrganization(orgId ?? null, me.studioId);
    if (!org) notFound();
    return { scope: { studioId: me.studioId, organizationId: org.id, canManage: true, fromStudio: true }, actor: me, base: `/admin/organizaciones/${org.id}/sueldos`, orgName: org.name, canReport: false };
  }
  const me = await requireMember();
  if (!me.modules.includes("sueldos") || !can(me.orgRole, "sueldos.ver")) redirect("/portal/sin-permiso");
  return { scope: { studioId: me.studioId, organizationId: me.organizationId, canManage: can(me.orgRole, "sueldos.gestionar"), fromStudio: false }, actor: me, base: "/portal/modulos/sueldos", orgName: me.organizationName, canReport: can(me.orgRole, "personal.gestionar") || can(me.orgRole, "solicitudes.laborales") };
}
