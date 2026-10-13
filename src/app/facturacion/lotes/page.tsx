import { BatchHome } from "@/components/lotes/BatchViews";
import { batchScope } from "@/modules/lotes/scope";

export const metadata = { title: "Lotes" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { scope, base } = await batchScope();
  return <BatchHome scope={scope} base={base} sp={await searchParams} />;
}
