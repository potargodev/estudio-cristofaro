import type { Metadata } from "next";
import { AppFrame } from "@/components/app/shell/AppFrame";
import { requireFaro } from "@/lib/auth";

export const metadata: Metadata = { title: { default: "Faro Manager", template: "%s · Faro Manager" }, robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Faro Manager: solo el nivel plataforma (faro_owner y faro_support, con 2FA), en el mismo marco de la app */
export default async function FaroManagerLayout({ children }: { children: React.ReactNode }) {
  await requireFaro();
  return <AppFrame space="faro">{children}</AppFrame>;
}
