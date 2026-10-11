import type { Metadata } from "next";
import { CalendarClock, FileText, Gauge, ListChecks, Settings2, ShieldCheck, Users } from "lucide-react";
import { PageHeader } from "@/components/admin/kit/PageHeader";
import { AppFrame } from "@/components/app/shell/AppFrame";
import { requirePersonal } from "@/lib/auth";
import { FARO_APP_METADATA } from "@/lib/faro/pwa";

export const metadata: Metadata = { ...FARO_APP_METADATA, title: { absolute: "Facturación · Faro", template: "%s · Facturación · Faro" }, robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Facturación del autónomo (espacio Personal, §2.o): comprobantes, ARCA, monotributo, calendario y chequeos */
export default async function FacturacionLayout({ children }: { children: React.ReactNode }) {
  await requirePersonal();
  return (
    <AppFrame space="personal">
      <PageHeader
        title="Facturación"
        description="Tus comprobantes con ARCA, tu situación fiscal y cuánto te falta para el tope del monotributo."
        tabs={[
          { href: "/facturacion", label: "Comprobantes", icon: FileText, match: ["/facturacion/nueva"] },
          { href: "/facturacion/clientes", label: "Clientes y productos", icon: Users },
          { href: "/facturacion/arca", label: "Mi situación", icon: ShieldCheck },
          { href: "/facturacion/monotributo", label: "Monotributo", icon: Gauge },
          { href: "/facturacion/calendario", label: "Calendario", icon: CalendarClock },
          { href: "/facturacion/chequeos", label: "Chequeos", icon: ListChecks },
          { href: "/facturacion/ajustes", label: "Ajustes", icon: Settings2 },
        ]}
      />
      {children}
    </AppFrame>
  );
}
