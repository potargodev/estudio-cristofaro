import type { Metadata } from "next";
import { Suspense } from "react";
import { EmbedBridge } from "@/components/vigia/EmbedBridge";
import { requireUser } from "@/modules/bitacora/session";

export const metadata: Metadata = { title: { absolute: "Vigía · Faro" }, robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Panel del Vigía (va dentro del panel lateral de la app): sin el marco, solo el Vigía del espacio */
export default async function VigiaPanelLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return (
    <div className="admin-shell app-ui min-h-dvh bg-canvas text-ink">
      <Suspense>
        <EmbedBridge />
      </Suspense>
      {children}
    </div>
  );
}
