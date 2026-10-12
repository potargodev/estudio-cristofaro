import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MaskText } from "@/components/web/MaskText";
import { getPost } from "@/lib/data";
import { formatDate } from "@/lib/format";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) return {};
  return {
    title: post.title,
    description: post.excerpt ?? undefined,
    alternates: { canonical: `/novedades/${post.slug}` },
    openGraph: { type: "article", title: post.title, description: post.excerpt ?? undefined },
  };
}

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) notFound();

  return (
    <>
      <article>
        <div className="mx-auto max-w-3xl px-5 pb-24 pt-36 sm:px-8 lg:pt-48">
          <p className="flex items-center gap-3 text-meta text-paper/60">
            <span aria-hidden className="h-px w-8 bg-rose-light" />
            <Link href="/novedades" className="u-draw pb-0.5">
              Novedades
            </Link>
            <span aria-hidden>·</span>
            <span className="tabular">{formatDate(post.published_at, "long")}</span>
          </p>
          <MaskText className="display-sm mt-8 text-paper">{post.title}</MaskText>
          {post.excerpt && <p className="mt-8 border-t border-hair pt-6 text-section leading-relaxed text-paper/70">{post.excerpt}</p>}
          <div className="prose-body mt-10 text-title text-paper/85">
            {post.body
              .split(/\n\s*\n/)
              .filter(Boolean)
              .map((para, i) => (
                <p key={i}>{para}</p>
              ))}
          </div>
        </div>
      </article>
    </>
  );
}
