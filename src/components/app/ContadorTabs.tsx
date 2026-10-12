import { count, eq } from "drizzle-orm";
import { Network, Ship, Store, UserRound } from "lucide-react";
import { getDb } from "@/db";
import { service_agreements } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { SectionTabs } from "./SectionTabs";

/**
 * "Contador" del espacio personal (docs/faro-producto.md §2.o): tu contador
 * (la conexión), la Red Contable (estudios y tu postulación), Flotas y "mi
 * estudio" (tus acuerdos con un estudio, si tenés).
 * Solo para cuentas personales; sin sesión, la Red se ve sola.
 */
export async function ContadorTabs() {
  const user = await getCurrentUser().catch(() => null);
  if (!user || user.role !== "titular") return null;
  const [mine] = await getDb().select({ n: count() }).from(service_agreements).where(eq(service_agreements.user_id, user.id));
  return (
    <SectionTabs
      label="Contador"
      className="mb-6"
      tabs={[
        { href: "/contador", label: "Mi contador", icon: <UserRound strokeWidth={1.5} aria-hidden />, match: [] },
        { href: "/red-contable", label: "Red Contable", icon: <Network strokeWidth={1.5} aria-hidden />, match: ["/contador/disponible"] },
        { href: "/flotas", label: "Flotas", icon: <Ship strokeWidth={1.5} aria-hidden /> },
        ...((mine?.n ?? 0) > 0 ? [{ href: "/flotas/servicios", label: "Mi estudio", icon: <Store strokeWidth={1.5} aria-hidden /> }] : []),
      ]}
    />
  );
}
