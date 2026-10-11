import type { Metadata } from "next";
import { AppFrame } from "@/components/app/shell/AppFrame";
import { requireUser } from "@/modules/bitacora/session";
import { FARO_APP_METADATA } from "@/lib/faro/pwa";

export const metadata: Metadata = { ...FARO_APP_METADATA, title: { absolute: "Mis cajas · Faro", template: "%s · Mis cajas · Faro" }, robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Mis cajas (espacio Personal, principios §17): personal, negocio y compartidas */
export default async function CajasLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return (
    <AppFrame space="personal">
      <div className="w-full">{children}</div>
    </AppFrame>
  );
}
