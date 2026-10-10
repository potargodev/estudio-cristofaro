import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { HelpFeedback } from "@/components/help/HelpFeedback";
import { HelpMarkdown } from "@/components/help/HelpMarkdown";
import { articleUrl, categoryName, getArticle, PROFILE_LABELS, relatedOf } from "@/modules/help/catalog";

type Params = Promise<{ categoria: string; slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { categoria, slug } = await params;
  const a = getArticle(categoria, slug);
  return a ? { title: a.titulo, description: a.resumen } : { title: "Artículo no encontrado" };
}

const day = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export default async function ArticuloPage({ params }: { params: Params }) {
  const { categoria, slug } = await params;
  const a = getArticle(categoria, slug);
  if (!a) notFound();
  const related = relatedOf(a);
  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_260px]">
      <article className="min-w-0">
        <nav aria-label="Ubicación" className="flex flex-wrap items-center gap-1.5 text-[13px] text-muted">
          <Link href="/ayuda" className="hover:text-ink">
            Ayuda
          </Link>
          <ChevronRight className="size-3.5" aria-hidden />
          <span>{categoryName(a.categoria)}</span>
        </nav>
        <h1 className="mt-3 font-display text-[34px] leading-tight sm:text-[44px]">{a.titulo}</h1>
        <p className="mt-2 text-[17px] text-muted">{a.resumen}</p>
        <p className="mt-4 flex flex-wrap gap-2 text-[12px] text-muted">
          {a.perfiles.map((p) => (
            <span key={p} className="rounded border border-line px-2 py-0.5">
              {PROFILE_LABELS[p]}
            </span>
          ))}
          <span className="px-1 py-0.5">Actualizado el {day.format(new Date(`${a.actualizado}T12:00:00Z`))}</span>
        </p>
        <div className="mt-6 border-t border-line pt-2">
          <HelpMarkdown text={a.body} />
        </div>
        <div className="mt-10">
          <HelpFeedback article={a.id} />
        </div>
      </article>
      <aside aria-labelledby="relacionados" className="lg:pt-24">
        <h2 id="relacionados" className="text-[13px] font-semibold uppercase tracking-[0.12em] text-muted">
          Relacionados
        </h2>
        <ul className="mt-3 grid gap-2">
          {related.map((r) => (
            <li key={r.id}>
              <Link href={articleUrl(r)} className="block rounded-md border border-line bg-surface px-4 py-3 text-[14px] hover:border-muted">
                <span className="block font-medium text-ink">{r.titulo}</span>
                <span className="block text-[12px] text-muted">{categoryName(r.categoria)}</span>
              </Link>
            </li>
          ))}
        </ul>
        <Link href="/ayuda" className="mt-4 inline-block text-[14px] font-medium underline-offset-4 hover:underline">
          Ver todos los artículos
        </Link>
      </aside>
    </div>
  );
}
