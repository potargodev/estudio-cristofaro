import { BatchDetail } from "@/components/lotes/BatchViews";
import { batchScope } from "@/modules/lotes/scope";

export const metadata = { title: "Lote" };

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { scope, base } = await batchScope();
  return <BatchDetail scope={scope} base={base} id={(await params).id} sp={await searchParams} />;
}
