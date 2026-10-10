import { ShieldAlert } from "lucide-react";
import { EmptyState } from "@/components/admin/kit/Panel";

export const metadata = { title: "Sin permiso" };

export default function SinPermisoPage() {
  return (
    <div className="mx-auto max-w-lg border border-line bg-surface">
      <EmptyState
        icon={ShieldAlert}
        title="Tu rol no tiene acceso a esta sección"
        text="Los colaboradores trabajan vencimientos, documentos, solicitudes y agenda. Para lo demás, pedile acceso a quien administra el estudio."
        action={{ href: "/admin", label: "Volver al resumen" }}
      />
    </div>
  );
}
