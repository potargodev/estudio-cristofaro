import { PageHeader } from "@/components/admin/kit/PageHeader";
import type { Metadata } from "next";
import { PlanBilling } from "@/components/faro/PlanBilling";
import { requirePersonal } from "@/lib/auth";

export const metadata: Metadata = { title: "Plan y facturación" };

export default async function PersonalPlanPage({ searchParams }: { searchParams: Promise<{ pedido?: string; ok?: string; error?: string; pago?: string }> }) {
  const sp = await searchParams;
  const me = await requirePersonal();
  return (
    <div className="grid gap-6 pb-10">
      <PageHeader title="Plan y facturación" description="Tu plan, lo que usás y los otros planes, con precios en pesos." className="mb-0" />
      <PlanBilling studioId={me.studioId} back="/personal/plan" pedido={sp.pedido} ok={sp.ok ?? (sp.pago ? "Volviste de Mercado Pago: en cuanto se acredite el pago lo vas a ver acá." : undefined)} error={sp.error} />
    </div>
  );
}
