import { BadgeCheck, Clock, Languages, MapPin, Star, Users, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProposalForm } from "@/components/red/ProposalForm";
import { getCurrentUser } from "@/lib/auth";
import { INDUSTRY_NAMES } from "@/modules/industries/catalog";
import { labelOf, MODALITIES, RED_SERVICES, responseLabel, TEAM_SIZES } from "@/modules/red/catalog";
import { publicProfile } from "@/modules/red/server";

type Params = Promise<{ slug: string }>;
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const p = await publicProfile((await params).slug);
  return p ? { title: `${p.name} · Red de estudios`, description: p.p.headline ?? undefined } : { title: "Estudio no encontrado" };
}

const month = new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric" });

export default async function EstudioRedPage({ params }: { params: Params }) {
  const x = await publicProfile((await params).slug);
  if (!x) notFound();
  const user = await getCurrentUser().catch(() => null);
  const facts = [
    { icon: BadgeCheck, text: `Matrícula verificada · ${x.p.license_body}` },
    { icon: MapPin, text: `${[x.p.city, x.p.province].filter(Boolean).join(", ")} · ${labelOf(MODALITIES, x.p.modality)}` },
    { icon: Clock, text: responseLabel(x.responseHours) },
    { icon: Star, text: x.rating ? `${x.rating.avg.toFixed(1)} de 5 · ${x.rating.n} ${x.rating.n === 1 ? "reseña" : "reseñas"} de clientes verificados` : "Sin reseñas todavía" },
    ...(x.p.team_size ? [{ icon: Users, text: labelOf(TEAM_SIZES, x.p.team_size) }] : []),
    ...(x.p.fee_range ? [{ icon: Wallet, text: `Honorarios orientativos: ${x.p.fee_range}` }] : []),
    ...(x.p.languages.length ? [{ icon: Languages, text: x.p.languages.map((l) => l.charAt(0).toUpperCase() + l.slice(1)).join(", ") }] : []),
  ];
  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0">
        <Link href="/red" className="text-[13px] text-muted hover:text-ink">
          ← Red de estudios
        </Link>
        <div className="mt-4 flex items-start gap-4">
          <span aria-hidden className="grid size-16 shrink-0 place-items-center rounded-lg bg-navy font-display text-[30px] text-gold">
            {x.name.charAt(0)}
          </span>
          <div>
            <h1 className="font-display text-[34px] leading-tight sm:text-[44px]">{x.name}</h1>
            {x.p.headline && <p className="mt-1 text-[16px] text-muted">{x.p.headline}</p>}
          </div>
        </div>
        <ul className="mt-6 grid gap-2 text-[14px] sm:grid-cols-2">
          {facts.map((f) => (
            <li key={f.text} className="flex items-start gap-2">
              <f.icon className="mt-0.5 size-4 shrink-0 text-rose-deep" aria-hidden /> {f.text}
            </li>
          ))}
        </ul>
        {x.p.description && <p className="mt-6 whitespace-pre-line text-[15px] leading-relaxed">{x.p.description}</p>}
        <section className="mt-8">
          <h2 className="text-[17px] font-semibold">Servicios</h2>
          <p className="mt-2 flex flex-wrap gap-2">
            {x.p.services.map((s) => (
              <span key={s} className="rounded-md border border-line bg-surface px-2.5 py-1 text-[13px]">
                {labelOf(RED_SERVICES, s)}
              </span>
            ))}
          </p>
        </section>
        {x.p.industries.length > 0 && (
          <section className="mt-6">
            <h2 className="text-[17px] font-semibold">Rubros</h2>
            <p className="mt-2 flex flex-wrap gap-2">
              {x.p.industries.map((s) => (
                <span key={s} className="rounded-md border border-line bg-surface px-2.5 py-1 text-[13px]">
                  {INDUSTRY_NAMES[s] ?? s}
                </span>
              ))}
            </p>
          </section>
        )}
        <section className="mt-10" aria-labelledby="resenas">
          <h2 id="resenas" className="text-[17px] font-semibold">
            Reseñas de clientes verificados
          </h2>
          <p className="mt-1 text-[13px] text-muted">Solo pueden reseñar organizaciones que trabajan con el estudio en Faro hace al menos 30 días, una vez cada una. Faro las modera.</p>
          {x.reviews.length === 0 ? (
            <p className="mt-4 text-[14px] text-muted">Todavía no hay reseñas.</p>
          ) : (
            <ul className="mt-4 grid gap-3">
              {x.reviews.map((r) => (
                <li key={r.id} className="rounded-lg border border-line bg-surface p-4">
                  <p className="text-[13px] text-muted">
                    <span className="text-[15px] text-ink" aria-label={`${r.rating} de 5`}>
                      {"★".repeat(r.rating)}
                      <span className="text-line">{"★".repeat(5 - r.rating)}</span>
                    </span>{" "}
                    · {r.author_label} · cliente verificado · {month.format(r.created_at)}
                  </p>
                  <p className="mt-1.5 text-[14px]">{r.body}</p>
                  {r.response && (
                    <div className="mt-3 rounded-md border-l-4 border-rose-light bg-canvas px-3 py-2 text-[14px]">
                      <p className="text-[12px] font-medium text-muted">Respuesta del estudio</p>
                      <p className="mt-0.5">{r.response}</p>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <aside className="lg:sticky lg:top-20 lg:self-start">
        <div className="rounded-lg border border-line bg-surface p-5">
          <h2 className="text-[18px] font-semibold">Pedir propuesta</h2>
          {x.p.accepting_clients ? (
            <>
              <p className="mt-1 text-[14px] text-muted">El estudio te responde por mail. Solo compartimos lo que cargás acá, con tu consentimiento.</p>
              <ProposalForm studio={x.slug} name={user?.name ?? ""} email={user?.email ?? ""} />
            </>
          ) : (
            <p className="mt-1 text-[14px] text-muted">Este estudio no está tomando clientes nuevos por ahora.</p>
          )}
        </div>
      </aside>
    </div>
  );
}
