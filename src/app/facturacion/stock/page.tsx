import { StockScreen } from "@/components/stock/StockScreen";
import { resolveStock } from "@/modules/stock/scope";

export const metadata = { title: "Stock" };

/** Facturación → Stock del autónomo (§2.q etapa 7) */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return <StockScreen r={await resolveStock("personal")} sp={await searchParams} />;
}
