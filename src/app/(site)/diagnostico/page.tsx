import type { Metadata } from "next";
import { DiagnosticForm } from "@/components/site/DiagnosticForm";
import { PageHeader } from "@/components/site/PageHeader";
import { Container } from "@/components/web/ui";

export const metadata: Metadata = {
  title: "Diagnóstico gratis",
  description: "Contanos la situación de tu empresa en 4 pasos y te enviamos una propuesta cerrada en menos de 24 horas hábiles.",
  alternates: { canonical: "/diagnostico" },
};

const NOTES = ["Te respondemos en menos de 24 horas hábiles.", "No te pedimos clave fiscal ni documentación en este paso.", "Sin compromiso de contratación."];

export default async function DiagnosticoPage({ searchParams }: { searchParams: Promise<{ tipo?: string; plan?: string }> }) {
  const { tipo, plan } = await searchParams;
  return (
    <>
      <PageHeader
        eyebrow="Diagnóstico gratis"
        title="Cuatro preguntas para entender tu empresa."
        intro="Con eso un contador revisa tu caso y te manda una propuesta cerrada: plan, módulos y abono por escrito."
      />
      <section aria-label="Formulario de diagnóstico">
        <Container className="grid gap-16 py-16 lg:grid-cols-12 lg:py-24">
          <ul className="border-t border-hair text-[15px] text-paper/70 lg:col-span-4">
            {NOTES.map((n, i) => (
              <li key={n} className="grid grid-cols-[2.5rem_1fr] border-b border-hair py-4">
                <span className="tabular text-[12px] text-rose-light">0{i + 1}</span>
                {n}
              </li>
            ))}
          </ul>
          <div className="lg:col-span-7 lg:col-start-6">
            <DiagnosticForm defaultType={tipo} plan={plan} />
          </div>
        </Container>
      </section>
    </>
  );
}
