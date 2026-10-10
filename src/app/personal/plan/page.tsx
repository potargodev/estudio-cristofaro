import type { Metadata } from "next";
import { PlanBilling } from "@/components/faro/PlanBilling";
import { requirePersonal } from "@/lib/auth";

export const metadata: Metadata = { title: "Plan y facturación" };

export default async function PersonalPlanPage({ searchParams }: { searchParams: Promise<{ pedido?: string }> }) {
  const sp = await searchParams;
  const me = await requirePersonal();
  return (
    <div className="grid gap-6 pb-10">
      <header>
        <h1 className="font-display text-[34px] leading-tight text-ink sm:text-[44px]">Plan y facturación</h1>
        <p className="mt-2 max-w-xl text-[15px] text-muted">Tu plan, lo que usás y los otros planes, con precios en pesos.</p>
      </header>
      <PlanBilling studioId={me.studioId} back="/personal/plan" pedido={sp.pedido} />
    </div>
  );
}
