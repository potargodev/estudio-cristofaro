import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/site/PageHeader";
import { Container } from "@/components/web/ui";
import { formatDate, getPosts } from "@/lib/data";

export const metadata: Metadata = {
  title: "Novedades de ARCA, impuestos y sueldos",
  description: "Vencimientos, cambios de ARCA y temas impositivos y laborales para PyMEs, explicados en simple.",
  alternates: { canonical: "/novedades" },
};

export default async function NovedadesPage() {
  const posts = await getPosts();
  return (
    <>
      <PageHeader eyebrow="Recursos" title="Novedades de ARCA, en simple." intro="Vencimientos, cambios normativos y temas impositivos y laborales que afectan a tu empresa." />
      <section aria-label="Artículos">
        <Container className="py-16 lg:py-24">
          {posts.length === 0 ? (
            <p className="text-paper/60">Todavía no hay novedades publicadas.</p>
          ) : (
            <ol className="border-t border-hair">
              {posts.map((p) => (
                <li key={p.id} className="border-b border-hair">
                  <Link href={`/novedades/${p.slug}`} className="group grid gap-3 py-10 lg:grid-cols-12 lg:items-baseline">
                    <span className="tabular text-[13px] text-paper/50 lg:col-span-2">{formatDate(p.published_at)}</span>
                    <span className="font-display text-[clamp(1.7rem,2.8vw,2.6rem)] leading-[1.08] text-paper transition-colors duration-500 group-hover:text-rose-light lg:col-span-6">
                      {p.title}
                    </span>
                    {p.excerpt && <span className="text-[15px] leading-relaxed text-paper/60 lg:col-span-4">{p.excerpt}</span>}
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </Container>
      </section>
    </>
  );
}
