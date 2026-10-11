import { CalendarView } from "@/components/facturacion/views";
import { personalScope } from "../scope";

export const metadata = { title: "Calendario" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { scope } = await personalScope();
  return <CalendarView scope={scope} sp={await searchParams} volver="/facturacion/calendario" />;
}
