import { PublicShell } from "@/components/app/PublicShell";

/** Red de estudios: directorio público y neutral */
export default function RedLayout({ children }: { children: React.ReactNode }) {
  return (
    <PublicShell sub="Red de estudios" home="/red" wide>
      {children}
    </PublicShell>
  );
}
