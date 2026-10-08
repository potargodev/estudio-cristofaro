import Link from "next/link";
import { CtaBand } from "@/components/site/CtaBand";
import { MonthReceipt } from "@/components/site/MonthReceipt";
import { differentials, segments, services, steps, testimonials } from "@/lib/content";
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
            <h1 className="mt-4 text-[2.6rem] font-semibold leading-[1.04] tracking-[-0.025em] sm:text-6xl">
              Tu contador, siempre al día. Sin papeles, sin sorpresas.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
              Llevamos impuestos, contabilidad y sueldos de monotributistas, PyMEs y sociedades con un abono fijo. Te
              avisamos antes de cada vencimiento y te respondemos en menos de 24 horas hábiles.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/diagnostico" className="rounded-md bg-green px-5 py-3 font-medium text-paper hover:bg-green-deep">
                Pedir diagnóstico gratis
              </Link>
              <Link href="/planes" className="rounded-md border border-ink/20 px-5 py-3 font-medium hover:bg-surface">
                Ver planes
              </Link>
            </div>
          </div>
          <MonthReceipt />
        </div>
      </section>

      {/* Selector de segmento */}
      <section className="border-b border-line">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 md:grid-cols-[1fr_1.6fr]">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight">¿Qué tipo de contribuyente sos?</h2>
            <p className="mt-3 max-w-sm text-muted">Elegí tu caso y te mostramos qué hacemos por vos.</p>
          </div>
          <ul className="border-t border-ink/80">
            {segments.map((s) => (
              <li key={s.slug} className="border-b border-line">
                <Link
                  href={`/${s.slug}`}
                  className="group flex items-center justify-between gap-6 py-5 transition-colors hover:bg-surface sm:px-3"
                >
                  <span>
                    <span className="block text-xl font-medium">{s.question}</span>
                    <span className="mt-1 block text-[15px] text-muted">{s.title}</span>
                  </span>
                  <svg aria-hidden viewBox="0 0 24 24" className="size-6 shrink-0 text-green transition-transform group-hover:translate-x-1">
                    <path d="M5 12h14m-6-6 6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Diferenciales */}
      <section className="border-b border-line bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="max-w-2xl text-3xl font-semibold tracking-tight">Lo que cambia cuando trabajás con nosotros</h2>
          <dl className="mt-10 grid gap-x-12 gap-y-8 sm:grid-cols-2">
            {differentials.map((d) => (
              <div key={d.title} className="border-l-2 border-green pl-5">
                <dt className="text-lg font-semibold">{d.title}</dt>
                <dd className="mt-1.5 leading-relaxed text-muted">{d.text}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Cómo trabajamos — es una secuencia real, por eso va numerada */}
      <section className="border-b border-line">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-3xl font-semibold tracking-tight">Cómo empezamos</h2>
          <ol className="mt-10 grid gap-8 md:grid-cols-4">
            {steps.map((s, i) => (
              <li key={s.title}>
                <span className="grid size-9 place-items-center rounded-full border border-green text-sm font-semibold text-green">
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
            <h2 className="text-3xl font-semibold tracking-tight">Servicios</h2>
            <Link href="/servicios" className="font-medium text-green underline-offset-4 hover:underline">
              Ver todos los servicios
            </Link>
          </div>
          <div className="mt-8 grid gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
            {services.map((s) => (
              <Link key={s.slug} href={`/servicios/${s.slug}`} className="bg-paper p-6 hover:bg-surface">
                <h3 className="text-lg font-semibold">{s.name}</h3>
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
            <h2 className="text-3xl font-semibold tracking-tight">Lo que dicen nuestros clientes</h2>
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
              <h2 className="text-3xl font-semibold tracking-tight">Novedades</h2>
              <Link href="/novedades" className="font-medium text-green underline-offset-4 hover:underline">
                Ver todas
              </Link>
            </div>
            <div className="mt-8 grid gap-8 md:grid-cols-2">
              {posts.map((p) => (
                <article key={p.id} className="border-t border-ink/80 pt-5">
                  <p className="text-sm text-muted">{formatDate(p.published_at)}</p>
                  <h3 className="mt-2 text-xl font-semibold leading-snug">
                    <Link href={`/novedades/${p.slug}`} className="hover:text-green">
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

      <CtaBand />
    </>
  );
}
