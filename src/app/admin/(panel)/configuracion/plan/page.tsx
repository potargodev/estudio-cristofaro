import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/kit/PageHeader";
import { PlanBilling } from "@/components/faro/PlanBilling";
import { requireTenantOwner } from "@/lib/auth";

export const metadata: Metadata = { title: "Plan y facturación" };

export default async function PlanPage({ searchParams }: { searchParams: Promise<{ pedido?: string; ok?: string; error?: string; pago?: string }> }) {
  const sp = await searchParams;
  const me = await requireTenantOwner();
  return (
    <div className="max-w-5xl">
      <PageHeader level={2} title="Plan y facturación" description="Tu plan de Faro, lo que usás de cada límite y los otros planes, con precios en pesos." />
      <PlanBilling studioId={me.studioId} back="/admin/configuracion/plan" pedido={sp.pedido} ok={sp.ok ?? (sp.pago ? "Volviste de Mercado Pago: en cuanto se acredite el pago lo vas a ver acá." : undefined)} error={sp.error} />
    </div>
  );
}
