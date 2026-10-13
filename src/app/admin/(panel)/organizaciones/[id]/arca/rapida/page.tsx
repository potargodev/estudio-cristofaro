import { QuickInvoiceView } from "@/components/facturacion/QuickView";
import { orgScope } from "../scope";

export const metadata = { title: "Factura rápida" };

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const scope = await orgScope((await params).id, sp.cuit);
  return <QuickInvoiceView scope={scope} sp={sp} />;
}
