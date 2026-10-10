import type { Metadata } from "next";
import { AppFrame } from "@/components/app/shell/AppFrame";
import { requireUser } from "@/modules/bitacora/session";

export const metadata: Metadata = { title: { default: "Bitácora", template: "%s · Bitácora" }, robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function BitacoraLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return (
    <AppFrame>
      <div className="mx-auto w-full max-w-4xl">{children}</div>
    </AppFrame>
  );
}
