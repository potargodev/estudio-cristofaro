import type { Metadata } from "next";
import { CtaBand } from "@/components/site/CtaBand";
import { PageHeader } from "@/components/site/PageHeader";
import { PlanCard } from "@/components/site/PlanCard";
import { getPlans } from "@/lib/data";

export const metadata: Metadata = {
  title: "Planes y abonos mensuales",
  description: "Abonos fijos para monotributistas, Responsables Inscriptos, sociedades y empleadores. Sabés cuánto pagás antes de empezar.",
  alternates: { canonical: "/planes" },
};

export default async function PlanesPage() {
  const plans = await getPlans();
  return (
    <>
      <PageHeader
        title="Planes con abono fijo"
        intro="Sabés cuánto pagás por mes antes de empezar. El monto final depende de tu volumen de operaciones y cantidad de empleados; te lo pasamos por escrito después del diagnóstico."
      />
      <section className="border-b border-line">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-16 sm:px-6 md:grid-cols-2 lg:grid-cols-4">
          {plans.map((p) => (
            <PlanCard key={p.id} plan={p} />
          ))}
        </div>
      </section>
      <CtaBand title="¿No sabés qué plan te corresponde?" text="Completá el diagnóstico y te recomendamos el que encaja con tu situación." />
    </>
  );
}
