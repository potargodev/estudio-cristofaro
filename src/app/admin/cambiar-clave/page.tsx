import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { ChangePasswordForm } from "./ChangePasswordForm";

export const metadata: Metadata = { title: "Cambiar contraseña", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function CambiarClavePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login");
  if (user.role === "cliente") redirect("/portal");
  if (!user.mustChangePassword) redirect("/admin");
  return <ChangePasswordForm email={user.email} />;
}
