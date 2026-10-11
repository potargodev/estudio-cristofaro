import { SectionLayout } from "@/components/admin/SectionLayout";
import { CONFIG_TABS } from "@/components/admin/shell/nav";
import { requireTenant } from "@/lib/auth";
import { studioAccess } from "@/lib/studio-access";

/** Configuración: una sola entrada del menú, con pestañas según el rol (§2.o, regla 6) */
export default async function ConfiguracionLayout({ children }: { children: React.ReactNode }) {
  const me = await requireTenant();
  const access = await studioAccess(me);
  return (
    <SectionLayout title="Configuración" description={access.isPersonal ? "Tu plan, tus módulos, tu IA y la seguridad de tu cuenta." : "El equipo, el plan, las conexiones, la IA, los rubros, el sitio y la seguridad del estudio."} tabs={CONFIG_TABS} access={access}>
      {children}
    </SectionLayout>
  );
}
