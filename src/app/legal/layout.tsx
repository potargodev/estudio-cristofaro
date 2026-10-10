import { PublicShell } from "@/components/app/PublicShell";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <PublicShell sub="Legal" home="/legal/terminos">
      {children}
    </PublicShell>
  );
}
