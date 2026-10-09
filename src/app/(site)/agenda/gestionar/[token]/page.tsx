import type { Metadata } from "next";
import Link from "next/link";
import { cancelCall } from "@/app/actions/agenda";
import { RescheduleForm } from "@/components/agenda/RescheduleForm";
import { SubmitButton } from "@/components/admin/ui";
import { SaveToast } from "@/components/admin/SaveToast";
import { bookingByToken } from "@/lib/agenda/bookings";
import { toPickerDays } from "@/lib/agenda/picker";
import { availableSlots, getHosts } from "@/lib/agenda/slots";
import { fmtDateTime, fmtTime } from "@/lib/agenda/time";

export const metadata: Metadata = { title: "Tu llamada", robots: { index: false, follow: false } };

/** Reprogramar o cancelar con el link del mail, sin iniciar sesión */
export default async function GestionarPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ reprogramada?: string; cancelada?: string }>;
}) {
  const { token } = await params;
  const sp = await searchParams;
  const b = await bookingByToken(token);
  if (!b) {
    return (
      <section className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
        <h1 className="font-display text-4xl">Link inválido</h1>
        <p className="mt-3 text-muted">No encontramos esa llamada. Revisá el link del mail o agendá una nueva.</p>
        <Link href="/agendar" className="mt-6 inline-block text-rose-deep underline">
          Agendar una llamada
        </Link>
      </section>
    );
  }
  const past = b.starts_at.getTime() < Date.now();
  const editable = b.status === "confirmada" && !past;
  const days = editable
    ? toPickerDays(await availableSlots(await getHosts(b.studio_id, { userIds: [b.host_user_id] }), { excludeBookingId: b.id }))
    : [];
  return (
    <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      {sp.reprogramada && <SaveToast message="Listo, reprogramamos la llamada. Te mandamos la confirmación." />}
      <p className="text-sm text-muted">Tu llamada con el Estudio Cristofaro</p>
      <h1 className="mt-2 font-display text-4xl first-letter:uppercase">
        {b.status === "cancelada" ? "Llamada cancelada" : fmtDateTime(b.starts_at)}
      </h1>
      {b.status === "confirmada" && (
        <p className="mt-2 text-muted">
          Hasta las {fmtTime(b.ends_at)} (hora de Buenos Aires) ·{" "}
          {b.meet_url ? (
            <a href={b.meet_url} className="text-rose-deep underline">
              link de la videollamada
            </a>
          ) : (
            "el link te llega por mail"
          )}{" "}
          ·{" "}
          <a href={`/api/agenda/ics/${token}`} className="text-rose-deep underline">
            .ics
          </a>
        </p>
      )}
      {b.status === "cancelada" && (
        <p className="mt-3 text-muted">
          {sp.cancelada ? "Cancelamos la llamada y le avisamos al estudio." : "Esta llamada fue cancelada."}{" "}
          <Link href="/agendar" className="text-rose-deep underline">
            Agendar otra
          </Link>
          .
        </p>
      )}
      {past && b.status === "confirmada" && <p className="mt-3 text-muted">Esta llamada ya pasó.</p>}
      {editable && (
        <div className="mt-10 grid gap-8">
          <section className="rounded-md border border-line bg-surface p-6 shadow-brand-sm">
            <h2 className="mb-4 text-lg font-semibold">Reprogramar</h2>
            <RescheduleForm token={token} days={days} />
          </section>
          <section className="rounded-md border border-dashed border-line p-6">
            <h2 className="text-lg font-semibold">Cancelar</h2>
            <p className="mt-1 text-sm text-muted">Le avisamos al estudio y liberamos el horario.</p>
            <form action={cancelCall} className="mt-4">
              <input type="hidden" name="token" value={token} />
              <SubmitButton variant="danger" pendingText="Cancelando…" confirm="¿Cancelar la llamada?" confirmLabel="Cancelar llamada">
                Cancelar la llamada
              </SubmitButton>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}
