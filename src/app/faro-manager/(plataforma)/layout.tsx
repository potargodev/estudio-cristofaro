import { count, eq } from "drizzle-orm";
import { FaroSection } from "@/components/faro/FaroSection";
import { getDb } from "@/db";
import { message_reports } from "@/db/schema";
import { requireFaro } from "@/lib/auth";

/** Plataforma: auditoría, opiniones de la ayuda, mensajes reportados y uso y costos de IA */
export default async function PlataformaLayout({ children }: { children: React.ReactNode }) {
  const me = await requireFaro();
  const [rep] = await getDb().select({ n: count() }).from(message_reports).where(eq(message_reports.status, "abierto"));
  return (
    <FaroSection section="plataforma" owner={me.faroRole === "faro_owner"} counts={{ "/faro-manager/reportes": rep?.n ?? 0 }}>
      {children}
    </FaroSection>
  );
}
