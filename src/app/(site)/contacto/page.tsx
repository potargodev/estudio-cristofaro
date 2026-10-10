import type { Metadata } from "next";
import { ContactForm } from "@/components/site/ContactForm";
import { PageHeader } from "@/components/site/PageHeader";
import { Container } from "@/components/web/ui";
import { SCHEDULE_HREF, site, whatsappLink } from "@/lib/site";

export const metadata: Metadata = {
  title: "Contacto",
  description: `Escribinos por WhatsApp al ${site.phone}, por mail a ${site.email} o desde el formulario.`,
  alternates: { canonical: "/contacto" },
};

export default function ContactoPage() {
  const rows: { label: string; value: React.ReactNode }[] = [
    {
      label: "WhatsApp",
      value: (
        <a href={whatsappLink()} target="_blank" rel="noopener noreferrer" className="u-draw pb-0.5">
          {site.phone}
        </a>
      ),
    },
    {
      label: "Email",
      value: (
        <a href={`mailto:${site.email}`} className="u-draw pb-0.5">
          {site.email}
        </a>
      ),
    },
    {
      label: "Llamada por Meet",
      value: (
        <a href={SCHEDULE_HREF} className="u-draw pb-0.5">
          Agendar 20 minutos
        </a>
      ),
    },
    { label: "Horario", value: site.hours },
    { label: "Zona de atención", value: site.area },
  ];
  return (
    <>
      <PageHeader eyebrow="Contacto" title="Escribinos. Respondemos en menos de 24 horas hábiles." />
      <section aria-label="Datos de contacto y formulario">
        <Container className="grid gap-16 py-16 lg:grid-cols-12 lg:py-24">
          <dl className="border-t border-hair lg:col-span-4">
            {rows.map((r) => (
              <div key={r.label} className="border-b border-hair py-5">
                <dt className="text-[13px] text-paper/55">{r.label}</dt>
                <dd className="mt-1.5 text-[17px] text-paper">{r.value}</dd>
              </div>
            ))}
          </dl>
          <div className="lg:col-span-7 lg:col-start-6">
            <ContactForm />
          </div>
        </Container>
      </section>
    </>
  );
}
