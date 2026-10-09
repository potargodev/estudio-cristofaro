import { SmoothScroll } from "@/components/motion/SmoothScroll";
import { Footer } from "@/components/site/Footer";
import { Header } from "@/components/site/Header";
import { WhatsAppButton } from "@/components/site/WhatsAppButton";
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
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(getJsonLd()) }} />
      <a href="#contenido" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:bg-surface focus:px-3 focus:py-2">
        Saltar al contenido
      </a>
      <Header />
      <main id="contenido">{children}</main>
      <Footer />
      <WhatsAppButton />
      <SmoothScroll />
    </>
  );
}
