import { InvoiceFormView } from "@/components/facturacion/views";
import { orgScope } from "../scope";

export const metadata = { title: "Nueva factura" };

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const scope = await orgScope((await params).id, (await searchParams).cuit);
  return <InvoiceFormView scope={scope} />;
}
