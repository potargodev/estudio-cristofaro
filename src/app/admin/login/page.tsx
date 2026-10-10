import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isDbConfigured } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./LoginForm";
import { homeFor } from "@/lib/roles";

export const metadata: Metadata = { title: "Ingresar", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  // Con una sesión válida no tiene sentido mostrar el login
  const user = isDbConfigured ? await getCurrentUser().catch(() => null) : null;
  if (user) redirect(homeFor(user.role));
  return <LoginForm />;
}
