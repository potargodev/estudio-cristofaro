import { BadgeCheck, Clock, MapPin, Star } from "lucide-react";
import Link from "next/link";
import { labelOf, MODALITIES, RED_SERVICES, responseLabel } from "@/modules/red/catalog";
import type { publicDirectory } from "@/modules/red/server";
import { formatNumber } from "@/lib/format";

type Entry = Awaited<ReturnType<typeof publicDirectory>>[number];

/** Tarjeta de un estudio en la Red Contable (la misma en la web, en Personal y en el estudio) */
export function StudioCard({ x, href }: { x: Entry; href: string }) {
  return (
    <Link href={href} className="block h-full rounded-md border border-line bg-surface p-4 transition-colors hover:border-navy/40 sm:p-5" data-estudio={x.slug}>
      <div className="flex items-start gap-3">
        <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full border border-line font-display text-section text-rose-deep">
          {x.name.charAt(0)}
        </span>
        <div className="min-w-0">
          <h2 className="text-title font-semibold text-ink">{x.name}</h2>
          {x.profile.headline && <p className="text-ui text-muted">{x.profile.headline}</p>}
        </div>
      </div>
      <ul className="mt-4 grid gap-1.5 text-meta text-ink">
        <li className="flex items-center gap-1.5">
          <BadgeCheck className="size-4 shrink-0 text-rose-deep" aria-hidden /> Matrícula verificada · {x.profile.license_body}
        </li>
        <li className="flex items-center gap-1.5">
          <MapPin className="size-4 shrink-0 text-muted" aria-hidden /> {[x.profile.city, x.profile.province].filter(Boolean).join(", ") || "Sin zona"} · {labelOf(MODALITIES, x.profile.modality)}
        </li>
        <li className="flex items-center gap-1.5">
          <Star className="size-4 shrink-0 text-muted" aria-hidden /> {x.rating ? `${formatNumber(x.rating.avg, 1, 1)} de 5 · ${x.rating.n} ${x.rating.n === 1 ? "reseña" : "reseñas"}` : "Sin reseñas todavía"}
        </li>
        <li className="flex items-center gap-1.5">
          <Clock className="size-4 shrink-0 text-muted" aria-hidden /> {responseLabel(x.responseHours)}
        </li>
      </ul>
      <p className="mt-3 flex flex-wrap gap-1.5">
        {x.profile.services.slice(0, 4).map((s) => (
          <span key={s} className="rounded-md border border-line px-2 py-0.5 text-caption text-muted">
            {labelOf(RED_SERVICES, s)}
          </span>
        ))}
        {!x.profile.accepting_clients && <span className="rounded-md border border-line bg-canvas px-2 py-0.5 text-caption text-muted">Sin cupo por ahora</span>}
      </p>
    </Link>
  );
}
