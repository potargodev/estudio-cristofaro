import type { Metadata } from "next";
import { PageHeader } from "@/components/site/PageHeader";
import { Container, CtaLink } from "@/components/web/ui";
import { SCHEDULE_HREF } from "@/lib/site";

export const metadata: Metadata = {
  title: "Calendario de vencimientos",
  description: "Las obligaciones mensuales y anuales de una PyME de servicios, y cómo te avisamos antes de cada vencimiento con el importe listo.",
  alternates: { canonical: "/recursos/calendario" },
};

// Calendario orientativo: las fechas exactas dependen de la terminación de la
// CUIT y las publica ARCA cada año, por eso acá no hay días fijos.
const MONTHLY = [
  { name: "F.931 · cargas sociales", when: "Primera quincena del mes", detail: "Aportes y contribuciones de los sueldos del mes anterior." },
  { name: "Ganancias · anticipos", when: "Mitad de mes, según el calendario anual", detail: "Anticipos de la sociedad y de los socios, cuando corresponden." },
  { name: "Ingresos Brutos", when: "Mitad de mes", detail: "CABA, Provincia o Convenio Multilateral, según dónde trabajes." },
  { name: "IVA", when: "Segunda quincena del mes", detail: "Declaración jurada del mes anterior, con retenciones y percepciones." },
];

const YEARLY = [
  { name: "Ganancias y Bienes Personales", when: "Mitad de año", detail: "Declaraciones juradas anuales de la sociedad y de los socios." },
  { name: "Balance y estados contables", when: "Según el cierre de ejercicio", detail: "Presentación y asamblea dentro de los plazos de IGJ." },
  { name: "Ingresos Brutos anual", when: "Primer semestre", detail: "Declaración jurada anual de la jurisdicción que corresponda." },
];

function Table({ caption, rows }: { caption: string; rows: typeof MONTHLY }) {
  return (
    <table className="w-full border-collapse text-left">
      <caption className="pb-6 text-left font-display text-[clamp(1.8rem,3vw,2.6rem)] text-paper">{caption}</caption>
      <thead>
        <tr className="border-y border-hair text-[13px] text-paper/55">
          <th scope="col" className="py-3 pr-6 font-normal">
            Obligación
          </th>
          <th scope="col" className="hidden py-3 pr-6 font-normal sm:table-cell">
            Cuándo
          </th>
          <th scope="col" className="py-3 font-normal">
            Qué es
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.name} className="border-b border-hair align-top text-[15px]">
            <th scope="row" className="py-5 pr-6 font-normal text-paper">
              {r.name}
              <span className="mt-1 block text-[13px] text-paper/55 sm:hidden">{r.when}</span>
            </th>
            <td className="hidden py-5 pr-6 text-paper/70 sm:table-cell">{r.when}</td>
            <td className="py-5 text-paper/65">{r.detail}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function CalendarioPage() {
  return (
    <>
      <PageHeader
        eyebrow="Recursos"
        title="Calendario de vencimientos"
        intro="Lo que vence todos los meses y todos los años en una PyME de servicios. Las fechas exactas dependen de la terminación de tu CUIT y las publica ARCA."
      />
      <section aria-label="Calendario orientativo">
        <Container className="grid gap-20 py-16 lg:py-24">
          <Table caption="Todos los meses" rows={MONTHLY} />
          <Table caption="Una vez al año" rows={YEARLY} />
          <div className="grid gap-8 border border-hair-strong p-8 lg:grid-cols-12 lg:items-center">
            <p className="font-display text-[clamp(1.6rem,2.6vw,2.2rem)] leading-tight text-paper lg:col-span-7">
              Con el estudio no tenés que mirar el calendario: te avisamos antes de cada vencimiento, con el importe y el VEP listos en tu panel.
            </p>
            <div className="flex flex-wrap items-center gap-6 lg:col-span-5 lg:justify-end">
              <CtaLink href={SCHEDULE_HREF} magnetic={false}>
                Agendar una llamada
              </CtaLink>
              <a href="https://www.arca.gob.ar/vencimientos/" target="_blank" rel="noopener noreferrer" className="u-draw pb-0.5 text-[15px] text-paper/80">
                Calendario oficial de ARCA
              </a>
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}
