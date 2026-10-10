import type { Metadata } from "next";
import { AppFrame } from "@/components/app/shell/AppFrame";
import { requireUser } from "@/modules/bitacora/session";
import { FARO_APP_METADATA } from "@/lib/faro/pwa";

export const metadata: Metadata = { ...FARO_APP_METADATA, title: { absolute: "Vigía · Faro", template: "%s · Vigía · Faro" }, robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function VigíaLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return (
    <AppFrame>
      <div className="mx-auto w-full max-w-2xl">{children}</div>
    </AppFrame>
  );
}
