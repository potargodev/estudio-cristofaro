import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/site/PageHeader";
import { Container, CtaLink, TextLink } from "@/components/web/ui";
import { AUDIENCES, getAudience } from "@/lib/audiences";
import { getModule } from "@/lib/modules/catalog";
import { SCHEDULE_HREF } from "@/lib/site";

// Landings por rubro (público del brief). Se renderizan en cada pedido (leen
// SITE_URL/SITE_NOINDEX en runtime); los slugs desconocidos dan 404. Las URLs
// de los segmentos viejos redirigen desde next.config.ts.

export async function generateMetadata({ params }: { params: Promise<{ segmento: string }> }): Promise<Metadata> {
  const { segmento } = await params;
  const a = getAudience(segmento);
  if (!a) return {};
  return { title: `Estudio contable para ${a.name.toLowerCase()}`, description: a.intro, alternates: { canonical: `/${a.slug}` } };
}

export default async function AudiencePage({ params }: { params: Promise<{ segmento: string }> }) {
  const { segmento } = await params;
  const a = getAudience(segmento);
  if (!a) notFound();
  const modules = a.modules.map((k) => getModule(k)).filter((m) => m !== undefined);
  const others = AUDIENCES.filter((x) => x.slug !== a.slug);

  return (
    <>
      <PageHeader eyebrow={a.name} title={a.title} intro={a.intro}>
        <div className="mt-10 flex flex-wrap items-center gap-6">
          <CtaLink href={SCHEDULE_HREF}>Agendar 20 minutos con el estudio</CtaLink>
          <TextLink href="/planes" className="text-[15px] text-paper">
            Ver planes
          </TextLink>
        </div>
      </PageHeader>

      {/* Hoy / Con Estudio Cristofaro */}
      <section aria-labelledby="hoy" className="on-paper bg-paper text-ink">
        <Container className="grid gap-14 py-20 lg:grid-cols-12 lg:py-28">
          <div className="lg:col-span-5">
            <h2 id="hoy" className="display-sm">
              Si te pasa esto
            </h2>
            <ul className="mt-10 border-t border-hair-ink text-[16px] text-muted">
              {a.pains.map((p) => (
                <li key={p} className="border-b border-hair-ink py-4">
                  {p}
                </li>
              ))}
            </ul>
          </div>
          <div className="lg:col-span-6 lg:col-start-7">
            <h2 className="display-sm">Esto es lo que resolvemos</h2>
            <ol className="mt-10 border-t border-hair-ink">
              {a.solves.map((s, i) => (
                <li key={s.title} className="grid grid-cols-[3rem_1fr] border-b border-hair-ink py-6">
                  <span className="tabular text-[13px] text-rose-deep">0{i + 1}</span>
                  <div>
                    <h3 className="text-[18px] text-ink">{s.title}</h3>
                    <p className="mt-2 text-[15px] leading-relaxed text-muted">{s.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </Container>
      </section>

      {/* Módulos recomendados */}
      <section aria-labelledby="modulos" className="border-b border-hair">
        <Container className="py-20 lg:py-28">
          <div className="grid gap-10 lg:grid-cols-12">
            <h2 id="modulos" className="display-sm text-paper lg:col-span-5">
              Módulos que más usan las {a.short}
            </h2>
            <p className="self-end text-[15px] leading-relaxed text-paper/60 lg:col-span-5 lg:col-start-8">
              Se suman a cualquier plan. Todos incluyen la plataforma, las alertas y un responsable asignado.
            </p>
          </div>
          <ul className="mt-14 grid border-t border-hair md:grid-cols-3">
            {modules.map((m, i) => (
              <li key={m.key} className="border-b border-hair py-8 md:border-b-0 md:border-r md:px-8 md:first:pl-0 md:last:border-r-0">
                <span className="tabular text-[12px] text-rose-light">0{i + 1}</span>
                <h3 className="mt-4 font-display text-[1.9rem] leading-tight text-paper">{m.name}</h3>
                <p className="mt-3 text-[15px] leading-relaxed text-paper/60">{m.description}</p>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      {/* Otros rubros */}
      <section aria-label="Otros rubros">
        <Container>
          <ul className="grid sm:grid-cols-3">
            {others.map((o) => (
              <li key={o.slug} className="border-b border-hair sm:border-b-0 sm:border-r sm:px-8 sm:first:pl-0 sm:last:border-r-0">
                <Link href={`/${o.slug}`} className="group block py-10">
                  <span className="text-[13px] text-paper/50">También trabajamos con</span>
                  <span className="mt-3 block font-display text-[1.8rem] leading-tight text-paper transition-colors group-hover:text-rose-light">{o.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Container>
      </section>
    </>
  );
}
