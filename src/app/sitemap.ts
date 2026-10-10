import type { MetadataRoute } from "next";
import { AUDIENCES } from "@/lib/audiences";
import { services } from "@/lib/content";
import { getPosts } from "@/lib/data";
import { getSiteUrl, isNoIndex } from "@/lib/runtime-config";

// Se genera en cada pedido para leer SITE_URL y SITE_NOINDEX del entorno
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Staging: sitemap vacío
  if (isNoIndex()) return [];
  const url = getSiteUrl();
  const posts = await getPosts();
  const staticPaths = ["", "/servicios", "/planes", "/equipo", "/novedades", "/preguntas-frecuentes", "/contacto", "/diagnostico", "/agendar", "/recursos/calendario", "/privacidad", "/faro"];
  return [
    ...staticPaths.map((p) => ({ url: `${url}${p}`, changeFrequency: "monthly" as const, priority: p === "" ? 1 : 0.7 })),
    ...AUDIENCES.map((s) => ({ url: `${url}/${s.slug}`, changeFrequency: "monthly" as const, priority: 0.9 })),
    ...services.map((s) => ({ url: `${url}/servicios/${s.slug}`, changeFrequency: "monthly" as const, priority: 0.8 })),
    ...posts.map((p) => ({
      url: `${url}/novedades/${p.slug}`,
      lastModified: p.published_at ? new Date(p.published_at) : undefined,
      changeFrequency: "yearly" as const,
      priority: 0.6,
    })),
  ];
}
