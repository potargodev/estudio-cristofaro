import type { Metadata } from "next";
import { PlansTable } from "@/components/home/PlansTable";
import { PageHeader } from "@/components/site/PageHeader";
import { getPlanPrices } from "@/lib/data";
import { fullPlanRows } from "@/lib/plans-web";

export const metadata: Metadata = {
  title: "Planes y módulos",
  description: "Negocio en Orden, Empresa en Control y Gestión Estratégica: abono mensual fijo con plataforma, alertas y un responsable asignado.",
  alternates: { canonical: "/planes" },
};

export default async function PlanesPage() {
  const prices = await getPlanPrices();
  return (
    <>
      <PageHeader
        eyebrow="Planes"
        title="Un plan según el momento de tu empresa."
        intro="Todos incluyen la plataforma, las alertas y un responsable asignado. El precio final depende de razones sociales, empleados y volumen. La implementación inicial se cotiza aparte."
      />
      <PlansTable full rows={fullPlanRows()} prices={prices} />
    </>
  );
}
