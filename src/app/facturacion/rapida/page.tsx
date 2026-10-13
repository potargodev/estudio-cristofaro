import { QuickInvoiceView } from "@/components/facturacion/QuickView";
import { personalScope } from "../scope";

export const metadata = { title: "Factura rápida" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { scope } = await personalScope();
  return <QuickInvoiceView scope={scope} sp={await searchParams} />;
}
