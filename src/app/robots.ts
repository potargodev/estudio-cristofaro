import type { MetadataRoute } from "next";
import { getSiteUrl, isNoIndex } from "@/lib/runtime-config";

// Se genera en cada pedido para leer SITE_URL y SITE_NOINDEX del entorno
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  // Staging: no indexar nada
  if (isNoIndex()) return { rules: [{ userAgent: "*", disallow: "/" }] };
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin"] }],
    sitemap: `${getSiteUrl()}/sitemap.xml`,
  };
}
