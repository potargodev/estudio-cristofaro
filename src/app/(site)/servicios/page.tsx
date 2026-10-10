import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/site/PageHeader";
import { Container } from "@/components/web/ui";
import { services } from "@/lib/content";

export const metadata: Metadata = {
  title: "Servicios: impuestos, sueldos, contabilidad y societario",
  description: "Impuestos, sueldos, contabilidad y societario para PyMEs de servicios en CABA y GBA, con abono mensual fijo y un responsable asignado.",
  alternates: { canonical: "/servicios" },
};

export default function ServiciosPage() {
  return (
    <>
      <PageHeader
        eyebrow="Cómo trabajamos"
        title="Lo que resolvemos por vos, todos los meses."
        intro="Un mismo equipo lleva impuestos, sueldos, contabilidad y sociedad. Vos ves en tu panel qué está hecho, qué tenés que pagar y qué viene."
      />
      <section aria-label="Servicios">
        <Container>
          <ol>
            {services.map((s, i) => (
              <li key={s.slug} id={s.slug} className="grid gap-8 border-b border-hair py-14 lg:grid-cols-12 lg:py-20">
                <div className="lg:col-span-5">
                  <p className="tabular text-[13px] text-rose-light">0{i + 1}</p>
                  <h2 className="mt-4 font-display text-[clamp(2.4rem,4.4vw,4rem)] leading-none text-paper">{s.name}</h2>
                  <p className="mt-5 max-w-md text-[16px] leading-relaxed text-paper/65">{s.summary}</p>
                  <Link href={`/servicios/${s.slug}`} className="u-draw mt-6 inline-block pb-0.5 text-[15px] text-paper">
                    Ver el detalle de {s.name.toLowerCase()}
                  </Link>
                </div>
                <ul className="border-t border-hair text-[15px] text-paper/80 lg:col-span-6 lg:col-start-7">
                  {s.items.map((item) => (
                    <li key={item} className="border-b border-hair py-4">
                      {item}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </Container>
      </section>
    </>
  );
}
