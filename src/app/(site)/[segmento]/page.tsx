import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CtaBand } from "@/components/site/CtaBand";
import { PageHeader } from "@/components/site/PageHeader";
import { PlanCard } from "@/components/site/PlanCard";
import { segments, services } from "@/lib/content";
import { getPlans } from "@/lib/data";

export const revalidate = 300;
export const dynamicParams = false;

export function generateStaticParams() {
  return segments.map((s) => ({ segmento: s.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ segmento: string }> }): Promise<Metadata> {
  const { segmento } = await params;
  const s = segments.find((x) => x.slug === segmento);
  if (!s) return {};
  return { title: `Contador para ${s.name.toLowerCase()} en CABA`, description: s.intro, alternates: { canonical: `/${s.slug}` } };
}

export default async function SegmentPage({ params }: { params: Promise<{ segmento: string }> }) {
  const { segmento } = await params;
  const segment = segments.find((s) => s.slug === segmento);
  if (!segment) notFound();

  const plans = (await getPlans()).filter((p) => p.segment === segment.slug);
  const related = services.filter((s) => segment.services.includes(s.slug));

  return (
    <>
      <PageHeader title={segment.title} intro={segment.intro}>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href={`/diagnostico?tipo=${segment.contributorType}`}
            className="rounded-md bg-green px-5 py-3 font-medium text-paper hover:bg-green-deep"
          >
            Pedir diagnóstico gratis
          </Link>
        </div>
      </PageHeader>

      <section className="border-b border-line">
        <div className="mx-auto grid max-w-6xl gap-12 px-4 py-16 sm:px-6 md:grid-cols-2">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Si te pasa esto</h2>
            <ul className="mt-6 space-y-4">
              {segment.pains.map((p) => (
                <li key={p} className="border-l-2 border-line pl-4 leading-relaxed text-muted">
                  {p}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Esto es lo que hacemos</h2>
            <ul className="mt-6 space-y-3">
              {segment.includes.map((item) => (
                <li key={item} className="flex gap-3 leading-relaxed">
                  <svg aria-hidden viewBox="0 0 16 16" className="mt-1.5 size-4 shrink-0 text-green">
                    <path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {plans.length > 0 && (
        <section className="border-b border-line bg-surface/60">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <h2 className="text-2xl font-semibold tracking-tight">{plans.length > 1 ? "Planes" : "Plan"} para tu caso</h2>
            <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {plans.map((p) => (
                <PlanCard key={p.id} plan={p} />
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="border-b border-line">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <h2 className="text-lg font-semibold">Servicios relacionados</h2>
          <ul className="mt-4 flex flex-wrap gap-3">
            {related.map((s) => (
              <li key={s.slug}>
                <Link href={`/servicios/${s.slug}`} className="inline-block rounded-md border border-line bg-surface px-4 py-2 hover:border-green">
                  {s.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <CtaBand />
    </>
  );
}
