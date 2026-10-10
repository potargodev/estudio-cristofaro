import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";
import { SubmitButton } from "@/components/admin/ui";
import { getDb } from "@/db";
import { studios } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { FARO } from "@/lib/faro/brand";
import { signOut } from "../actions";

export const metadata = { title: "Cuenta suspendida", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function SuspendidoPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login");
  if (!user.tenantSuspended) redirect("/admin");
  const [t] = await getDb().select({ name: studios.name, reason: studios.suspended_reason }).from(studios).where(eq(studios.id, user.studioId));
  return (
    <AuthShell title="Cuenta suspendida" subtitle={`Faro · ${t?.name ?? ""}`}>
      <p className="text-[15px] leading-relaxed text-ink">El acceso a Faro de esta cuenta está suspendido. Tus datos están guardados y no se borró nada.</p>
      {t?.reason && <p className="mt-3 text-[14px] text-muted">Motivo: {t.reason}</p>}
      <p className="mt-3 text-[14px] text-muted">Para reactivarla escribinos a {FARO.contactEmail()}.</p>
      <form action={signOut} className="mt-6">
        <SubmitButton variant="secondary" pendingText="Saliendo…">
          Cerrar sesión
        </SubmitButton>
      </form>
    </AuthShell>
  );
}
