import { HandCoins, Repeat, Settings2 } from "lucide-react";
import { PageHeader } from "@/components/admin/kit/PageHeader";
import { requireOperator } from "@/lib/auth";

/** Honorarios (grupo Negocio, §2.o): cobros, abonos y configuración */
export default async function HonorariosLayout({ children }: { children: React.ReactNode }) {
  await requireOperator();
  return (
    <>
      <PageHeader
        title="Honorarios"
        description="Abonos de tus clientes, cobros con Mercado Pago, recordatorios y facturas del estudio."
        tabs={[
          { href: "/admin/honorarios", label: "Cobros", icon: HandCoins },
          { href: "/admin/honorarios/abonos", label: "Abonos", icon: Repeat },
          { href: "/admin/honorarios/configuracion", label: "Configuración", icon: Settings2 },
        ]}
      />
      {children}
    </>
  );
}
