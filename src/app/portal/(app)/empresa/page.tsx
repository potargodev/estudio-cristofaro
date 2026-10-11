import { redirect } from "next/navigation";
import { requireMember } from "@/lib/auth";
import { empresaTabs } from "@/lib/portal-nav";

/** Empresa abre en la primera pestaña que el rol puede ver */
export default async function EmpresaPage() {
  const me = await requireMember();
  redirect(empresaTabs(me.orgRole, me.modules)[0]?.href ?? "/portal");
}
