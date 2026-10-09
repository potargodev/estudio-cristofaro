import type { Metadata } from "next";
import { PortalBookingForm } from "@/components/agenda/PortalBookingForm";
import { Card, PageTitle } from "@/components/portal/ui";
import { requireMember } from "@/lib/auth";
import { orgHosts } from "@/lib/agenda/org-hosts";
import { toPickerDays } from "@/lib/agenda/picker";
import { availableSlots } from "@/lib/agenda/slots";

export const metadata: Metadata = { title: "Agendar una llamada" };

export default async function PortalAgendarPage() {
  const me = await requireMember("agenda.reservar");
  const hosts = await orgHosts(me.studioId, me.organizationId);
  const host = hosts[0];
  const days = host ? toPickerDays(await availableSlots([host])) : [];
  return (
    <>
      <PageTitle title="Agendar una llamada" intro={host ? `Videollamada con ${host.name}, tu responsable en el estudio.` : undefined} />
      <Card className="max-w-3xl">
        {host ? (
          <PortalBookingForm days={days} />
        ) : (
          <p className="text-muted">Tu responsable todavía no tiene horarios para llamadas. Escribinos desde Solicitudes y lo coordinamos.</p>
        )}
      </Card>
    </>
  );
}
