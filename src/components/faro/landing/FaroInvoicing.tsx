import { Check } from "lucide-react";
import Link from "next/link";
import { SplitHeading } from "@/components/web/SplitHeading";
import { Container, SectionIndex } from "@/components/web/ui";
import { Reveal } from "./Reveal";

// Facturar con Faro (§2.p, B11): lo que promete la facturación, sin nombrar a
// nadie más. Cada línea es algo que la app ya hace.

const POINTS = [
  { t: "Faro no te pide tu clave fiscal", d: "Delegás la factura electrónica una sola vez en ARCA y Faro emite por el servicio oficial. Tu clave queda con vos." },
  { t: "Una factura en menos de 15 segundos", d: "Desde el celular: importe, cliente y listo. Los clientes y las descripciones de siempre, a un toque." },
  { t: "Si ARCA se cae, tu factura no se pierde", d: "Queda en cola con su número reservado y sale sola cuando ARCA vuelve. El estado, en vivo y a la vista de todos." },
  { t: "De a una o de a miles", d: "Lotes desde Excel con validación por fila, recurrentes con ajuste por IPC, presupuestos que pasan a factura." },
  { t: "Por donde vendas", d: "Por WhatsApp (escrito o en audio), desde tus ventas online y por la API, siempre con tu aprobación o con un interruptor que activás vos." },
  { t: "Lo que recibís, ordenado", d: "Un buzón con las facturas de tus proveedores validadas contra ARCA, listas para el Libro IVA." },
];

export function FaroInvoicing() {
  return (
    <section aria-labelledby="facturar" className="border-t border-hair bg-night py-16 lg:py-28">
      <Container>
        <SectionIndex n="12">Facturar</SectionIndex>
        <SplitHeading id="facturar" className="display-md mt-8 max-w-3xl text-paper">
          Facturar tendría que ser lo más fácil del día.
        </SplitHeading>
        <Reveal as="ul" className="mt-12 grid gap-px overflow-hidden rounded-lg bg-hair sm:grid-cols-2 lg:grid-cols-3">
          {POINTS.map((p) => (
            <li key={p.t} data-reveal className="bg-night p-6 sm:p-8">
              <p className="flex items-start gap-2 text-title text-paper">
                <Check className="mt-1 size-4 shrink-0 text-gold" aria-hidden /> {p.t}
              </p>
              <p className="mt-3 text-body leading-relaxed text-paper/65">{p.d}</p>
            </li>
          ))}
        </Reveal>
        <p className="mt-8 text-ui text-paper/60">
          Probalo gratis, sin tarjeta.{" "}
          <Link href="/estado" className="underline underline-offset-4">
            Mirá el estado de ARCA en vivo
          </Link>
          .
        </p>
      </Container>
    </section>
  );
}
