import { ChecksView } from "@/components/facturacion/views";
import { personalScope } from "../scope";

export const metadata = { title: "Chequeos guiados" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { scope } = await personalScope();
  return <ChecksView scope={scope} sp={await searchParams} volver="/facturacion/chequeos" />;
}
