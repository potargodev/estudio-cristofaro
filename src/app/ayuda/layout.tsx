import type { Metadata } from "next";
import { PublicShell } from "@/components/app/PublicShell";

export const metadata: Metadata = {
  title: { default: "Centro de ayuda · Faro", template: "%s · Ayuda de Faro" },
  description: "Guías cortas para usar Faro: registro, planes, organizaciones, vencimientos, documentos, grupos de gastos, IA, Flotas y la Red de estudios.",
};

/** Centro de ayuda público: se lee sin cuenta y también desde cada app */
export default function AyudaLayout({ children }: { children: React.ReactNode }) {
  return (
    <PublicShell sub="Ayuda" home="/ayuda">
      {children}
    </PublicShell>
  );
}
