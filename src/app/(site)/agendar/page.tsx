import type { Metadata } from "next";
import { BookingForm } from "@/components/agenda/BookingForm";
import { PageHeader } from "@/components/site/PageHeader";
import { Container } from "@/components/web/ui";
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
        eyebrow="Agendar"
        title="Veinte minutos para ordenar lo que viene."
        intro="Elegí un horario y te mandamos el link de Google Meet. Sin compromiso. Te llega la confirmación con un archivo para sumarla a tu calendario."
      />
      <section aria-label="Agendar una llamada">
        <Container className="py-16 lg:py-24">
          <div className="max-w-4xl">
            <BookingForm days={days} initial={typeof inicio === "string" ? inicio : undefined} />
          </div>
        </Container>
      </section>
    </>
  );
}
