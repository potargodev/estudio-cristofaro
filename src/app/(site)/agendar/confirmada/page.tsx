import { CalendarPlus, Video } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LineIcon } from "@/components/icons/LineIcon";
import { bookingByToken } from "@/lib/agenda/bookings";
import { fmtDateTime, fmtTime } from "@/lib/agenda/time";

export const metadata: Metadata = { title: "Llamada confirmada", robots: { index: false, follow: false } };

export default async function ConfirmadaPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams;
  const b = t ? await bookingByToken(t) : null;
  if (!b || !t) notFound();
  return (
    <section className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
      <LineIcon name="calendario" className="size-12 text-navy" />
      <h1 className="mt-5 font-display text-4xl">¡Listo! Tu llamada está confirmada</h1>
      <p className="mt-4 text-lg first-letter:uppercase">
        {fmtDateTime(b.starts_at)} a {fmtTime(b.ends_at)} <span className="text-muted">(hora de Buenos Aires)</span>
      </p>
      <p className="mt-2 text-muted">Te mandamos la confirmación a {b.email}.</p>
      <div className="mt-8 flex flex-wrap gap-3">
        {b.meet_url && (
          <a href={b.meet_url} className="inline-flex h-12 items-center gap-2 rounded-md bg-navy px-5 text-paper hover:bg-navy-deep">
            <Video className="size-5" aria-hidden />
            Link de la videollamada
          </a>
        )}
        <a
          href={`/api/agenda/ics/${t}`}
          className="inline-flex h-12 items-center gap-2 rounded-md border border-line bg-surface px-5 hover:border-navy/40"
        >
          <CalendarPlus className="size-5" aria-hidden />
          Agregar a mi calendario (.ics)
        </a>
      </div>
      {!b.meet_url && <p className="mt-4 text-sm text-muted">El link de la videollamada te lo mandamos por mail antes de la reunión.</p>}
      <p className="mt-10 text-sm text-muted">
        ¿Necesitás cambiarla?{" "}
        <Link href={`/agenda/gestionar/${t}`} className="text-rose-deep underline">
          Reprogramá o cancelá acá
        </Link>
        .
      </p>
    </section>
  );
}
