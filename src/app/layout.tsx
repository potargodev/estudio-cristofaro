import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { Archivo, Gilda_Display } from "next/font/google";
import { MotionProvider } from "@/components/motion/MotionProvider";
import { getSiteUrl, isNoIndex } from "@/lib/runtime-config";
import { site } from "@/lib/site";
import "./globals.css";

// Tipografías: Archivo para textos y UI; Gilda Display (serif elegante y sobria,
// elegida por el cliente en el rediseño en lugar de Forum) para titulares y
// números grandes.
const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-archivo",
  display: "swap",
});

const serif = Gilda_Display({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-serif",
  display: "swap",
});

// URL y modo staging se leen en cada pedido (SITE_URL, SITE_NOINDEX): por eso las
// páginas se renderizan en el servidor en runtime y no quedan fijadas en el build.
export async function generateMetadata(): Promise<Metadata> {
  await connection();
  return {
    metadataBase: new URL(getSiteUrl()),
    title: {
      default: `${site.name} · Contabilidad empresarial en CABA y GBA`,
      template: `%s | ${site.name}`,
    },
    description: site.description,
    openGraph: {
      type: "website",
      locale: "es_AR",
      siteName: site.name,
      title: `${site.name} · Contabilidad empresarial`,
      description: site.description,
    },
    alternates: { canonical: "/" },
    // Staging: <meta name="robots" content="noindex, nofollow"> en todas las páginas
    ...(isNoIndex() && { robots: { index: false, follow: false } }),
  };
}

export const viewport: Viewport = {
  themeColor: "#1c2235",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  await connection();
  return (
    <html lang="es-AR" className={`${archivo.variable} ${serif.variable}`}>
      <body className="min-h-dvh antialiased">
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
