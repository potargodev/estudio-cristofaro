import { and, count, eq } from "drizzle-orm";
import { SectionLayout } from "@/components/admin/SectionLayout";
import { COMERCIAL_TABS } from "@/components/admin/shell/nav";
import { getDb } from "@/db";
import { leads } from "@/db/schema";
import { requireStaff } from "@/lib/auth";
import { studioAccess } from "@/lib/studio-access";

/** Comercial (Negocio): Consultas, Agenda y Perfil en la Red, como pestañas */
export default async function ComercialLayout({ children }: { children: React.ReactNode }) {
  const me = await requireStaff();
  const [access, [nuevas]] = await Promise.all([studioAccess(me), getDb().select({ n: count() }).from(leads).where(and(eq(leads.studio_id, me.studioId), eq(leads.status, "nuevo")))]);
  return (
    <SectionLayout title="Comercial" description="Las consultas que llegan, tu agenda de llamadas, las cuentas que se conectan con el estudio y cómo te ven en la Red Contable." tabs={COMERCIAL_TABS} access={access} counts={{ leads: access.isOperator ? (nuevas?.n ?? 0) : 0 }}>
      {children}
    </SectionLayout>
  );
}
