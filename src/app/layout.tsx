import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { Archivo, Forum } from "next/font/google";
import { MotionProvider } from "@/components/motion/MotionProvider";
import { getSiteUrl, isNoIndex } from "@/lib/runtime-config";
import { site } from "@/lib/site";
import "./globals.css";

// Tipografías del manual de marca: Archivo para textos y Belgan Aesthetic para
// títulos. Forum queda como reemplazo de Belgan hasta cargar su licencia web.
const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-archivo",
  display: "swap",
});

const forum = Forum({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-forum",
  display: "swap",
});

// URL y modo staging se leen en cada pedido (SITE_URL, SITE_NOINDEX): por eso las
// páginas se renderizan en el servidor en runtime y no quedan fijadas en el build.
export async function generateMetadata(): Promise<Metadata> {
  await connection();
  return {
    metadataBase: new URL(getSiteUrl()),
    title: {
      default: `Estudio contable en CABA | ${site.name}`,
      template: `%s | ${site.name}`,
    },
    description: site.description,
    openGraph: {
      type: "website",
      locale: "es_AR",
      siteName: site.name,
      title: `${site.name} · Estudio contable en CABA`,
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
    <html lang="es-AR" className={`${archivo.variable} ${forum.variable}`}>
      <body className="min-h-dvh antialiased">
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
