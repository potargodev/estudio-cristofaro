import type { Metadata } from "next";
import { DemoForm } from "@/components/faro/landing/DemoForm";
import { Container } from "@/components/web/ui";

export const metadata: Metadata = { title: "Agendar una demo" };

export default function DemoPage() {
  return (
    <section className="relative isolate overflow-hidden bg-night pb-20 pt-32 lg:pt-40">
      <div aria-hidden className="faro-glow absolute right-[10%] top-[20%] -z-10 size-[50vmin] rounded-full" />
      <Container>
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <p className="text-[13px] text-gold">Demo</p>
            <h1 className="display-md mt-6 text-paper">Te mostramos Faro en 30 minutos.</h1>
            <p className="mt-6 text-[16px] leading-relaxed text-paper/70">Con tu cartera en mente: vencimientos, portal de clientes, la IA con aprobación y cómo migrar desde Tango o tus planillas. Sin compromiso.</p>
          </div>
          <div className="border border-hair-strong bg-navy-deep/70 p-6 sm:p-8 lg:col-span-6 lg:col-start-7">
            <DemoForm />
          </div>
        </div>
      </Container>
    </section>
  );
}
