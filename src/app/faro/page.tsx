import { FaroAi } from "@/components/faro/landing/FaroAi";
import { FaroForWhom } from "@/components/faro/landing/FaroForWhom";
import { FaroHero } from "@/components/faro/landing/FaroHero";
import { FaroModules } from "@/components/faro/landing/FaroModules";
import { FaroPersonal } from "@/components/faro/landing/FaroPersonal";
import { FaroPillars } from "@/components/faro/landing/FaroPillars";
import { FaroPlans } from "@/components/faro/landing/FaroPlans";
import { FaroShared } from "@/components/faro/landing/FaroShared";
import { getUsdArs, publicPlans } from "@/lib/faro/pricing";

// Landing de Faro (docs/faro-producto.md §2.c, §2.d, §2.e y §3). En staging vive
// en /faro; con FARO_HOSTS el middleware la sirve en la raíz de su dominio.
export const dynamic = "force-dynamic";

export default async function FaroPage() {
  const [plans, usdArs] = await Promise.all([publicPlans(), getUsdArs()]);
  return (
    <>
      <FaroHero />
      <FaroPillars />
      <FaroForWhom />
      <FaroPersonal />
      <FaroShared />
      <FaroModules />
      <FaroAi />
      <FaroPlans plans={plans} usdArs={usdArs} />
    </>
  );
}
