import type { Metadata } from "next";
import { ArrowLeftRight, Download, Gauge, Plug, Repeat, Target, Users } from "lucide-react";
import { PageHeader } from "@/components/admin/kit/PageHeader";
import { AppFrame } from "@/components/app/shell/AppFrame";
import { requireUser } from "@/modules/bitacora/session";
import { FARO_APP_METADATA } from "@/lib/faro/pwa";

export const metadata: Metadata = { ...FARO_APP_METADATA, title: { absolute: "Bitácora · Faro", template: "%s · Bitácora · Faro" }, robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Bitácora (espacio Personal): movimientos, sobres, fijos, metas, importación, conexiones y hogar */
export default async function BitacoraLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return (
    <AppFrame space="personal">
      <div className="w-full">
        <PageHeader
          title="Bitácora"
          description="Tu plata, a la vista. Privada: solo la ves vos (y quien vos elijas)."
          tabs={[
            { href: "/bitacora", label: "Movimientos", icon: ArrowLeftRight, match: ["/bitacora/categorias"] },
            { href: "/bitacora/presupuesto", label: "Sobres", icon: Gauge },
            { href: "/bitacora/fijos", label: "Fijos", icon: Repeat },
            { href: "/bitacora/metas", label: "Metas", icon: Target },
            { href: "/bitacora/importar", label: "Importar", icon: Download, match: ["/bitacora/tickets"] },
            { href: "/bitacora/conexiones", label: "Conexiones", icon: Plug },
            { href: "/bitacora/compartida", label: "Hogar", icon: Users },
          ]}
        />
        {children}
      </div>
    </AppFrame>
  );
}
