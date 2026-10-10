import { FaroAi } from "@/components/faro/landing/FaroAi";
import { FaroForWhom } from "@/components/faro/landing/FaroForWhom";
import { FaroHero } from "@/components/faro/landing/FaroHero";
import { FaroIndustries } from "@/components/faro/landing/FaroIndustries";
import { FaroModules } from "@/components/faro/landing/FaroModules";
import { FaroPersonal } from "@/components/faro/landing/FaroPersonal";
import { FaroPillars } from "@/components/faro/landing/FaroPillars";
import { FaroPlans } from "@/components/faro/landing/FaroPlans";
import { FaroScreens } from "@/components/faro/landing/FaroScreens";
import { FaroCase, FaroCta, FaroFaq, FaroLevels, FaroProblem } from "@/components/faro/landing/FaroSections";
import { FaroShared } from "@/components/faro/landing/FaroShared";
import { getUsdArs, publicPlans } from "@/lib/faro/pricing";
import { FILE_TEMPLATES } from "@/modules/industries/catalog";

// Landing de Faro (docs/faro-producto.md §0, §2.c a §2.l y §3). En staging vive
// en /faro; con FARO_HOSTS el middleware la sirve en la raíz de su dominio.
export const dynamic = "force-dynamic";

const industries = FILE_TEMPLATES.map((t) => ({
  key: t.clave,
  name: t.nombre,
  description: t.descripcion,
  obligations: t.obligaciones.map((o) => o.impuesto),
  documents: t.checklist_alta.map((c) => c.item),
  tasks: t.tareas_recurrentes.map((x) => x.titulo),
}));

export default async function FaroPage() {
  const [plans, usdArs] = await Promise.all([publicPlans(), getUsdArs()]);
  return (
    <>
      <FaroHero />
      <FaroProblem />
      <FaroPillars />
      <FaroForWhom />
      <FaroLevels />
      <FaroScreens />
      <FaroIndustries items={industries} />
      <FaroPersonal />
      <FaroShared />
      <FaroModules />
      <FaroAi />
      <FaroPlans plans={plans} usdArs={usdArs} />
      <FaroCase />
      <FaroFaq />
      <FaroCta />
    </>
  );
}
