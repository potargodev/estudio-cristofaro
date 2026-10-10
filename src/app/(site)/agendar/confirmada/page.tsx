import { CalendarPlus, Video } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/components/web/ui";
import { bookingByToken } from "@/lib/agenda/bookings";
import { fmtDateTime, fmtTime } from "@/lib/agenda/time";

export const metadata: Metadata = { title: "Llamada confirmada", robots: { index: false, follow: false } };

export default async function ConfirmadaPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams;
  const b = t ? await bookingByToken(t) : null;
  if (!b || !t) notFound();
  return (
    <section className="pb-24 pt-36 lg:pt-48">
      <Container className="max-w-[60rem]">
      <p className="flex items-center gap-3 text-[13px] text-paper/60">
        <span aria-hidden className="h-px w-8 bg-rose-light" />
        Llamada confirmada
      </p>
      <h1 className="display-md mt-8 text-paper">Tu llamada está confirmada.</h1>
      <p className="mt-10 border-t border-hair pt-6 text-xl text-paper first-letter:uppercase">
        {fmtDateTime(b.starts_at)} a {fmtTime(b.ends_at)} <span className="text-muted">(hora de Buenos Aires)</span>
      </p>
      <p className="mt-2 text-muted">Te mandamos la confirmación a {b.email}.</p>
      <div className="mt-8 flex flex-wrap gap-3">
        {b.meet_url && (
          <a href={b.meet_url} className="inline-flex h-12 items-center gap-2 rounded-[2px] bg-rose-light px-5 text-night transition-colors hover:bg-paper">
            <Video className="size-5" aria-hidden />
            Link de la videollamada
          </a>
        )}
        <a
          href={`/api/agenda/ics/${t}`}
          className="inline-flex h-12 items-center gap-2 rounded-[2px] border border-hair-strong px-5 text-paper transition-colors hover:border-paper/60"
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
      </Container>
    </section>
  );
}
