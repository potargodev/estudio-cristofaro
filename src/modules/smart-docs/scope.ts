import "server-only";
import { notFound, redirect } from "next/navigation";
import { getSessionUser, requireStaff } from "@/lib/auth";
import { ownOrganization } from "@/lib/faro/tenants";
import { studioOrganization } from "@/lib/organizations";
import type { DocScope } from "./server";

// Alcance de la lectura inteligente, armado SIEMPRE desde la sesión (nunca
// desde IDs del navegador sin validar): ficha de una organización del
// estudio, gastos de la actividad del autónomo o tickets de la Bitácora.

export type Ambito = "estudio" | "personal" | "bitacora";

export interface ResolvedScope {
  scope: DocScope;
  actor: { id: string; email: string; name: string };
  /** Pantalla de la bandeja */
  base: string;
  title: string;
}

export async function resolveScope(ambito: Ambito, orgId?: string | null): Promise<ResolvedScope> {
  if (ambito === "estudio") {
    const me = await requireStaff();
    const org = await studioOrganization(orgId ?? null, me.studioId);
    if (!org) notFound();
    return { scope: { studioId: me.studioId, organizationId: org.id, ownerUserId: null, scope: "organizacion", canConfirm: true }, actor: me, base: `/admin/organizaciones/${org.id}/lectura`, title: org.name };
  }
  const me = await getSessionUser();
  if (!me) redirect("/ingresar");
  if (ambito === "personal") {
    if (me.role !== "titular" || me.tenantKind !== "personal") notFound();
    const own = await ownOrganization(me.studioId);
    if (!own) notFound();
    return { scope: { studioId: me.studioId, organizationId: own.id, ownerUserId: null, scope: "personal", canConfirm: true }, actor: me, base: "/facturacion/recibidos", title: "Comprobantes recibidos" };
  }
  return { scope: { studioId: me.studioId, organizationId: null, ownerUserId: me.id, scope: "bitacora", canConfirm: true }, actor: me, base: "/bitacora/tickets", title: "Tickets" };
}
