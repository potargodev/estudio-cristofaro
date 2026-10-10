import type { Metadata } from "next";

/** Metadatos de la app instalable de Faro (manifest, ícono de iPhone y título) */
export const FARO_APP_METADATA: Pick<Metadata, "manifest" | "icons" | "appleWebApp"> = {
  manifest: "/faro.webmanifest",
  icons: { apple: [{ url: "/icons/faro-apple-touch-icon.png", sizes: "180x180" }] },
  appleWebApp: { capable: true, title: "Faro", statusBarStyle: "black-translucent" },
};
