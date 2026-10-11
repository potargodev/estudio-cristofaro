import { InvoiceDetailView } from "@/components/facturacion/views";
import { orgScope } from "../scope";

export const metadata = { title: "Comprobante" };

export default async function Page({ params, searchParams }: { params: Promise<{ id: string; invoiceId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const p = await params;
  const sp = await searchParams;
  const scope = await orgScope(p.id, sp.cuit);
  return <InvoiceDetailView scope={scope} id={p.invoiceId} sp={sp} />;
}
