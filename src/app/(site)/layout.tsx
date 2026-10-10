import { SmoothScroll } from "@/components/motion/SmoothScroll";
import { Cursor } from "@/components/web/Cursor";
import { MotionBoot } from "@/components/web/MotionBoot";
import { PageTransitions } from "@/components/web/PageTransitions";
import { SiteFooter } from "@/components/web/SiteFooter";
import { SiteHeader } from "@/components/web/SiteHeader";
import { SiteTabBar } from "@/components/web/SiteTabBar";
import { Splash } from "@/components/web/Splash";
import { getSiteUrl } from "@/lib/runtime-config";
import { site } from "@/lib/site";

function getJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "AccountingService",
    name: site.name,
    url: getSiteUrl(),
    telephone: site.phone,
    email: site.email,
    description: site.description,
    areaServed: [
      { "@type": "City", name: "Ciudad Autónoma de Buenos Aires" },
      { "@type": "AdministrativeArea", name: "Gran Buenos Aires" },
    ],
    address: {
      "@type": "PostalAddress",
      addressLocality: "Ciudad Autónoma de Buenos Aires",
      addressCountry: "AR",
    },
    openingHours: "Mo-Fr 09:00-18:00",
    sameAs: [site.instagram, site.linkedin],
  };
}

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="site pb-[calc(64px+env(safe-area-inset-bottom))] lg:pb-0">
      <Splash />
      <MotionBoot />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(getJsonLd()) }} />
      <a href="#contenido" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:bg-paper focus:px-3 focus:py-2 focus:text-night">
        Saltar al contenido
      </a>
      <SiteHeader />
      <main id="contenido">{children}</main>
      <SiteFooter />
      <SiteTabBar />
      <SmoothScroll />
      <PageTransitions />
      <Cursor />
    </div>
  );
}
