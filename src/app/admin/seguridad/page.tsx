import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";
import { getCurrentUser } from "@/lib/auth";
import { SetupForm } from "./SetupForm";

export const metadata: Metadata = { title: "Segundo factor", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Configuración obligatoria del segundo factor para el estudio (requireStaff manda acá) */
export default async function SeguridadPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login");
  if (user.role === "cliente") redirect("/portal");
  if (user.mustChangePassword) redirect("/admin/cambiar-clave");
  if (user.twoFactorEnabled) redirect("/admin");
  return (
    <AuthShell title="Activá el segundo factor" subtitle={user.email} wide>
      <SetupForm />
    </AuthShell>
  );
}
