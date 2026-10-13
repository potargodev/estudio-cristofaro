import { SalesHome } from "@/components/ventas/SalesViews";
import { salesScope } from "@/modules/ventas/scope";

export const metadata = { title: "Ventas de tiendas" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { scope, base } = await salesScope();
  return <SalesHome scope={scope} base={base} sp={await searchParams} />;
}
