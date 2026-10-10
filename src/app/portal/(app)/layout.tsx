import type { Metadata } from "next";
import { AppFrame } from "@/components/app/shell/AppFrame";
import { requireMember } from "@/lib/auth";

export const metadata: Metadata = {
  title: { default: "Tu portal", template: "%s · Tu portal" },
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/** Portal de la organización: el mismo marco de la app, con la marca del estudio */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  await requireMember();
  return <AppFrame space="portal">{children}</AppFrame>;
}
