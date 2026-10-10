import { and, asc, desc, eq } from "drizzle-orm";
import { cache } from "react";
import { getDb, isDbConfigured } from "@/db";
import { faqs, posts, service_plans, studios } from "@/db/schema";
import { defaultFaqs, defaultPosts } from "./content";
import type { Faq, Post } from "./types";

const STUDIO_SLUG = process.env.STUDIO_SLUG ?? "cristofaro";

/**
 * Corre una consulta de la web pública. Si la base no está configurada o no
 * responde (por ejemplo durante el `docker build`), devuelve el respaldo de
 * src/lib/content.ts: la web nunca se cae ni el build falla por la base.
 */
async function withFallback<T>(label: string, query: () => Promise<T>, fallback: T): Promise<T> {
  if (!isDbConfigured) return fallback;
  try {
    return await query();
  } catch (error) {
    console.warn(`[data] ${label}: la base no respondió, uso el contenido de respaldo.`, (error as Error).message);
    return fallback;
  }
}

/** Id del estudio activo (STUDIO_SLUG). Tira error si la base no responde. */
export const getStudioId = cache(async (): Promise<string | null> => {
  const [row] = await getDb().select({ id: studios.id }).from(studios).where(eq(studios.slug, STUDIO_SLUG)).limit(1);
  return row?.id ?? null;
});

function toPost(row: typeof posts.$inferSelect): Post {
  return { ...row, published_at: row.published_at?.toISOString() ?? null };
}

/** Precio publicado de cada plan del brief, por clave (service_plans.price_label) */
export async function getPlanPrices(): Promise<Record<string, string | null>> {
  return withFallback(
    "precios de planes",
    async () => {
      const studioId = await getStudioId();
      if (!studioId) return {};
      const rows = await getDb()
        .select({ key: service_plans.key, price: service_plans.price_label })
        .from(service_plans)
        .where(eq(service_plans.studio_id, studioId));
      return Object.fromEntries(rows.map((r) => [r.key, r.price?.trim() || null]));
    },
    {},
  );
}

export async function getFaqs(): Promise<Faq[]> {
  return withFallback(
    "preguntas",
    async () => {
      const studioId = await getStudioId();
      if (!studioId) return defaultFaqs;
      return getDb()
        .select()
        .from(faqs)
        .where(and(eq(faqs.studio_id, studioId), eq(faqs.published, true)))
        .orderBy(asc(faqs.position));
    },
    defaultFaqs,
  );
}

export async function getPosts(limit?: number): Promise<Post[]> {
  const fallback = limit ? defaultPosts.slice(0, limit) : defaultPosts;
  return withFallback(
    "novedades",
    async () => {
      const studioId = await getStudioId();
      if (!studioId) return fallback;
      const query = getDb()
        .select()
        .from(posts)
        .where(and(eq(posts.studio_id, studioId), eq(posts.published, true)))
        .orderBy(desc(posts.published_at));
      const rows = limit ? await query.limit(limit) : await query;
      return rows.map(toPost);
    },
    fallback,
  );
}

export async function getPost(slug: string): Promise<Post | null> {
  const fallback = defaultPosts.find((p) => p.slug === slug) ?? null;
  return withFallback(
    "novedad",
    async () => {
      const studioId = await getStudioId();
      if (!studioId) return fallback;
      const [row] = await getDb()
        .select()
        .from(posts)
        .where(and(eq(posts.studio_id, studioId), eq(posts.slug, slug), eq(posts.published, true)))
        .limit(1);
      return row ? toPost(row) : null;
    },
    fallback,
  );
}

export function formatDate(iso: string | Date | null) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "long", year: "numeric" }).format(new Date(iso));
}
