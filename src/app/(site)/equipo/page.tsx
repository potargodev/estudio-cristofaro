import type { Metadata } from "next";
import { CtaBand } from "@/components/site/CtaBand";
import { PageHeader } from "@/components/site/PageHeader";
import { team } from "@/lib/content";

export const metadata: Metadata = {
  title: "Equipo",
  description: "Contadores públicos matriculados en el CPCECABA. Conocé a quienes llevan tus números.",
  alternates: { canonical: "/equipo" },
};

const principles = [
  { title: "Cerca de cada cliente", text: "Cada cliente tiene un contador asignado que conoce su caso y responde en el día." },
  { title: "Método", text: "Trabajamos con un calendario de vencimientos por cliente y controles antes de cada presentación." },
  { title: "Independencia y confidencialidad", text: "Criterio profesional propio y reserva total sobre la información de cada cliente." },
];

export default function EquipoPage() {
  return (
    <>
      <PageHeader
        title="Quiénes llevan tus números"
        intro="Somos un estudio contable de CABA. Construimos relaciones de largo plazo con nuestros clientes: comunicación directa, un contador asignado y soluciones concretas."
      />
      <section className="border-b border-line">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-16 sm:px-6 md:grid-cols-3">
          {team.map((m, i) => (
            <article key={i} className="rounded-md border border-line bg-surface p-6">
              {/* TODO: reemplazar por foto real (next/image) */}
              <div aria-hidden className="mb-5 grid aspect-[4/3] place-items-center rounded-[4px] bg-navy-soft text-sm text-muted">
                Foto
              </div>
              <h2 className="text-lg font-semibold">{m.name}</h2>
              <p className="text-[15px] text-rose-deep">{m.role}</p>
              {m.detail && <p className="mt-1 text-sm text-muted">{m.detail}</p>}
              <p className="mt-3 text-[15px] leading-relaxed text-muted">{m.bio}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="border-b border-line bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-2xl font-display">Cómo trabajamos</h2>
          <dl className="mt-8 grid gap-8 md:grid-cols-3">
            {principles.map((p) => (
              <div key={p.title} className="border-l-2 border-rose pl-5">
                <dt className="font-semibold">{p.title}</dt>
                <dd className="mt-1.5 leading-relaxed text-muted">{p.text}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
      <CtaBand />
    </>
  );
}
