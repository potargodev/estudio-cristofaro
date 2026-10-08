import type { Metadata } from "next";
import { CtaBand } from "@/components/site/CtaBand";
import { PageHeader } from "@/components/site/PageHeader";
import { getFaqs } from "@/lib/data";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Preguntas frecuentes",
  description: "Cómo trabajamos, cómo es el abono, qué necesitás para empezar y cómo es el cambio de contador.",
  alternates: { canonical: "/preguntas-frecuentes" },
};

export default async function FaqPage() {
  const faqs = await getFaqs();
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <PageHeader title="Preguntas frecuentes" />
      <section className="border-b border-line">
        <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
          <div className="divide-y divide-line border-y border-line">
            {faqs.map((f) => (
              <details key={f.id} className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-medium">
                  {f.question}
                  <span aria-hidden className="text-2xl leading-none text-green transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="mt-3 max-w-2xl leading-relaxed text-muted">{f.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
      <CtaBand title="¿No encontraste tu pregunta?" text="Escribinos y te respondemos en menos de 24 horas hábiles." />
    </>
  );
}
