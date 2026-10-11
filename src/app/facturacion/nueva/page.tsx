import { InvoiceFormView } from "@/components/facturacion/views";
import { personalScope } from "../scope";

export const metadata = { title: "Nueva factura" };

export default async function Page() {
  const { scope } = await personalScope();
  return <InvoiceFormView scope={scope} />;
}
