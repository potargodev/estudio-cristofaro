import type { Metadata } from "next";
import { ContactForm } from "@/components/site/ContactForm";
import { PageHeader } from "@/components/site/PageHeader";
import { site, whatsappLink } from "@/lib/site";

export const metadata: Metadata = {
  title: "Contacto",
  description: `Escribinos por WhatsApp al ${site.phone}, por mail a ${site.email} o desde el formulario.`,
  alternates: { canonical: "/contacto" },
};

export default function ContactoPage() {
  return (
    <>
      <PageHeader title="Contacto" intro="Respondemos todas las consultas en menos de 24 horas hábiles." />
      <section className="border-b border-line">
        <div className="mx-auto grid max-w-6xl gap-12 px-4 py-14 sm:px-6 md:grid-cols-[1fr_1.5fr]">
          <dl className="space-y-6">
            <div>
              <dt className="text-sm text-muted">WhatsApp</dt>
              <dd className="mt-1 text-lg font-medium">
                <a href={whatsappLink()} target="_blank" rel="noopener" className="text-rose-deep underline-offset-4 hover:underline">
                  {site.phone}
                </a>
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted">Email</dt>
              <dd className="mt-1 text-lg font-medium">
                <a href={`mailto:${site.email}`} className="text-rose-deep underline-offset-4 hover:underline">
                  {site.email}
                </a>
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted">Horario</dt>
              <dd className="mt-1 text-lg">{site.hours}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted">Zona de atención</dt>
              <dd className="mt-1 text-lg">{site.area}</dd>
            </div>
          </dl>
          <div className="rounded-md border border-line bg-surface p-5 sm:p-8">
            <ContactForm />
          </div>
        </div>
      </section>
    </>
  );
}
