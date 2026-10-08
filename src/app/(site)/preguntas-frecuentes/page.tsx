import type { Metadata } from "next";
import { CtaBand } from "@/components/site/CtaBand";
import { PageHeader } from "@/components/site/PageHeader";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
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
          <Accordion type="single" collapsible className="border-y border-line">
            {faqs.map((f) => (
              <AccordionItem key={f.id} value={f.id} className="border-line">
                <AccordionTrigger className="py-5 text-lg font-medium hover:no-underline hover:text-rose-deep [&>svg]:size-5 [&>svg]:text-rose-deep">
                  {f.question}
                </AccordionTrigger>
                <AccordionContent className="max-w-2xl pb-5 text-base leading-relaxed text-muted">{f.answer}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>
      <CtaBand title="¿No encontraste tu pregunta?" text="Escribinos y te respondemos en menos de 24 horas hábiles." />
    </>
  );
}
