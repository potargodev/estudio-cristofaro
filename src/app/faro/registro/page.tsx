import type { Metadata } from "next";
import { RegisterForm } from "@/components/faro/landing/RegisterForm";
import { Container } from "@/components/web/ui";
import { getPlan } from "@/lib/faro/plans";

export const metadata: Metadata = { title: "Crear una cuenta" };

const PERKS = ["Hasta 5 organizaciones gratis, para siempre", "Portal para tus clientes con vencimientos, documentos y solicitudes", "Asistente IA con tu propia clave", "Gastos compartidos incluidos"];

export default async function RegistroPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const interest = getPlan(sp.interes)?.key;
  return (
    <section className="relative isolate overflow-hidden bg-night pb-20 pt-32 lg:pt-40">
      <div aria-hidden className="faro-glow absolute right-[10%] top-[20%] -z-10 size-[50vmin] rounded-full" />
      <Container>
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <p className="text-[13px] text-gold">Crear una cuenta</p>
            <h1 className="display-md mt-6 text-paper">Prendé la luz en tu estudio.</h1>
            <ul className="mt-10 divide-y divide-hair border-y border-hair text-[15px] text-paper/75">
              {PERKS.map((p) => (
                <li key={p} className="py-3.5">
                  {p}
                </li>
              ))}
            </ul>
            {interest && <p className="mt-6 text-[14px] text-paper/60">Empezás en el plan gratis y te contactamos para pasar a {getPlan(interest)?.name}.</p>}
          </div>
          <div className="border border-hair-strong bg-navy-deep/70 p-6 sm:p-8 lg:col-span-6 lg:col-start-7">
            <RegisterForm kinds={["studio"]} interest={interest} />
          </div>
        </div>
      </Container>
    </section>
  );
}
