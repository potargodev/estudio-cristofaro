import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/site/PageHeader";
import { Container, CtaLink, TextLink } from "@/components/web/ui";
import { AUDIENCES } from "@/lib/audiences";
import { services } from "@/lib/content";
import { SCHEDULE_HREF } from "@/lib/site";

// Se renderiza en cada pedido (lee SITE_URL/SITE_NOINDEX en runtime). Los slugs
// desconocidos dan 404 por el notFound() de la página.

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const s = services.find((x) => x.slug === slug);
  if (!s) return {};
  return {
    title: `${s.name} para PyMEs de servicios`,
    description: `${s.summary} ${s.items.slice(0, 3).join(", ")}.`,
    alternates: { canonical: `/servicios/${s.slug}` },
  };
}

export default async function ServicioPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const service = services.find((s) => s.slug === slug);
  if (!service) notFound();
  const others = services.filter((s) => s.slug !== service.slug);

  return (
    <>
      <PageHeader eyebrow="Servicio" title={service.name} intro={service.summary} />
      <section aria-labelledby="incluye">
        <Container className="grid gap-14 py-20 lg:grid-cols-12 lg:py-28">
          <div className="lg:col-span-7">
            <h2 id="incluye" className="display-sm text-paper">
              Qué incluye
            </h2>
            <ol className="mt-10 border-t border-hair">
              {service.items.map((item, i) => (
                <li key={item} className="grid grid-cols-[3rem_1fr] border-b border-hair py-5 text-[16px] text-paper/85">
                  <span className="tabular text-[13px] text-rose-light">0{i + 1}</span>
                  {item}
                </li>
              ))}
            </ol>
          </div>
          <aside className="lg:col-span-4 lg:col-start-9">
            <h2 className="text-[13px] text-paper/55">Pensado para</h2>
            <ul className="mt-4 border-t border-hair">
              {AUDIENCES.map((a) => (
                <li key={a.slug} className="border-b border-hair">
                  <Link href={`/${a.slug}`} className="block py-3.5 text-[15px] text-paper/85 transition-colors hover:text-rose-light">
                    {a.name}
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mt-12 border border-hair-strong p-6">
              <p className="font-display text-2xl leading-tight text-paper">¿Tenés una duda puntual sobre {service.name.toLowerCase()}?</p>
              <div className="mt-6 flex flex-wrap items-center gap-5">
                <CtaLink href={SCHEDULE_HREF} magnetic={false}>
                  Agendar una llamada
                </CtaLink>
                <TextLink href="/contacto" className="text-[15px]">
                  Escribinos
                </TextLink>
              </div>
            </div>
          </aside>
        </Container>
      </section>
      <section aria-label="Otros servicios" className="border-t border-hair">
        <Container>
          <ul className="grid sm:grid-cols-3">
            {others.map((s) => (
              <li key={s.slug} className="border-b border-hair sm:border-b-0 sm:border-r sm:px-8 sm:first:pl-0 sm:last:border-r-0">
                <Link href={`/servicios/${s.slug}`} className="group block py-10">
                  <span className="text-[13px] text-paper/55">Otro servicio</span>
                  <span className="mt-3 block font-display text-[2rem] leading-none text-paper transition-colors group-hover:text-rose-light">{s.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Container>
      </section>
    </>
  );
}
