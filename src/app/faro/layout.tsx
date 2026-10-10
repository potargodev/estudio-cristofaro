import type { Metadata } from "next";
import { FaroFooter } from "@/components/faro/landing/FaroFooter";
import { FaroHeader } from "@/components/faro/landing/FaroHeader";
import { SmoothScroll } from "@/components/motion/SmoothScroll";
import { Cursor } from "@/components/web/Cursor";
import { MotionBoot } from "@/components/web/MotionBoot";
import { FARO } from "@/lib/faro/brand";

export const metadata: Metadata = {
  title: { default: "Faro · Gestión para estudios contables y autónomos", template: "%s · Faro" },
  description: `${FARO.claim} Cartera ordenada, automatizaciones, IA con aprobación humana y portal para tus clientes. Y Faro Personal para autónomos que llevan sus números solos.`,
};

export default function FaroLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="site faro">
      <MotionBoot />
      <a href="#contenido" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:bg-paper focus:px-3 focus:py-2 focus:text-night">
        Saltar al contenido
      </a>
      <FaroHeader />
      <main id="contenido">{children}</main>
      <FaroFooter />
      <SmoothScroll />
      <Cursor />
    </div>
  );
}
