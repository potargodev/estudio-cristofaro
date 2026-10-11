import { SettingsView } from "@/components/facturacion/views";
import { personalScope } from "../scope";

export const metadata = { title: "Ajustes de facturación" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { scope } = await personalScope();
  return <SettingsView scope={scope} sp={await searchParams} volver="/facturacion/ajustes" />;
}
