import { AppDownload } from "@/components/home/AppDownload";
import { Benefits } from "@/components/home/Benefits";
import { ChaosToOrder } from "@/components/home/ChaosToOrder";
import { CompanyPanel } from "@/components/home/CompanyPanel";
import { ForWhom } from "@/components/home/ForWhom";
import { Hero } from "@/components/home/Hero";
import { PlansTable } from "@/components/home/PlansTable";
import { PlatformDemo } from "@/components/home/PlatformDemo";
import { Responsible } from "@/components/home/Responsible";
import { ScheduleTeaser } from "@/components/home/ScheduleTeaser";
import { SegmentsMarquee } from "@/components/home/SegmentsMarquee";
import { Services } from "@/components/home/Services";
import { Steps } from "@/components/home/Steps";
import { getPlanPrices } from "@/lib/data";

// Estructura y textos: docs/home-contenido.md (aprobado).
export default async function HomePage() {
  const prices = await getPlanPrices();
  return (
    <>
      <Hero />
      <ForWhom />
      <ChaosToOrder />
      <PlatformDemo />
      <CompanyPanel />
      <AppDownload />
      <Benefits />
      <Services />
      <PlansTable prices={prices} />
      <SegmentsMarquee />
      <Steps />
      <Responsible />
      <ScheduleTeaser />
    </>
  );
}
