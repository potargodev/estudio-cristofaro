import { PageHeader } from "@/components/ds";
import { SalesHome } from "@/components/ventas/SalesViews";
import { salesScope } from "@/modules/ventas/scope";
import { BILLING_TABS } from "../tabs";

export const metadata = { title: "Ventas de tiendas" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { scope, base } = await salesScope();
  return (
    <>
      <PageHeader title="Facturación" description="Las ventas de las tiendas online, Mercado Pago y el local, listas para facturar." tabs={BILLING_TABS} />
      <SalesHome scope={scope} base={base} sp={await searchParams} />
    </>
  );
}
