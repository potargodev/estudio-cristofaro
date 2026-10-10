import { Bot, Building2, Plug, ShieldCheck } from "lucide-react";
import { SplitHeading } from "@/components/web/SplitHeading";
import { Container, SectionIndex } from "@/components/web/ui";
import { Reveal } from "./Reveal";

const PILLARS = [
  { icon: Building2, title: "Cartera ordenada", text: "Organizaciones con sus razones sociales, responsables, vencimientos, documentos y solicitudes en un solo lugar. Y un portal para cada cliente." },
  { icon: Bot, title: "IA que propone", text: "Un asistente que consulta toda la plataforma con la IA y la clave que elijas. Lo sensible queda en una bandeja de aprobaciones." },
  { icon: Plug, title: "Conectado", text: "Tango, Xubio, Google Drive, archivos de Holistor o Bejerman y servidores MCP. Todo lo que entra guarda su origen." },
  { icon: ShieldCheck, title: "Seguro", text: "Aislamiento total entre estudios y entre clientes, segundo factor obligatorio y auditoría de cada acción sensible." },
];

export function FaroPillars() {
  return (
    <section aria-labelledby="pilares" className="border-t border-hair bg-night py-16 lg:py-32">
      <Container>
        <div className="grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <SectionIndex n="01">Qué es Faro</SectionIndex>
            <SplitHeading id="pilares" className="display-md mt-8 text-paper">
              Más clientes con el mismo equipo.
            </SplitHeading>
          </div>
          <p className="self-end text-[15px] leading-relaxed text-paper/65 lg:col-span-5 lg:col-start-8">
            Faro nació adentro de un estudio contable real. Hace lo que el estudio repite todos los meses y te deja lo que necesita criterio profesional.
          </p>
        </div>
        <Reveal as="ul" className="mt-14 grid border-t border-hair sm:grid-cols-2 lg:grid-cols-4">
          {PILLARS.map((p, i) => (
            <li key={p.title} data-reveal className="border-b border-hair py-8 sm:px-6 sm:odd:pl-0 lg:border-b-0 lg:border-l lg:first:border-l-0 lg:first:pl-0">
              <span className="tabular text-[13px] text-gold">0{i + 1}</span>
              <p.icon className="mt-6 size-6 text-paper" strokeWidth={1.25} aria-hidden />
              <h3 className="mt-5 font-display text-[28px] leading-none text-paper">{p.title}</h3>
              <p className="mt-4 text-[14px] leading-relaxed text-paper/65">{p.text}</p>
            </li>
          ))}
        </Reveal>
      </Container>
    </section>
  );
}
