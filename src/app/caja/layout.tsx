import type { Metadata } from "next";
import { FARO_APP_METADATA } from "@/lib/faro/pwa";

export const metadata: Metadata = { ...FARO_APP_METADATA, title: { absolute: "Caja compartida · Faro", template: "%s · Faro" }, robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Enlace de invitación a una caja compartida: se ve sin sesión (para crear la cuenta y sumarse) */
export default function CajaInvitacionLayout({ children }: { children: React.ReactNode }) {
  return <div className="app-ui min-h-dvh bg-canvas text-ink">{children}</div>;
}
