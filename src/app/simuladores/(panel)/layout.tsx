import type { Metadata } from "next";
import { FlaskConical, Smartphone } from "lucide-react";
import { PageHeader } from "@/components/ds";
import { AppFrame } from "@/components/app/shell/AppFrame";
import { requireTenant } from "@/lib/auth";
import { FARO_APP_METADATA } from "@/lib/faro/pwa";

export const metadata: Metadata = { ...FARO_APP_METADATA, title: { absolute: "Simuladores · Faro", template: "%s · Simuladores · Faro" }, robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Parte C · Simuladores del espacio: el otro lado de ARCA, Mercado Pago, las tiendas, los sistemas, el banco, los mails y WhatsApp */
export default async function SimuladoresLayout({ children }: { children: React.ReactNode }) {
  await requireTenant();
  return (
    <AppFrame>
      <PageHeader
        title="Simuladores"
        description="Para probar Faro de punta a punta sin tocar nada real: acá manejás «el otro lado» de cada servicio que está en modo Simulador. Nada de esto tiene validez fiscal."
        tabs={[
          { href: "/simuladores", label: "Panel", icon: FlaskConical },
          { href: "/simuladores/telefono", label: "Teléfono de prueba", icon: Smartphone },
        ]}
      />
      {children}
    </AppFrame>
  );
}
