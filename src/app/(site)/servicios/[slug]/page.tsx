import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CtaBand } from "@/components/site/CtaBand";
import { Reveal } from "@/components/motion/Reveal";
import { PageHeader } from "@/components/site/PageHeader";
import { segments, services } from "@/lib/content";

export const dynamicParams = false;

export function generateStaticParams() {
  return services.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const s = services.find((x) => x.slug === slug);
  if (!s) return {};
  return {
    title: `Servicio ${s.name.toLowerCase()} en CABA`,
    description: `${s.summary} ${s.items.slice(0, 3).join(", ")}.`,
    alternates: { canonical: `/servicios/${s.slug}` },
  };
}

export default async function ServicioPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const service = services.find((s) => s.slug === slug);
  if (!service) notFound();
  const forSegments = segments.filter((seg) => seg.services.includes(service.slug));

  return (
    <>
      <PageHeader eyebrow="Servicio" title={`Servicio ${service.name.toLowerCase()}`} intro={service.summary} />
      <section className="border-b border-line">
        <div className="mx-auto grid max-w-6xl gap-12 px-4 py-16 sm:px-6 md:grid-cols-[1.6fr_1fr]">
          <div>
            <Reveal className="text-2xl font-display">Qué incluye</Reveal>
            <ul className="mt-6 divide-y divide-line border-y border-line">
              {service.items.map((item) => (
                <li key={item} className="flex gap-3 py-4 leading-relaxed">
                  <svg aria-hidden viewBox="0 0 16 16" className="mt-1.5 size-4 shrink-0 text-rose-deep">
                    <path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <aside>
            <h2 className="text-lg font-semibold">Pensado para</h2>
            <ul className="mt-4 space-y-2">
              {forSegments.map((seg) => (
                <li key={seg.slug}>
                  <Link href={`/${seg.slug}`} className="link-underline text-rose-deep">
                    {seg.name}
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mt-8 rounded-md border border-line bg-surface p-5">
              <p className="font-medium">¿Tenés una duda puntual sobre este servicio?</p>
              <Link href="/contacto" className="link-underline mt-3 inline-block font-medium text-rose-deep">
                Escribinos
              </Link>
            </div>
          </aside>
        </div>
      </section>
      <CtaBand />
    </>
  );
}
