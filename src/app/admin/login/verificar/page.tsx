import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/AuthShell";
import { VerifyForm } from "./VerifyForm";

export const metadata: Metadata = { title: "Segundo factor", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default function VerificarPage() {
  return (
    <AuthShell title="Segundo factor" subtitle="Estudio Cristofaro">
      <VerifyForm />
    </AuthShell>
  );
}
