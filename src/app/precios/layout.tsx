import type { Metadata } from "next";
import { FaroFooter } from "@/components/faro/landing/FaroFooter";
import { FaroHeader } from "@/components/faro/landing/FaroHeader";
import { MotionBoot } from "@/components/web/MotionBoot";

export const metadata: Metadata = { title: "Precios · Faro", description: "Planes de Faro para personas, autónomos y estudios contables, con precios en pesos de referencia." };

export default function PreciosLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="site faro">
      <MotionBoot />
      <FaroHeader />
      <main id="contenido">{children}</main>
      <FaroFooter />
    </div>
  );
}
