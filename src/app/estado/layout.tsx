import type { Metadata } from "next";
import { FaroFooter } from "@/components/faro/landing/FaroFooter";
import { FaroHeader } from "@/components/faro/landing/FaroHeader";
import { MotionBoot } from "@/components/web/MotionBoot";

export const metadata: Metadata = { title: "Estado · Faro", description: "Estado de Faro y de los servidores de ARCA para emitir comprobantes, en vivo." };

export default function EstadoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="site faro">
      <MotionBoot />
      <FaroHeader />
      <main id="contenido">{children}</main>
      <FaroFooter />
    </div>
  );
}
