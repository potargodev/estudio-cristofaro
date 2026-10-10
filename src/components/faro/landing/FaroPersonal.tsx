import { CalendarClock, FileText, Gauge, LifeBuoy, ShieldCheck } from "lucide-react";
import { SplitHeading } from "@/components/web/SplitHeading";
import { Container, CtaLink, SectionIndex } from "@/components/web/ui";
import { plansFor, priceLabel } from "@/lib/faro/plans";
import { Reveal } from "./Reveal";

// docs/faro-producto.md §2.c: Faro Personal para autónomos sin contador

const FEATURES = [
  { icon: FileText, title: "Facturación con tu logo", text: "Facturas A, B, C y E con ARCA, con tu logo y tus colores, y link de pago.", soon: true },
  { icon: Gauge, title: "Semáforo de monotributo", text: "Cuánto podés facturar sin pasarte, aviso de recategorización y alerta de exclusión.", soon: true },
  { icon: ShieldCheck, title: "Tu situación con ARCA", text: "Constancia y padrón por web service oficial. Lo que no tiene servicio, con chequeos guiados.", soon: true },
  { icon: CalendarClock, title: "Calendario de vencimientos", text: "Monotributo, IIBB, autónomos, IVA y Ganancias según tu CUIT, con alertas.", soon: true },
  { icon: LifeBuoy, title: "Necesito un contador", text: "Cuando crezcas, invitás a un estudio de Faro a acompañarte sin cambiar de herramienta.", soon: false },
];

export function FaroPersonal() {
  const plans = plansFor("personal");
  return (
    <section id="personal" aria-labelledby="personal-titulo" className="on-paper scroll-mt-16 py-16 lg:py-32">
      <Container>
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-6">
            <SectionIndex n="07" light>
              Faro Personal
            </SectionIndex>
            <SplitHeading id="personal-titulo" className="display-md mt-8 text-ink">
              ¿Sos autónomo y llevás tus números solo?
            </SplitHeading>
            <p className="mt-8 max-w-lg text-[16px] leading-relaxed text-muted">
              Faro te dice qué tenés que hacer, cuándo y cuánto, en palabras simples. Para monotributistas y responsables inscriptos que arrancan o que prefieren no depender de nadie.
            </p>
            <Reveal as="ul" className="mt-10 divide-y divide-line border-y border-line">
              {FEATURES.map((f) => (
                <li key={f.title} data-reveal className="flex gap-4 py-5">
                  <f.icon className="mt-0.5 size-5 shrink-0 text-gold-ink" strokeWidth={1.5} aria-hidden />
                  <div>
                    <p className="flex flex-wrap items-center gap-2 font-medium text-ink">
                      {f.title}
                      {f.soon && <span className="border border-line px-1.5 py-0.5 text-[11px] font-normal text-muted">Próximamente</span>}
                    </p>
                    <p className="mt-1 text-[14px] leading-relaxed text-muted">{f.text}</p>
                  </div>
                </li>
              ))}
            </Reveal>
          </div>
          <div className="lg:col-span-5 lg:col-start-8">
            {/* Celular con el panel del autónomo */}
            <div className="mx-auto max-w-[340px] border border-line bg-night p-3 shadow-[0_40px_80px_-40px_rgba(15,19,32,0.6)]" role="img" aria-label="Ejemplo del panel de Faro Personal en el celular">
              <div className="bg-navy-deep p-5 text-paper">
                <p className="text-[12px] text-paper/55">Hola, Martina</p>
                <p className="mt-1 font-display text-[26px] leading-tight">Este mes pagás {"$\u00a058.300"}</p>
                <div className="mt-5 h-2 bg-paper/10" aria-hidden>
                  <div className="h-2 bg-gold" style={{ width: "64%" }} />
                </div>
                <p className="mt-2 flex justify-between text-[12px] text-paper/60">
                  <span>Categoría D · 64% del tope</span>
                  <span className="text-gold">Verde</span>
                </p>
                <ul className="mt-5 divide-y divide-hair border-y border-hair text-[13px]">
                  <li className="flex justify-between py-2.5">
                    <span className="text-paper/70">Monotributo</span>
                    <span>20/10 · $ 42.300</span>
                  </li>
                  <li className="flex justify-between py-2.5">
                    <span className="text-paper/70">IIBB Simplificado</span>
                    <span>20/10 · $ 16.000</span>
                  </li>
                  <li className="flex justify-between py-2.5">
                    <span className="text-paper/70">Factura C 0003-00000127</span>
                    <span className="text-gold">Cobrada</span>
                  </li>
                </ul>
                <p className="mt-5 flex h-10 items-center justify-center bg-gold text-[14px] font-medium text-night">Nueva factura</p>
              </div>
            </div>
            <ul className="mt-8 grid gap-3 sm:grid-cols-2">
              {plans.map((p) => (
                <li key={p.key} className={p.recommended ? "border border-gold-ink/50 bg-surface p-4" : "border border-line bg-surface p-4"}>
                  <p className="font-display text-[26px] leading-none text-ink">{p.name}</p>
                  <p className="mt-1 text-[13px] text-muted">{p.tagline}</p>
                  <p className="tabular mt-3 text-[15px] text-ink">{priceLabel(p)}</p>
                </li>
              ))}
            </ul>
            <CtaLink tone="gold" href="/faro/registro?tipo=personal" className="mt-6">
              Empezar gratis
            </CtaLink>
          </div>
        </div>
      </Container>
    </section>
  );
}
