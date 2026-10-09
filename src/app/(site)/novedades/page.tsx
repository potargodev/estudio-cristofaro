import type { Metadata } from "next";
import Link from "next/link";
import { CtaBand } from "@/components/site/CtaBand";
import { PageHeader } from "@/components/site/PageHeader";
import { formatDate, getPosts } from "@/lib/data";

export const metadata: Metadata = {
  title: "Novedades impositivas y laborales",
  description: "Vencimientos, cambios de ARCA y temas contables explicados en simple.",
  alternates: { canonical: "/novedades" },
};

export default async function NovedadesPage() {
  const posts = await getPosts();
  return (
    <>
      <PageHeader title="Novedades" intro="Vencimientos, cambios de ARCA y temas impositivos y laborales, explicados en simple." />
      <section className="border-b border-line">
        <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
          {posts.length === 0 ? (
            <p className="text-muted">Todavía no hay novedades publicadas.</p>
          ) : (
            <ul className="divide-y divide-line">
              {posts.map((p) => (
                <li key={p.id} className="py-8">
                  <p className="text-sm text-muted">{formatDate(p.published_at)}</p>
                  <h2 className="mt-2 text-2xl leading-snug font-display">
                    <Link href={`/novedades/${p.slug}`} className="transition-colors hover:text-rose-deep">
                      {p.title}
                    </Link>
                  </h2>
                  {p.excerpt && <p className="mt-2 leading-relaxed text-muted">{p.excerpt}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
      <CtaBand />
    </>
  );
}
