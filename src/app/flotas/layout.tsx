import type { Metadata } from "next";
import { AppFrame } from "@/components/app/shell/AppFrame";
import { requirePersonal } from "@/lib/auth";

export const metadata: Metadata = { title: { default: "Flotas", template: "%s · Flotas" }, robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Flotas: grupos informales que piden juntos una propuesta a un estudio */
export default async function FlotasLayout({ children }: { children: React.ReactNode }) {
  await requirePersonal();
  return <AppFrame>{children}</AppFrame>;
}
