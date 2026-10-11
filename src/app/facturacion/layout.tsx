import type { Metadata } from "next";
import { CalendarClock, FileText, Gauge, ListChecks, ScanText, Settings2, ShieldCheck, Users } from "lucide-react";
import { PageHeader } from "@/components/admin/kit/PageHeader";
import { AppFrame } from "@/components/app/shell/AppFrame";
import { requirePersonal } from "@/lib/auth";
import { Derivaciones, NoReemplaza } from "@/components/escudo/Derivaciones";
import { FARO_APP_METADATA } from "@/lib/faro/pwa";

export const metadata: Metadata = { ...FARO_APP_METADATA, title: { absolute: "Facturación · Faro", template: "%s · Facturación · Faro" }, robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Facturación del autónomo (espacio Personal, §2.o): comprobantes, ARCA, monotributo, calendario y chequeos */
export default async function FacturacionLayout({ children }: { children: React.ReactNode }) {
  const me = await requirePersonal();
  return (
    <AppFrame space="personal">
      <PageHeader
        title="Facturación"
        description="Tus comprobantes con ARCA y los datos de tu situación fiscal según lo que cargaste. Faro ordena; el criterio es de un contador."
        tabs={[
          { href: "/facturacion", label: "Comprobantes", icon: FileText, match: ["/facturacion/nueva"] },
          { href: "/facturacion/recibidos", label: "Recibidos", icon: ScanText },
          { href: "/facturacion/clientes", label: "Clientes y productos", icon: Users },
          { href: "/facturacion/arca", label: "Mi situación", icon: ShieldCheck },
          { href: "/facturacion/monotributo", label: "Monotributo", icon: Gauge },
          { href: "/facturacion/calendario", label: "Calendario", icon: CalendarClock },
          { href: "/facturacion/chequeos", label: "Chequeos", icon: ListChecks },
          { href: "/facturacion/ajustes", label: "Ajustes", icon: Settings2 },
        ]}
      />
      <div className="mb-4">
        <Derivaciones me={me} volver="/facturacion" max={1} />
      </div>
      {children}
      <NoReemplaza className="mt-8 border-t border-line pt-4" />
    </AppFrame>
  );
}
