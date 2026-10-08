import { cache } from "react";
import { createPublicClient } from "./supabase/server";
import { defaultFaqs, defaultPlans, defaultPosts } from "./content";
import type { Faq, Plan, Post } from "./types";

const STUDIO_SLUG = process.env.STUDIO_SLUG ?? "cristofaro";

export const getStudioId = cache(async (): Promise<string | null> => {
  const sb = createPublicClient();
  if (!sb) return null;
  const { data } = await sb.from("studios").select("id").eq("slug", STUDIO_SLUG).maybeSingle();
  return (data?.id as string | undefined) ?? null;
});

export async function getPlans(): Promise<Plan[]> {
  const sb = createPublicClient();
  const studioId = await getStudioId();
  if (!sb || !studioId) return defaultPlans;
  const { data, error } = await sb
    .from("plans")
    .select("*")
    .eq("studio_id", studioId)
    .eq("published", true)
    .order("position");
  if (error || !data) return defaultPlans;
  return data as Plan[];
}

export async function getFaqs(): Promise<Faq[]> {
  const sb = createPublicClient();
  const studioId = await getStudioId();
  if (!sb || !studioId) return defaultFaqs;
  const { data, error } = await sb
    .from("faqs")
    .select("*")
    .eq("studio_id", studioId)
    .eq("published", true)
    .order("position");
  if (error || !data) return defaultFaqs;
  return data as Faq[];
}

export async function getPosts(limit?: number): Promise<Post[]> {
  const sb = createPublicClient();
  const studioId = await getStudioId();
  if (!sb || !studioId) return limit ? defaultPosts.slice(0, limit) : defaultPosts;
  let query = sb
    .from("posts")
    .select("*")
    .eq("studio_id", studioId)
    .eq("published", true)
    .order("published_at", { ascending: false });
  if (limit) query = query.limit(limit);
  const { data, error } = await query;
  if (error || !data) return [];
  return data as Post[];
}

export async function getPost(slug: string): Promise<Post | null> {
  const sb = createPublicClient();
  const studioId = await getStudioId();
  if (!sb || !studioId) return defaultPosts.find((p) => p.slug === slug) ?? null;
  const { data } = await sb
    .from("posts")
    .select("*")
    .eq("studio_id", studioId)
    .eq("slug", slug)
    .eq("published", true)
    .maybeSingle();
  return (data as Post | null) ?? null;
}

export function formatDate(iso: string | null) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "long", year: "numeric" }).format(new Date(iso));
}
