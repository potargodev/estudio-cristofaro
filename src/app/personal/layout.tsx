import type { Metadata } from "next";
import { AppFrame } from "@/components/app/shell/AppFrame";
import { requirePersonal } from "@/lib/auth";
import { FARO_APP_METADATA } from "@/lib/faro/pwa";

export const metadata: Metadata = { ...FARO_APP_METADATA, title: { absolute: "Faro", template: "%s · Faro" }, robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Panel de la persona o del autónomo, en el marco de la app */
export default async function PersonalLayout({ children }: { children: React.ReactNode }) {
  await requirePersonal();
  return <AppFrame space="personal">{children}</AppFrame>;
}
