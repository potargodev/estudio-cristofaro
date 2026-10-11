import { InvoiceListView } from "@/components/facturacion/views";
import { personalScope } from "./scope";

export const metadata = { title: "Comprobantes" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { scope } = await personalScope();
  return <InvoiceListView scope={scope} sp={await searchParams} />;
}
