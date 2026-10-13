import "server-only";
import { redirect } from "next/navigation";
import { getSessionUser, type StaffUser } from "@/lib/auth";
import { isStudioRole } from "@/lib/roles";
import { personalIssuer } from "@/modules/arca/server";
import type { BatchScope } from "./server";

/**
 * Alcance de lotes según la sesión: en el estudio, todo el panel (la CUIT
 * emisora va por fila; emiten dueños y contadores); en la cuenta personal,
 * su propia CUIT. Nunca sale de IDs del navegador.
 */
export async function batchScope(): Promise<{ me: StaffUser; scope: BatchScope; base: string }> {
  const me = await getSessionUser();
  if (!me) redirect("/ingresar");
  if (me.tenantKind === "studio" && isStudioRole(me.role)) return { me, scope: { studioId: me.studioId, organizationId: null, cuit: null, canEmit: me.role === "dueno" || me.role === "contador" }, base: "/admin/facturacion/lotes" };
  if (me.role === "titular") {
    const s = await personalIssuer(me);
    return { me, scope: { studioId: me.studioId, organizationId: s.organizationId, cuit: s.cuit, canEmit: true }, base: "/facturacion/lotes" };
  }
  redirect("/");
}
