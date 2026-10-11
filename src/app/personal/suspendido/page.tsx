import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";
import { PayToReactivate } from "@/components/faro/PayToReactivate";
import { getCurrentUser } from "@/lib/auth";
import { FARO } from "@/lib/faro/brand";

export const metadata = { title: "Cuenta suspendida" };
export const dynamic = "force-dynamic";

export default async function PersonalSuspendido({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/ingresar");
  return (
    <AuthShell title="Cuenta suspendida" subtitle="Faro Personal">
      <p className="text-body leading-relaxed">Tu cuenta de Faro Personal está suspendida. Tus datos están guardados.</p>
      <PayToReactivate studioId={user.studioId} owner={user.role === "titular"} error={sp.error} />
      <p className="mt-3 text-ui text-muted">Por cualquier consulta escribinos a {FARO.contactEmail()}.</p>
    </AuthShell>
  );
}
