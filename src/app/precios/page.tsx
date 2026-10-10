import Link from "next/link";
import { FaroPlans } from "@/components/faro/landing/FaroPlans";
import { Container } from "@/components/web/ui";
import { ANNUAL_FREE_MONTHS, formatArs, formatUsd } from "@/lib/faro/plans";
import { getUsdArs, publicPlans } from "@/lib/faro/pricing";

export const dynamic = "force-dynamic";

const day = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Argentina/Buenos_Aires" });

/** Precios públicos: salen de los planes que edita el Faro Manager (USD de base, en pesos con la conversión vigente) */
export default async function PreciosPage() {
  const [plans, usdArs] = await Promise.all([publicPlans(), getUsdArs()]);
  const extra = plans.find((p) => p.kind === "studio" && p.extraOrgUsd != null)?.extraOrgUsd ?? null;
  const faqs = [
    { q: "¿Por qué los precios están en dólares y en pesos?", a: `Los fijamos en dólares de referencia y los mostramos en pesos con la conversión del día (hoy, 1 USD = ${formatArs(usdArs)}). Pagás en pesos.` },
    { q: "¿Cómo funciona la prueba gratis?", a: "Los planes pagos de estudios arrancan con 30 días gratis, sin tarjeta. Antes de que termine te avisamos y elegís si seguís." },
    { q: "¿Hay descuento por pagar el año?", a: `Sí: pagando el año completo tenés ${ANNUAL_FREE_MONTHS} meses de regalo (pagás 10 de 12).` },
    ...(extra != null ? [{ q: "¿Qué pasa si tengo más organizaciones que las del plan?", a: `Cada organización extra suma ${formatArs(extra * usdArs)} por mes (${formatUsd(extra)}). No se corta nada: te avisamos al acercarte al límite.` }] : []),
    { q: "¿Puedo cambiar de plan?", a: "Cuando quieras, desde «Plan y facturación» con «Quiero mejorar mi plan». El cobro en línea llega pronto; mientras tanto el equipo de Faro te contacta para activarlo." },
    { q: "¿La IA tiene costo aparte?", a: "Usás tu propia clave del proveedor de IA que elijas: el consumo lo pagás directo a ese proveedor, y en Faro ves cuánto llevás." },
  ];
  return (
    <>
      <section className="bg-night pb-6 pt-32 lg:pt-40">
        <Container>
          <p className="text-[13px] text-gold">Precios</p>
          <h1 className="display-md mt-6 max-w-3xl text-paper">Un plan para cada forma de llevar los números.</h1>
          <p className="mt-6 max-w-2xl text-[17px] text-paper/70">
            Gratis para personas y autónomos que arrancan. Para estudios, 30 días de prueba en todos los planes y {ANNUAL_FREE_MONTHS} meses de regalo pagando el año.
          </p>
          <p className="mt-4 text-[13px] text-paper/50">
            Precios de referencia en pesos al {day.format(new Date())} (1 USD = {formatArs(usdArs)}). Pueden cambiar con la cotización.
          </p>
        </Container>
      </section>
      <FaroPlans plans={plans} usdArs={usdArs} />
      <section className="bg-night pb-24">
        <Container>
          <h2 className="font-display text-[34px] text-paper">Preguntas sobre precios</h2>
          <dl className="mt-8 grid gap-6 md:grid-cols-2">
            {faqs.map((f) => (
              <div key={f.q} className="border-t border-hair pt-5">
                <dt className="text-[17px] font-medium text-paper">{f.q}</dt>
                <dd className="mt-2 text-[15px] leading-relaxed text-paper/65">{f.a}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-10 text-[14px] text-paper/55">
            ¿Dudas? Mirá el{" "}
            <Link href="/ayuda/primeros-pasos/planes" className="underline underline-offset-4">
              artículo de planes
            </Link>{" "}
            o{" "}
            <Link href="/faro/registro" className="underline underline-offset-4">
              creá tu cuenta gratis
            </Link>
            .
          </p>
        </Container>
      </section>
    </>
  );
}
