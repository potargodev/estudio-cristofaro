import type { Metadata } from "next";
import { PageHeader } from "@/components/site/PageHeader";
import { Container } from "@/components/web/ui";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { getFaqs } from "@/lib/data";

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
      <PageHeader eyebrow="Recursos" title="Preguntas frecuentes" intro="Cómo trabajamos, cómo es el abono, qué necesitás para empezar y cómo es el cambio de contador." />
      <section aria-label="Preguntas">
        <Container className="py-16 lg:py-24">
          <Accordion type="single" collapsible className="max-w-4xl border-t border-hair">
            {faqs.map((f) => (
              <AccordionItem key={f.id} value={f.id} className="border-hair">
                <AccordionTrigger headingLevel={2} className="py-6 font-display text-[clamp(1.4rem,2.2vw,1.9rem)] font-normal leading-tight text-paper hover:no-underline hover:text-rose-light [&>svg]:size-5 [&>svg]:text-rose-light">
                  {f.question}
                </AccordionTrigger>
                <AccordionContent className="max-w-2xl pb-6 text-[16px] leading-relaxed text-paper/70">{f.answer}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Container>
      </section>
    </>
  );
}
