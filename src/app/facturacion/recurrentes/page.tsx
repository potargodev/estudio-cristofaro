import { RecurringView } from "@/components/facturacion/MoreViews";
import { personalScope } from "../scope";

export const metadata = { title: "Recurrentes" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { scope } = await personalScope();
  return <RecurringView scope={scope} sp={await searchParams} volver="/facturacion/recurrentes" />;
}
