import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/kit/PageHeader";
import { PlanBilling } from "@/components/faro/PlanBilling";
import { requireTenantOwner } from "@/lib/auth";

export const metadata: Metadata = { title: "Plan y facturación" };

export default async function PlanPage({ searchParams }: { searchParams: Promise<{ pedido?: string }> }) {
  const sp = await searchParams;
  const me = await requireTenantOwner();
  return (
    <div className="max-w-5xl">
      <PageHeader title="Plan y facturación" description="Tu plan de Faro, lo que usás de cada límite y los otros planes, con precios en pesos." />
      <PlanBilling studioId={me.studioId} back="/admin/plan" pedido={sp.pedido} />
    </div>
  );
}
