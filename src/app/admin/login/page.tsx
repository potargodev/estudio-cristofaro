import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isDbConfigured } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Ingresar", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  // Con una sesión válida no tiene sentido mostrar el login
  if (isDbConfigured && (await getCurrentUser().catch(() => null))) redirect("/admin");
  return <LoginForm />;
}
