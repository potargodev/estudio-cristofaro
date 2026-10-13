import { OnboardingView } from "@/components/facturacion/OnboardingView";
import { orgScope } from "../scope";

export const metadata = { title: "Empezar a facturar" };

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const scope = await orgScope((await params).id, sp.cuit);
  return <OnboardingView scope={scope} sp={sp} />;
}
