import Link from "next/link";
import { LineIcon, type LineIconName } from "@/components/icons/LineIcon";
import { Reveal } from "@/components/motion/Reveal";
import { CtaBand } from "@/components/site/CtaBand";
import { HeroSlider } from "@/components/site/HeroSlider";
import { Differentials } from "@/components/site/Differentials";
import { IndustriesMarquee } from "@/components/site/IndustriesMarquee";
import { MonthReceipt } from "@/components/site/MonthReceipt";
import { SegmentSelector } from "@/components/site/SegmentSelector";
import { StatsBand } from "@/components/site/StatsBand";
import { Button } from "@/components/ui/button";
import { segments, services, steps, testimonials } from "@/lib/content";
import { formatDate, getPosts } from "@/lib/data";
import { HERO_INTERVAL, HERO_SLIDES } from "@/lib/hero";
import { SCHEDULE_HREF } from "@/lib/site";

const SERVICE_ICONS: Record<string, LineIconName> = { contable: "libro", impositivo: "impuestos", laboral: "sueldos", societario: "sociedad" };
const STEP_ICONS: LineIconName[] = ["lupa", "documento", "calendario", "grafico"];

export default async function HomePage() {
  const posts = await getPosts(2);

  return (
    <>
      {/* Hero: fotos a sangre completa con el texto fijo */}
      <HeroSlider slides={HERO_SLIDES} interval={HERO_INTERVAL}>
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-10 pt-[64vw] sm:px-6 md:min-h-[min(86vh,780px)] md:grid-cols-[1.1fr_1fr] md:pb-24 md:pt-24">
          <div>
            <p className="text-[15px] text-rose-light">Estudio contable en CABA y Gran Buenos Aires</p>
            <h1 className="mt-4 font-display text-[2.6rem] leading-[1.04] text-paper sm:text-6xl">
              Tu contador, siempre al día. Sin papeles, sin sorpresas.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-paper/85">
              Llevamos impuestos, contabilidad y sueldos de monotributistas, PyMEs y sociedades con un abono fijo. Te avisamos antes de cada
              vencimiento y te respondemos en menos de 24 horas hábiles.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="xl" className="bg-paper text-navy hover:bg-rose-soft">
                <Link href="/diagnostico">Pedir diagnóstico gratis</Link>
              </Button>
              <Button asChild size="xl" variant="outline" className="border-paper/40 bg-transparent text-paper hover:bg-paper/10 hover:text-paper">
                <Link href={SCHEDULE_HREF}>Agendar una llamada</Link>
              </Button>
            </div>
          </div>
          <div className="hidden md:block md:[perspective:1400px]">
            <div className="text-ink md:translate-y-6 md:[transform:rotateY(-8deg)_rotateX(4deg)] md:drop-shadow-[0_40px_60px_rgba(8,10,20,0.55)]">
              <MonthReceipt />
            </div>
          </div>
        </div>
      </HeroSlider>

      {/* Resumen mensual: en el celular va debajo del hero, flotando sobre el corte */}
      <div className="relative z-10 -mt-2 px-4 pb-4 md:hidden">
        <div className="-mt-6 drop-shadow-[0_26px_40px_rgba(20,24,38,0.35)]">
          <MonthReceipt />
        </div>
      </div>

      {/* Selector de segmento */}
      <section>
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 md:grid-cols-[1fr_1.6fr]">
          <div>
            <Reveal className="text-3xl font-display sm:text-4xl">¿Qué tipo de contribuyente sos?</Reveal>
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
      <section>
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <Reveal className="text-3xl font-display sm:text-4xl">Cómo empezamos</Reveal>
          <ol className="mt-12 grid gap-10 md:grid-cols-4 md:gap-8">
            {steps.map((s, i) => (
              <li key={s.title} className="relative">
                <div className="flex items-end justify-between border-b border-rose/30 pb-4">
                  <LineIcon name={STEP_ICONS[i]} className="size-9 text-navy" />
                  {/* Número decorativo en un pseudo-elemento: el paso ya lo dice el título */}
                  <span
                    aria-hidden
                    data-n={String(i + 1).padStart(2, "0")}
                    className="font-display text-6xl leading-none text-rose/35 before:content-[attr(data-n)]"
                  />
                </div>
                <h3 className="mt-5 text-lg font-semibold">
                  <span className="sr-only">Paso {i + 1}: </span>
                  {s.title}
                </h3>
                <p className="mt-1.5 leading-relaxed text-muted">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Servicios: sección oscura con grano */}
      <section className="grain bg-navy text-paper">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <Reveal className="text-3xl font-display sm:text-4xl">Servicios</Reveal>
            <Link href="/servicios" className="link-underline font-medium text-rose-light">
              Ver todos los servicios
            </Link>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {services.map((s) => (
              <Link
                key={s.slug}
                href={`/servicios/${s.slug}`}
                className="group card-hover flex flex-col rounded-md border border-paper/10 bg-paper/[0.04] p-6 hover:border-rose-light/50 hover:bg-paper/[0.07]"
              >
                <LineIcon name={SERVICE_ICONS[s.slug] ?? "documento"} className="size-10 text-paper" />
                <h3 className="mt-6 flex items-center justify-between text-lg font-semibold">
                  {s.name}
                  <svg
                    aria-hidden
                    viewBox="0 0 24 24"
                    className="size-5 text-rose-light opacity-0 transition-[opacity,transform] duration-300 group-hover:translate-x-0.5 group-hover:opacity-100 motion-reduce:transition-none"
                  >
                    <path
                      d="M5 12h14m-6-6 6 6-6 6"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </h3>
                <p className="mt-2 text-[15px] leading-relaxed text-paper/75">{s.summary}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonios: solo si hay testimonios reales cargados */}
      {testimonials.length > 0 && (
        <section className="bg-surface">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <Reveal className="text-3xl font-display sm:text-4xl">Lo que dicen nuestros clientes</Reveal>
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
        <section>
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <Reveal className="text-3xl font-display sm:text-4xl">Novedades</Reveal>
              <Link href="/novedades" className="link-underline font-medium text-rose-deep">
                Ver todas
              </Link>
            </div>
            <div className="mt-8 grid gap-8 md:grid-cols-2">
              {posts.map((p) => (
                <article key={p.id} className="card-hover rounded-md bg-surface p-6 shadow-brand-sm">
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

      <hr className="divider-rose mx-auto max-w-6xl" />

      {/* Rubros de clientes */}
      <IndustriesMarquee />

      <CtaBand />
    </>
  );
}
