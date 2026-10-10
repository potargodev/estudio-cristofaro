import type { Metadata } from "next";
import { AppFrame } from "@/components/app/shell/AppFrame";
import { requireUser } from "@/modules/bitacora/session";

export const metadata: Metadata = { title: { default: "Copiloto", template: "%s · Copiloto" }, robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function CopilotoLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return (
    <AppFrame>
      <div className="mx-auto w-full max-w-2xl">{children}</div>
    </AppFrame>
  );
}
