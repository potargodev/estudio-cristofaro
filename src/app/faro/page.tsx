import { FaroAi } from "@/components/faro/landing/FaroAi";
import { FaroHero } from "@/components/faro/landing/FaroHero";
import { FaroModules } from "@/components/faro/landing/FaroModules";
import { FaroPillars } from "@/components/faro/landing/FaroPillars";
import { FaroPlans } from "@/components/faro/landing/FaroPlans";

// Landing de Faro (docs/faro-producto.md). En staging vive en /faro; con
// FARO_HOSTS el middleware la sirve en la raíz de su propio dominio.
export default function FaroPage() {
  return (
    <>
      <FaroHero />
      <FaroPillars />
      <FaroModules />
      <FaroAi />
      <FaroPlans kinds={["studio"]} />
    </>
  );
}
