import type { Metadata } from "next";
import { AppFrame } from "@/components/app/shell/AppFrame";
import { requirePersonal } from "@/lib/auth";
import { FARO_APP_METADATA } from "@/lib/faro/pwa";

export const metadata: Metadata = { ...FARO_APP_METADATA, title: { absolute: "Contador · Faro", template: "%s · Contador · Faro" }, robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Contador (espacio Personal, §2.o): tu conexión con un estudio, la Red y Flotas */
export default async function ContadorLayout({ children }: { children: React.ReactNode }) {
  await requirePersonal();
  return (
    <AppFrame space="personal">
      <div className="w-full">{children}</div>
    </AppFrame>
  );
}
