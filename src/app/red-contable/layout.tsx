import { ContadorTabs } from "@/components/app/ContadorTabs";
import { AppOrPublic } from "@/components/app/shell/AppOrPublic";

/** Red Contable: directorio público y neutral */
export const dynamic = "force-dynamic";

export default function RedLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppOrPublic sub="Red Contable" home="/red-contable" wide space="personal">
      <ContadorTabs />
      {children}
    </AppOrPublic>
  );
}
