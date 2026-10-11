import type { Metadata } from "next";
import { AppFrame } from "@/components/app/shell/AppFrame";
import { requireUser } from "@/modules/bitacora/session";
import { FARO_APP_METADATA } from "@/lib/faro/pwa";

export const metadata: Metadata = { ...FARO_APP_METADATA, title: { absolute: "Faro", template: "%s · Faro" }, robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Espacio personal (Inicio, cuenta y plan): para cualquier persona con sesión; cuenta y plan exigen además una cuenta personal */
export default async function PersonalLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return <AppFrame space="personal">{children}</AppFrame>;
}
