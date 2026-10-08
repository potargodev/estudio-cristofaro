import type { Metadata } from "next";
import Link from "next/link";
import { CtaBand } from "@/components/site/CtaBand";
import { PageHeader } from "@/components/site/PageHeader";
import { services } from "@/lib/content";

export const metadata: Metadata = {
  title: "Servicios contables, impositivos, laborales y societarios",
  description: "Contabilidad, impuestos, sueldos y sociedades en CABA y Gran Buenos Aires, con abono fijo y alertas de vencimientos.",
  alternates: { canonical: "/servicios" },
};

export default function ServiciosPage() {
  return (
    <>
      <PageHeader
        title="Servicios"
        intro="Todo lo que necesita un monotributista, una PyME o una sociedad para estar en regla, con un mismo equipo y un abono fijo."
      />
      <section className="border-b border-line">
        <div className="mx-auto max-w-6xl divide-y divide-line px-4 sm:px-6">
          {services.map((s) => (
            <article key={s.slug} id={s.slug} className="grid gap-6 py-12 md:grid-cols-[1fr_1.6fr]">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight">{s.name}</h2>
                <p className="mt-2 text-muted">{s.summary}</p>
                <Link href={`/servicios/${s.slug}`} className="mt-4 inline-block font-medium text-green underline-offset-4 hover:underline">
                  Ver detalle
                </Link>
              </div>
              <ul className="grid gap-3 sm:grid-cols-2">
                {s.items.map((item) => (
                  <li key={item} className="rounded-md border border-line bg-surface px-4 py-3 text-[15px] leading-snug">
                    {item}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>
      <CtaBand />
    </>
  );
}
