import { redirect } from "next/navigation";
import { CONFIG_TABS, visibleTabs } from "@/components/admin/shell/nav";
import { requireTenant } from "@/lib/auth";
import { studioAccess } from "@/lib/studio-access";

/** Configuración abre en la primera pestaña que ve el rol */
export default async function ConfiguracionPage() {
  const me = await requireTenant();
  redirect(visibleTabs(CONFIG_TABS, await studioAccess(me))[0]?.href ?? "/admin");
}
