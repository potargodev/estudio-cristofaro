import { count, eq } from "drizzle-orm";
import { FaroSection } from "@/components/faro/FaroSection";
import { getDb } from "@/db";
import { plan_requests } from "@/db/schema";
import { requireFaro } from "@/lib/auth";

/** Tenants: lista, pedidos de plan y alta manual */
export default async function TenantsLayout({ children }: { children: React.ReactNode }) {
  const me = await requireFaro();
  const [pr] = await getDb().select({ n: count() }).from(plan_requests).where(eq(plan_requests.status, "pendiente"));
  return (
    <FaroSection section="tenants" owner={me.faroRole === "faro_owner"} counts={{ "/faro-manager/pedidos": pr?.n ?? 0 }}>
      {children}
    </FaroSection>
  );
}
