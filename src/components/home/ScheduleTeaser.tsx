import { Suspense } from "react";
import { SplitHeading } from "@/components/web/SplitHeading";
import { Container, SectionIndex, TextLink } from "@/components/web/ui";
import { toPickerDays } from "@/lib/agenda/picker";
import { availableSlots, getHosts } from "@/lib/agenda/slots";
import { getStudioId } from "@/lib/data";
import { SCHEDULE_HREF, whatsappLink } from "@/lib/site";
import { QuickSlots } from "./QuickSlots";

async function Slots() {
  const studioId = await getStudioId().catch(() => null);
  const days = studioId ? toPickerDays(await availableSlots(await getHosts(studioId, { publicOnly: true }), { days: 10 })).slice(0, 5) : [];
  return <QuickSlots days={days} />;
}

function SlotsFallback() {
  return (
    <div className="border border-hair p-8 text-[15px] text-paper/60">
      Buscando horarios libres… <TextLink href={SCHEDULE_HREF} className="text-paper">Ver la agenda completa</TextLink>
    </div>
  );
}

/** Agendar: selector corto conectado a la agenda real; el horario se confirma en /agendar */
export function ScheduleTeaser() {
  return (
    <section id="agendar" aria-labelledby="agendar-titulo" className="scroll-mt-16 border-t border-hair bg-night py-16 lg:py-36">
      <Container>
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <SectionIndex n="10">Agendar</SectionIndex>
            <SplitHeading id="agendar-titulo" className="display-md mt-8 text-paper">
              Veinte minutos para ordenar lo que viene.
            </SplitHeading>
            <p className="mt-8 max-w-sm text-[17px] leading-relaxed text-paper/65">Elegí un horario y te mandamos el link de Google Meet. Sin compromiso.</p>
            <p className="mt-10 flex flex-wrap gap-x-8 gap-y-3 text-[15px] text-paper/80">
              <a href={whatsappLink()} target="_blank" rel="noopener noreferrer" className="u-draw pb-0.5">
                Escribir por WhatsApp
              </a>
              <TextLink href="/contacto">Usar el formulario</TextLink>
            </p>
          </div>
          <div className="lg:col-span-6 lg:col-start-7">
            <Suspense fallback={<SlotsFallback />}>
              <Slots />
            </Suspense>
          </div>
        </div>
      </Container>
    </section>
  );
}
