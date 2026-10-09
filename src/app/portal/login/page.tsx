import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isDbConfigured } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { PortalLoginForm } from "./PortalLoginForm";

export const metadata: Metadata = { title: "Ingresar al portal", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function PortalLoginPage() {
  const user = isDbConfigured ? await getCurrentUser().catch(() => null) : null;
  // El staff no usa el portal
  if (user) redirect(user.role === "cliente" ? "/portal" : "/admin");
  return <PortalLoginForm />;
}
