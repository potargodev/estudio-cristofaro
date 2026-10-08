import type { MetadataRoute } from "next";
import { segments, services } from "@/lib/content";
import { getPosts } from "@/lib/data";
import { site } from "@/lib/site";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const posts = await getPosts();
  const staticPaths = ["", "/servicios", "/planes", "/equipo", "/novedades", "/preguntas-frecuentes", "/contacto", "/diagnostico"];
  return [
    ...staticPaths.map((p) => ({ url: `${site.url}${p}`, changeFrequency: "monthly" as const, priority: p === "" ? 1 : 0.7 })),
    ...segments.map((s) => ({ url: `${site.url}/${s.slug}`, changeFrequency: "monthly" as const, priority: 0.9 })),
    ...services.map((s) => ({ url: `${site.url}/servicios/${s.slug}`, changeFrequency: "monthly" as const, priority: 0.8 })),
    ...posts.map((p) => ({
      url: `${site.url}/novedades/${p.slug}`,
      lastModified: p.published_at ? new Date(p.published_at) : undefined,
      changeFrequency: "yearly" as const,
      priority: 0.6,
    })),
  ];
}
