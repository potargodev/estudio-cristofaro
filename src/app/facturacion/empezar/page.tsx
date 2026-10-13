import { OnboardingView } from "@/components/facturacion/OnboardingView";
import { personalScope } from "../scope";

export const metadata = { title: "Empezar a facturar" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { scope } = await personalScope();
  return <OnboardingView scope={scope} sp={await searchParams} />;
}
