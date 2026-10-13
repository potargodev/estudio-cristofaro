import { PageHeader } from "@/components/ds";
import { BatchHome } from "@/components/lotes/BatchViews";
import { batchScope } from "@/modules/lotes/scope";
import { BILLING_TABS } from "../tabs";

export const metadata = { title: "Lotes" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { scope, base } = await batchScope();
  return (
    <>
      <PageHeader title="Facturación" description="Todas las CUIT de la cartera: emitir, lotes y el estado de ARCA." tabs={BILLING_TABS} />
      <BatchHome scope={scope} base={base} sp={await searchParams} />
    </>
  );
}
