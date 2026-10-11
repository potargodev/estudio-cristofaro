import { InvoiceDetailView } from "@/components/facturacion/views";
import { personalScope } from "../scope";

export const metadata = { title: "Comprobante" };

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { scope } = await personalScope();
  return <InvoiceDetailView scope={scope} id={(await params).id} sp={await searchParams} />;
}
