import "server-only";
import { notFound, redirect } from "next/navigation";
import { requireMember, requirePersonal, requireStaff } from "@/lib/auth";
import { ownOrganization } from "@/lib/faro/tenants";
import { studioOrganization } from "@/lib/organizations";
import { can } from "@/lib/permissions";
import type { StockScope } from "./server";

// Alcance de Stock armado SIEMPRE desde la sesión: la ficha de una
// organización (el estudio), el portal (Empresa → Stock, con el módulo activo)
// o la cuenta del autónomo (Facturación → Stock).

export type StockAmbito = "estudio" | "portal" | "personal";

export interface ResolvedStock {
  scope: StockScope;
  actor: { id: string; email: string; name: string };
  ambito: StockAmbito;
  /** Ruta base de la pantalla (los parámetros ?ver= se suman) */
  base: string;
  sep: "?" | "&";
  orgName: string;
}

export async function resolveStock(ambito: StockAmbito, orgId?: string | null): Promise<ResolvedStock> {
  if (ambito === "estudio") {
    const me = await requireStaff();
    if (me.assisted) redirect("/admin");
    const org = await studioOrganization(orgId ?? null, me.studioId);
    if (!org) notFound();
    return { scope: { studioId: me.studioId, organizationId: org.id, canManage: true }, actor: me, ambito, base: `/admin/organizaciones/${org.id}?tab=stock`, sep: "&", orgName: org.name };
  }
  if (ambito === "portal") {
    const me = await requireMember();
    if (!me.modules.includes("stock") || !can(me.orgRole, "finanzas.ver")) redirect("/portal/sin-permiso");
    return { scope: { studioId: me.studioId, organizationId: me.organizationId, canManage: can(me.orgRole, "finanzas.gestionar") }, actor: me, ambito, base: "/portal/modulos/stock", sep: "?", orgName: me.organizationName };
  }
  const me = await requirePersonal();
  if (me.role !== "titular") redirect("/personal");
  const own = await ownOrganization(me.studioId);
  if (!own) redirect("/personal");
  return { scope: { studioId: me.studioId, organizationId: own.id, canManage: true }, actor: me, ambito, base: "/facturacion/stock", sep: "?", orgName: own.name };
}
