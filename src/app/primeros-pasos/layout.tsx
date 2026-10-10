import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppFrame } from "@/components/app/shell/AppFrame";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Primeros pasos", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function FirstStepsLayout({ children }: { children: React.ReactNode }) {
  if (!(await getCurrentUser())) redirect("/ingresar");
  return (
    <AppFrame>
      <div className="mx-auto w-full max-w-2xl">{children}</div>
    </AppFrame>
  );
}
