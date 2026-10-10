import Link from "next/link";
import { SplitHeading } from "@/components/web/SplitHeading";
import { Container } from "@/components/web/ui";

const SERVICES = [
  { slug: "impositivo", name: "Impuestos", items: ["IVA", "Ingresos Brutos", "Ganancias", "Bienes Personales"] },
  { slug: "laboral", name: "Sueldos", items: ["Liquidaciones", "F.931", "Altas y bajas", "Recibos"] },
  { slug: "contable", name: "Contabilidad", items: ["Registraciones", "Balances", "Informes mensuales"] },
  { slug: "societario", name: "Societario", items: ["SAS y SRL", "Libros", "Actas", "IGJ"] },
];

/** Servicios: sección en papel (contrapunto claro, una de las dos de la home) */
export function Services() {
  return (
    <section aria-labelledby="servicios-titulo" className="on-paper bg-paper py-24 text-ink lg:py-36">
      <Container>
        <div className="grid gap-10 lg:grid-cols-12">
          <p className="flex items-center gap-3 text-[13px] text-muted lg:col-span-3">
            <span className="tabular text-rose-deep">06</span>
            <span aria-hidden className="h-px w-8 bg-hair-ink" />
            <span>Servicios</span>
          </p>
          <SplitHeading id="servicios-titulo" className="display-md lg:col-span-9">
            Lo que resolvemos por vos, todos los meses.
          </SplitHeading>
        </div>
        <ul className="mt-16 grid border-t border-hair-ink sm:grid-cols-2 lg:grid-cols-4">
          {SERVICES.map((s, i) => (
            <li key={s.slug} className="border-b border-hair-ink sm:[&:nth-child(odd)]:border-r lg:border-r lg:last:border-r-0">
              <Link href={`/servicios/${s.slug}`} className="group flex h-full flex-col gap-10 p-6 transition-colors duration-500 hover:bg-navy hover:text-paper lg:p-8">
                <span className="tabular text-[13px] text-rose-deep group-hover:text-rose-light">0{i + 1}</span>
                <div>
                  <h3 className="font-display text-[clamp(2rem,3vw,2.8rem)] leading-none">{s.name}</h3>
                  <p className="mt-4 text-[14px] leading-relaxed text-muted transition-colors duration-500 group-hover:text-paper/70">{s.items.join(" · ")}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
