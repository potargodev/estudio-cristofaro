import type { Metadata } from "next";
import { BookingForm } from "@/components/agenda/BookingForm";
import { PageHeader } from "@/components/site/PageHeader";
import { toPickerDays } from "@/lib/agenda/picker";
import { availableSlots, getHosts } from "@/lib/agenda/slots";
import { getStudioId } from "@/lib/data";

export const metadata: Metadata = {
  title: "Agendar una llamada",
  description: "Elegí un horario y hablá 20 minutos por videollamada con un contador del estudio. Sin costo.",
  alternates: { canonical: "/agendar" },
};

export default async function AgendarPage({ searchParams }: { searchParams: Promise<{ inicio?: string }> }) {
  const { inicio } = await searchParams;
  const studioId = await getStudioId().catch(() => null);
  const days = studioId ? toPickerDays(await availableSlots(await getHosts(studioId, { publicOnly: true }))) : [];
  return (
    <>
      <PageHeader
        title="Agendá una llamada"
        intro="Elegí un horario y hablamos por videollamada. Te llega la confirmación con el link de Google Meet y un archivo para sumarla a tu calendario."
      />
      <section className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
        <BookingForm days={days} initial={typeof inicio === "string" ? inicio : undefined} />
      </section>
    </>
  );
}
