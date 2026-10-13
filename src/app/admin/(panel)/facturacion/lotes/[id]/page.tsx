import { PageHeader } from "@/components/ds";
import { BatchDetail } from "@/components/lotes/BatchViews";
import { batchScope } from "@/modules/lotes/scope";
import { BILLING_TABS } from "../../tabs";

export const metadata = { title: "Lote" };

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { scope, base } = await batchScope();
  return (
    <>
      <PageHeader title="Facturación" description="Todas las CUIT de la cartera: emitir, lotes y el estado de ARCA." tabs={BILLING_TABS} />
      <BatchDetail scope={scope} base={base} id={(await params).id} sp={await searchParams} />
    </>
  );
}
