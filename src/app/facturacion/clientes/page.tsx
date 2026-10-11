import { CustomersView } from "@/components/facturacion/views";
import { personalScope } from "../scope";

export const metadata = { title: "Clientes y productos" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { scope } = await personalScope();
  return <CustomersView scope={scope} sp={await searchParams} volver="/facturacion/clientes" />;
}
