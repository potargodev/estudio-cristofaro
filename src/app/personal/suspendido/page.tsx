import { AuthShell } from "@/components/auth/AuthShell";
import { FARO } from "@/lib/faro/brand";

export const metadata = { title: "Cuenta suspendida" };

export default function PersonalSuspendido() {
  return (
    <AuthShell title="Cuenta suspendida" subtitle="Faro Personal">
      <p className="text-[15px] leading-relaxed">Tu cuenta de Faro Personal está suspendida. Tus datos están guardados. Escribinos a {FARO.contactEmail()} para reactivarla.</p>
    </AuthShell>
  );
}
