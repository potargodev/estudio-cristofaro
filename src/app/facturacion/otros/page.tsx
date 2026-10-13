import { DocsView } from "@/components/facturacion/MoreViews";
import { personalScope } from "../scope";

export const metadata = { title: "Presupuestos, remitos y recibos" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { scope } = await personalScope();
  return <DocsView scope={scope} sp={await searchParams} volver="/facturacion/otros" />;
}
