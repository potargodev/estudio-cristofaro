import { AppOrPublic } from "@/components/app/shell/AppOrPublic";

export const dynamic = "force-dynamic";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppOrPublic sub="Legal" home="/legal/terminos">
      {children}
    </AppOrPublic>
  );
}
