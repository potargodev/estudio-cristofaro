import { redirect } from "next/navigation";
import { COMERCIAL_TABS, visibleTabs } from "@/components/admin/shell/nav";
import { requireStaff } from "@/lib/auth";
import { studioAccess } from "@/lib/studio-access";

/** Comercial abre en la primera pestaña que ve el rol (el colaborador, la Agenda) */
export default async function ComercialPage() {
  const me = await requireStaff();
  redirect(visibleTabs(COMERCIAL_TABS, await studioAccess(me))[0]?.href ?? "/admin");
}
