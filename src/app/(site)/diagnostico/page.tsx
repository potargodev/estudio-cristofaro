import type { Metadata } from "next";
import { DiagnosticForm } from "@/components/site/DiagnosticForm";

export const metadata: Metadata = {
  title: "Diagnóstico gratis",
  description: "Contanos tu situación en 4 pasos y te enviamos una propuesta con abono fijo en menos de 24 horas hábiles.",
  alternates: { canonical: "/diagnostico" },
};

export default async function DiagnosticoPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string; plan?: string }>;
}) {
  const { tipo, plan } = await searchParams;
  return (
    <section className="border-b border-line">
      <div className="mx-auto grid max-w-6xl gap-12 px-4 py-14 sm:px-6 md:grid-cols-[1fr_1.7fr] md:py-20">
        <div>
          <h1 className="text-4xl leading-[1.08] font-display">Diagnóstico gratis</h1>
          <p className="mt-4 text-lg leading-relaxed text-muted">
            Cuatro preguntas cortas. Con eso un contador revisa tu caso y te manda una propuesta con abono fijo.
          </p>
          <ul className="mt-8 space-y-3 text-[15px] text-muted">
            <li>Te respondemos en menos de 24 horas hábiles.</li>
            <li>No te pedimos clave fiscal ni documentación en este paso.</li>
            <li>Sin compromiso de contratación.</li>
          </ul>
        </div>
        <div className="rounded-md border border-line bg-paper p-5 sm:p-8">
          <DiagnosticForm defaultType={tipo} plan={plan} />
        </div>
      </div>
    </section>
  );
}
