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

/** Retrato recto en duotono, con nombre, rol y especialidad debajo */
export function TeamCard({ member, index }: { member: TeamMember; index: number }) {
  return (
    <article className="group">
      <div className="duotone relative aspect-[4/5] overflow-hidden bg-navy">
        {member.photo ? (
          <Image
            src={member.photo}
            alt={`Retrato de ${member.name}`}
            fill
            sizes="(min-width: 1024px) 30vw, (min-width: 640px) 50vw, 100vw"
            className="object-cover transition-transform duration-1000 ease-[var(--ease-expo)] group-hover:scale-[1.03]"
          />
        ) : (
          <div className="relative grid h-full place-items-center text-rose-light">
            <Monogram className="absolute size-48 opacity-[0.08]" />
            <span aria-hidden className="font-display text-7xl">
              {initials(member.name)}
            </span>
          </div>
        )}
      </div>
      <div className="mt-6 border-t border-hair pt-5">
        <p className="tabular text-[12px] text-rose-light">0{index + 1}</p>
        <h2 className="mt-2 font-display text-[1.9rem] leading-tight text-paper">{member.name}</h2>
        <p className="mt-1 text-[14px] text-paper/70">{member.role}</p>
        {member.detail && <p className="mt-1 text-[13px] text-paper/55">{member.detail}</p>}
        <p className="mt-4 text-[15px] leading-relaxed text-paper/65">{member.bio}</p>
        <p className="mt-4 border-l border-rose-light pl-3 text-[14px] text-paper/80">{member.specialty}</p>
      </div>
    </article>
  );
}
