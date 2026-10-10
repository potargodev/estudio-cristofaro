import type { Metadata } from "next";
import { PageHeader } from "@/components/site/PageHeader";
import { TeamCard } from "@/components/site/TeamCard";
import { Container } from "@/components/web/ui";
import { team } from "@/lib/content";

export const metadata: Metadata = {
  title: "Equipo",
  description: "Contadores públicos matriculados en el CPCECABA. Cada empresa tiene un responsable con nombre y apellido.",
  alternates: { canonical: "/equipo" },
};

const principles = [
  { title: "Un responsable por empresa", text: "Cada empresa tiene un contador asignado que conoce su historia y responde en menos de 24 horas hábiles." },
  { title: "Método", text: "Calendario de obligaciones por empresa, controles antes de cada presentación y registro de todo lo que se hizo." },
  { title: "Independencia y confidencialidad", text: "Criterio profesional propio y reserva total sobre la información de cada cliente." },
];

export default function EquipoPage() {
  return (
    <>
      <PageHeader
        eyebrow="Equipo"
        title="Tu empresa, en manos de alguien que la conoce."
        intro="Somos un estudio contable de CABA que acompaña a PyMEs de servicios. Relación de largo plazo, comunicación directa y un responsable asignado."
      />
      <section aria-label="Integrantes del equipo">
        <Container className="grid gap-x-8 gap-y-16 py-20 sm:grid-cols-2 lg:grid-cols-3 lg:py-28">
          {team.map((m, i) => (
            <TeamCard key={i} member={m} index={i} />
          ))}
        </Container>
      </section>
      <section aria-labelledby="como-trabajamos" className="border-t border-hair bg-navy-deep">
        <Container className="py-20 lg:py-28">
          <h2 id="como-trabajamos" className="display-sm text-paper">
            Cómo trabajamos
          </h2>
          <dl className="mt-12 grid border-t border-hair md:grid-cols-3">
            {principles.map((p, i) => (
              <div key={p.title} className="border-b border-hair py-8 md:border-b-0 md:border-r md:px-8 md:first:pl-0 md:last:border-r-0">
                <dt className="flex items-baseline gap-3 text-[17px] text-paper">
                  <span className="tabular text-[12px] text-rose-light">0{i + 1}</span>
                  {p.title}
                </dt>
                <dd className="mt-3 text-[15px] leading-relaxed text-paper/65">{p.text}</dd>
              </div>
            ))}
          </dl>
        </Container>
      </section>
    </>
  );
}
