import { SemaforoView } from "@/components/facturacion/views";
import { personalScope } from "../scope";

export const metadata = { title: "Semáforo de monotributo" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { scope } = await personalScope();
  return <SemaforoView scope={scope} sp={await searchParams} volver="/facturacion/monotributo" />;
}
