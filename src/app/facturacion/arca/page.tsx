import { SituationView } from "@/components/facturacion/views";
import { personalScope } from "../scope";

export const metadata = { title: "Mi situación con ARCA" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { scope } = await personalScope();
  return <SituationView scope={scope} sp={await searchParams} volver="/facturacion/arca" />;
}
