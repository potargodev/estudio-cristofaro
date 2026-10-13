import "server-only";
import { redirect } from "next/navigation";
import { getSessionUser, type StaffUser } from "@/lib/auth";
import { isStudioRole } from "@/lib/roles";
import { personalIssuer } from "@/modules/arca/server";
import type { SalesScope } from "./server";

/** Alcance de Ventas para facturar según la sesión: el estudio ve todas sus tiendas; la cuenta personal, las suyas */
export async function salesScope(): Promise<{ me: StaffUser; scope: SalesScope; base: string }> {
  const me = await getSessionUser();
  if (!me) redirect("/ingresar");
  if (me.tenantKind === "studio" && isStudioRole(me.role)) return { me, scope: { studioId: me.studioId, organizationId: null, canEmit: me.role === "dueno" || me.role === "contador" }, base: "/admin/facturacion/ventas" };
  if (me.role === "titular") {
    const s = await personalIssuer(me);
    return { me, scope: { studioId: me.studioId, organizationId: s.organizationId, canEmit: true }, base: "/facturacion/ventas" };
  }
  redirect("/");
}
