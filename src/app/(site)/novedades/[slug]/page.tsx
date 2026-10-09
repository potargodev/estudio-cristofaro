import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CtaBand } from "@/components/site/CtaBand";
import { formatDate, getPost } from "@/lib/data";

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
      <article className="border-b border-line">
        <div className="mx-auto max-w-2xl px-4 pb-16 pt-14 sm:px-6 sm:pt-20">
          <Link href="/novedades" className="link-underline text-sm text-rose-deep">
            Novedades
          </Link>
          <h1 className="mt-4 text-4xl leading-[1.1] font-display">{post.title}</h1>
          <p className="mt-4 text-sm text-muted">{formatDate(post.published_at)}</p>
          {post.excerpt && <p className="mt-6 text-xl leading-relaxed text-muted">{post.excerpt}</p>}
          <div className="prose-body mt-8 text-[17px]">
            {post.body
              .split(/\n\s*\n/)
              .filter(Boolean)
              .map((para, i) => (
                <p key={i}>{para}</p>
              ))}
          </div>
        </div>
      </article>
      <CtaBand />
    </>
  );
}
