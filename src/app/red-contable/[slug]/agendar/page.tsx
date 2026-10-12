import { CalendarPlus, Video } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookingForm } from "@/components/agenda/BookingForm";
import { PageHeader } from "@/components/admin/kit/PageHeader";
import { toPickerDays } from "@/lib/agenda/picker";
import { bookingByToken } from "@/lib/agenda/bookings";
import { availableSlots, getHosts } from "@/lib/agenda/slots";
import { publicProfile } from "@/modules/red/server";
import { formatDate } from "@/lib/format";
import { getSessionUser } from "@/lib/auth";

type Params = Promise<{ slug: string }>;
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Agendar llamada · Red Contable", robots: { index: false, follow: true } };

/** "Agendar llamada" desde la ficha de la Red: la agenda pública del estudio elegido */
export default async function AgendarRedPage({ params, searchParams }: { params: Params; searchParams: Promise<{ t?: string }> }) {
  const [{ slug }, { t }] = await Promise.all([params, searchParams]);
  const viewer = await getSessionUser().catch(() => null);
  const x = await publicProfile(slug, viewer?.isDemo ?? false);
  if (!x) notFound();
  const back = (
    <Link href={`/red-contable/${x.slug}`} className="text-meta text-muted hover:text-ink">
      ← {x.name}
    </Link>
  );
  if (t) {
    const b = await bookingByToken(t);
    // La confirmación solo se muestra si la reserva es de este estudio
    if (!b || b.studio_id !== x.studioId) notFound();
    return (
      <div className="grid gap-4">
        {back}
        <PageHeader title="Tu llamada está confirmada" description={`Con ${x.name}. Te mandamos la confirmación a ${b.email}.`} className="mb-0" />
        <p className="num text-title first-letter:uppercase">
          {formatDate(b.starts_at, "weekdayTime")} a {formatDate(b.ends_at, "time")} <span className="text-ui font-normal text-muted">(hora de Buenos Aires)</span>
        </p>
        <div className="flex flex-wrap gap-2">
          {b.meet_url && (
            <a href={b.meet_url} className="inline-flex h-(--control-h) items-center gap-2 rounded-md bg-navy px-4 text-ui text-paper hover:bg-night">
              <Video className="size-4" aria-hidden /> Link de la videollamada
            </a>
          )}
          <a href={`/api/agenda/ics/${t}`} className="inline-flex h-(--control-h) items-center gap-2 rounded-md border border-line px-4 text-ui text-ink hover:border-navy">
            <CalendarPlus className="size-4" aria-hidden /> Agregar a mi calendario (.ics)
          </a>
          <Link href={`/agenda/gestionar/${t}`} className="inline-flex h-(--control-h) items-center px-2 text-ui text-muted underline underline-offset-4">
            Reprogramar o cancelar
          </Link>
        </div>
      </div>
    );
  }
  const days = toPickerDays(await availableSlots(await getHosts(x.studioId, { publicOnly: true })));
  return (
    <div className="grid gap-4">
      {back}
      <PageHeader title={`Agendar una llamada con ${x.name}`} description="Elegí un horario y te mandamos el link de la videollamada. Sin compromiso." className="mb-0" />
      {days.length === 0 ? (
        <p className="rounded-md border border-line bg-surface p-4 text-ui text-muted">Este estudio no tiene horarios libres en la agenda por ahora. Pedile una propuesta desde su ficha y te responde por mail.</p>
      ) : (
        <div className="max-w-4xl">
          <BookingForm days={days} red={x.slug} />
        </div>
      )}
    </div>
  );
}
