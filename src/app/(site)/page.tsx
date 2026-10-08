import Link from "next/link";
import { Reveal } from "@/components/motion/Reveal";
import { CtaBand } from "@/components/site/CtaBand";
import { Differentials } from "@/components/site/Differentials";
import { IndustriesMarquee } from "@/components/site/IndustriesMarquee";
import { MonthReceipt } from "@/components/site/MonthReceipt";
import { SegmentSelector } from "@/components/site/SegmentSelector";
import { StatsBand } from "@/components/site/StatsBand";
import { Button } from "@/components/ui/button";
import { segments, services, steps, testimonials } from "@/lib/content";
import { formatDate, getPosts } from "@/lib/data";

export const revalidate = 300;

export default async function HomePage() {
  const posts = await getPosts(2);

  return (
    <>
      {/* Hero */}
      <section className="overflow-hidden border-b border-line">
        <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 pb-16 pt-14 sm:px-6 md:grid-cols-[1.15fr_1fr] md:pb-24 md:pt-20">
          <div>
            <p className="text-[15px] text-muted">Estudio contable en CABA y Gran Buenos Aires</p>
            <h1 className="mt-4 text-[2.6rem] leading-[1.04] sm:text-6xl font-display">
              Tu contador, siempre al día. Sin papeles, sin sorpresas.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
              Llevamos impuestos, contabilidad y sueldos de monotributistas, PyMEs y sociedades con un abono fijo. Te
              avisamos antes de cada vencimiento y te respondemos en menos de 24 horas hábiles.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="xl">
                <Link href="/diagnostico">Pedir diagnóstico gratis</Link>
              </Button>
              <Button asChild size="xl" variant="outline">
                <Link href="/planes">Ver planes</Link>
              </Button>
            </div>
          </div>
          <MonthReceipt />
        </div>
      </section>

      {/* Selector de segmento */}
      <section className="border-b border-line">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 md:grid-cols-[1fr_1.6fr]">
          <div>
            <Reveal className="text-3xl font-display">¿Qué tipo de contribuyente sos?</Reveal>
            <p className="mt-3 max-w-sm text-muted">Elegí tu caso y te mostramos qué hacemos por vos.</p>
          </div>
          <SegmentSelector segments={segments} />
        </div>
      </section>

      {/* Diferenciales (bento) */}
      <Differentials />

      {/* El estudio en números */}
      <StatsBand />

      {/* Cómo trabajamos — es una secuencia real, por eso va numerada */}
      <section className="border-b border-line">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <Reveal className="text-3xl font-display">Cómo empezamos</Reveal>
          <ol className="mt-10 grid gap-8 md:grid-cols-4">
            {steps.map((s, i) => (
              <li key={s.title}>
                <span className="grid size-9 place-items-center rounded-full border border-rose font-display text-lg text-rose-deep">
                  {i + 1}
                </span>
                <h3 className="mt-4 text-lg font-semibold">{s.title}</h3>
                <p className="mt-1.5 leading-relaxed text-muted">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Servicios */}
      <section className="border-b border-line">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <Reveal className="text-3xl font-display">Servicios</Reveal>
            <Link href="/servicios" className="link-underline font-medium text-rose-deep">
              Ver todos los servicios
            </Link>
          </div>
          <div className="mt-8 grid gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
            {services.map((s) => (
              <Link key={s.slug} href={`/servicios/${s.slug}`} className="group bg-paper p-6 transition-colors duration-200 hover:bg-surface">
                <h3 className="flex items-center justify-between text-lg font-semibold">
                  {s.name}
                  <svg aria-hidden viewBox="0 0 24 24" className="size-5 text-rose-deep opacity-0 transition-[opacity,transform] duration-300 group-hover:translate-x-0.5 group-hover:opacity-100 motion-reduce:transition-none">
                    <path d="M5 12h14m-6-6 6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </h3>
                <p className="mt-2 text-[15px] leading-relaxed text-muted">{s.summary}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonios: solo si hay testimonios reales cargados */}
      {testimonials.length > 0 && (
        <section className="border-b border-line bg-surface">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <Reveal className="text-3xl font-display">Lo que dicen nuestros clientes</Reveal>
            <div className="mt-10 grid gap-10 md:grid-cols-3">
              {testimonials.map((t) => (
                <figure key={t.quote}>
                  <blockquote className="text-lg leading-relaxed">“{t.quote}”</blockquote>
                  <figcaption className="mt-4 text-sm text-muted">
                    <span className="font-medium text-ink">{t.author}</span>, {t.role}
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Novedades */}
      {posts.length > 0 && (
        <section className="border-b border-line">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <Reveal className="text-3xl font-display">Novedades</Reveal>
              <Link href="/novedades" className="link-underline font-medium text-rose-deep">
                Ver todas
              </Link>
            </div>
            <div className="mt-8 grid gap-8 md:grid-cols-2">
              {posts.map((p) => (
                <article key={p.id} className="border-t border-ink/80 pt-5">
                  <p className="text-sm text-muted">{formatDate(p.published_at)}</p>
                  <h3 className="mt-2 text-xl font-semibold leading-snug">
                    <Link href={`/novedades/${p.slug}`} className="transition-colors hover:text-rose-deep">
                      {p.title}
                    </Link>
                  </h3>
                  {p.excerpt && <p className="mt-2 leading-relaxed text-muted">{p.excerpt}</p>}
                </article>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Rubros de clientes */}
      <IndustriesMarquee />

      <CtaBand />
    </>
  );
}
