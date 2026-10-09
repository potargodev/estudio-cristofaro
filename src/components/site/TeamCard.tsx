import Image from "next/image";
import { Monogram } from "@/components/site/Logo";
import type { TeamMember } from "@/lib/content";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

/** Retrato con la especialidad que aparece al pasar el mouse (o con el foco) */
export function TeamCard({ member }: { member: TeamMember }) {
  return (
    <article className="group card-hover overflow-hidden rounded-md border border-line bg-surface shadow-brand-sm" tabIndex={0}>
      <div className="relative aspect-[4/5] overflow-hidden bg-navy">
        {member.photo ? (
          <Image
            src={member.photo}
            alt={`Retrato de ${member.name}`}
            fill
            sizes="(min-width: 768px) 33vw, 100vw"
            className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03] motion-reduce:transition-none"
          />
        ) : (
          <div className="grain grid h-full place-items-center bg-navy text-rose-light">
            <Monogram className="absolute size-40 opacity-10" />
            <span aria-hidden className="font-display text-7xl">
              {initials(member.name)}
            </span>
          </div>
        )}
        {/* Especialidad: sube desde abajo al pasar el mouse o con el foco del teclado */}
        <div className="absolute inset-x-0 bottom-0 translate-y-full bg-gradient-to-t from-navy-deep/95 to-navy-deep/70 p-5 text-paper transition-transform duration-300 ease-out group-hover:translate-y-0 group-focus-visible:translate-y-0 motion-reduce:transition-none">
          <p className="text-xs uppercase tracking-[0.14em] text-rose-light">Especialidad</p>
          <p className="mt-1 font-medium">{member.specialty}</p>
        </div>
      </div>
      <div className="p-6">
        <h2 className="text-lg font-semibold">{member.name}</h2>
        <p className="text-[15px] text-rose-deep">{member.role}</p>
        {member.detail && <p className="mt-1 text-sm text-muted">{member.detail}</p>}
        <p className="mt-3 text-[15px] leading-relaxed text-muted">{member.bio}</p>
        {/* En el celular (sin hover) la especialidad se ve siempre */}
        <p className="mt-3 text-sm text-ink/80 md:hidden">
          <span className="text-muted">Especialidad:</span> {member.specialty}
        </p>
      </div>
    </article>
  );
}
