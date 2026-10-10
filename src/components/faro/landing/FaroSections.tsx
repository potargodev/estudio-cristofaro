import { ArrowRight, Building2, Compass, NotebookPen, Store, UserRound, Users } from "lucide-react";
import Link from "next/link";
import { SplitHeading } from "@/components/web/SplitHeading";
import { Container, CtaLink, GhostLink, SectionIndex } from "@/components/web/ui";
import { Reveal } from "./Reveal";

// Secciones de la landing de Faro: el problema, los niveles, el caso real,
// preguntas frecuentes y el cierre. Sin fotos de stock: todo en código.

const BEFORE = [
  "Vencimientos en una planilla que actualiza una sola persona",
  "Comprobantes que llegan por WhatsApp, mail y en mano",
  "El cliente pregunta «¿cuánto pago este mes?» y nadie lo tiene a mano",
  "Gastos compartidos que se dividen en una nota del celular",
];
const AFTER = [
  "Un calendario por cliente, con responsable y alertas",
  "Un portal donde el cliente sube todo y queda ordenado",
  "Cada cliente ve qué vence, cuánto y cómo pagarlo",
  "Grupos de gastos con saldos claros y lo deducible marcado",
];

export function FaroProblem() {
  return (
    <section aria-labelledby="problema" className="border-t border-hair bg-night py-16 lg:py-28">
      <Container>
        <SectionIndex n="01">El problema</SectionIndex>
        <SplitHeading id="problema" className="display-md mt-8 max-w-3xl text-paper">
          Los números están desparramados.
        </SplitHeading>
        <div className="mt-12 grid gap-px overflow-hidden rounded-lg bg-hair md:grid-cols-2">
          <div className="bg-night p-6 sm:p-8">
            <p className="text-[12px] uppercase tracking-[0.14em] text-paper/45">Hoy</p>
            <Reveal as="ul" className="mt-5 grid gap-3">
              {BEFORE.map((x) => (
                <li key={x} data-reveal className="text-[15px] leading-relaxed text-paper/60 line-through decoration-paper/25">
                  {x}
                </li>
              ))}
            </Reveal>
          </div>
          <div className="bg-navy-deep p-6 sm:p-8">
            <p className="text-[12px] uppercase tracking-[0.14em] text-gold">Con Faro</p>
            <Reveal as="ul" className="mt-5 grid gap-3">
              {AFTER.map((x) => (
                <li key={x} data-reveal className="flex gap-3 text-[15px] leading-relaxed text-paper">
                  <ArrowRight className="mt-1 size-4 shrink-0 text-gold" aria-hidden /> {x}
                </li>
              ))}
            </Reveal>
          </div>
        </div>
      </Container>
    </section>
  );
}

const LEVELS = [
  { icon: Compass, name: "Faro", who: "La plataforma", text: "Planes, módulos y plantillas. Ve datos de un cliente solo con un acceso asistido, temporal y auditado." },
  { icon: Building2, name: "Estudio", who: "Dueño, contador, colaborador", text: "Su cartera de organizaciones, su equipo, la IA, MCP y las conexiones." },
  { icon: Store, name: "Organización", who: "El cliente y su equipo", text: "Su empresa según el rol: administración, dirección, RR. HH. o consulta." },
  { icon: Users, name: "Empleado", who: "De una organización", text: "Sus rendiciones de gastos y, después, recibos y comunicaciones." },
  { icon: NotebookPen, name: "Persona", who: "Cualquiera", text: "Sus finanzas, sus grupos de gastos y sus Flotas. Puede tener varias puertas a la vez." },
];

export function FaroLevels() {
  return (
    <section aria-labelledby="niveles" className="border-t border-hair bg-night py-16 lg:py-28">
      <Container>
        <div className="grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-6">
            <SectionIndex n="04">Niveles</SectionIndex>
            <SplitHeading id="niveles" className="display-md mt-8 text-paper">
              Cada uno ve lo suyo. Nadie más.
            </SplitHeading>
          </div>
          <p className="self-end text-[15px] leading-relaxed text-paper/65 lg:col-span-4 lg:col-start-9">
            Aislamiento entre estudios, entre clientes y entre personas, validado en el servidor en cada pedido. Lo sensible queda en la auditoría.
          </p>
        </div>
        <Reveal as="ol" className="mt-12 grid gap-3 lg:grid-cols-5">
          {LEVELS.map((l, i) => (
            <li key={l.name} data-reveal className="relative rounded-lg border border-hair-strong bg-navy-deep p-5">
              <span className="tabular text-[12px] text-gold">0{i + 1}</span>
              <l.icon className="mt-4 size-6 text-paper" strokeWidth={1.25} aria-hidden />
              <p className="mt-4 font-display text-[26px] leading-none text-paper">{l.name}</p>
              <p className="mt-1 text-[12px] text-paper/50">{l.who}</p>
              <p className="mt-3 text-[13px] leading-relaxed text-paper/65">{l.text}</p>
            </li>
          ))}
        </Reveal>
      </Container>
    </section>
  );
}

export function FaroCase() {
  return (
    <section id="caso" aria-labelledby="caso-titulo" className="scroll-mt-16 border-t border-hair bg-night py-16 lg:py-28">
      <Container>
        <div className="grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <SectionIndex n="12">Caso real</SectionIndex>
            <SplitHeading id="caso-titulo" className="display-md mt-8 text-paper">
              Nació adentro de un estudio.
            </SplitHeading>
          </div>
          <div className="grid gap-5 text-[15px] leading-relaxed text-paper/70 lg:col-span-6 lg:col-start-7">
            <p>
              Faro se construyó con el Estudio Cristofaro, un estudio contable de Argentina que lo usa todos los días: su cartera, los vencimientos de cada cliente, el portal donde los clientes suben comprobantes y hacen consultas, y el asistente que prepara borradores que siempre revisa un contador.
            </p>
            <p>En la Red de estudios aparece como uno más, sin prioridad: el orden es el mismo para todos.</p>
            <ul className="grid gap-px overflow-hidden rounded-lg bg-hair sm:grid-cols-3">
              {[
                ["Portal", "para cada cliente y su equipo"],
                ["2FA", "obligatorio en todo el estudio"],
                ["IA", "que propone; el contador aprueba"],
              ].map(([a, b]) => (
                <li key={a} className="bg-navy-deep p-4">
                  <p className="font-display text-[26px] text-gold">{a}</p>
                  <p className="text-[13px] text-paper/60">{b}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Container>
    </section>
  );
}

const FAQ = [
  { q: "¿Faro es un estudio contable?", a: "No. Faro es una herramienta. Si necesitás un contador, la Red de estudios te muestra estudios verificados para que elijas vos." },
  { q: "¿Es gratis?", a: "Sí para personas y autónomos que arrancan. Los estudios tienen 30 días de prueba gratis en todos los planes y pagando el año, 2 meses de regalo." },
  { q: "¿La IA hace cosas sola?", a: "La IA propone y una persona aprueba. Nada fiscal, de pagos ni comunicaciones sensibles se ejecuta sin aprobación." },
  { q: "¿Mis datos están seguros?", a: "Cada estudio, organización y persona está aislado y se valida en el servidor. Los estudios entran con segundo factor obligatorio y todo lo sensible queda auditado." },
  { q: "¿Funciona con Tango, Xubio o mis archivos?", a: "Sí: Tango, Xubio, Google Drive, servidores MCP y archivos de Holistor, Bejerman y otros. Todo lo que entra guarda su origen." },
  { q: "¿Qué es una Flota?", a: "Un grupo informal de 3 a 20 personas que pide junto una propuesta a un estudio. Cada uno firma su acuerdo y paga solo lo suyo." },
  { q: "¿Puedo usar Faro desde Claude o ChatGPT?", a: "Sí, por MCP: cada acceso usa los permisos de tu rol, con los módulos y organizaciones que elijas, y lo podés revocar al instante." },
  { q: "¿Puedo llevarme mis datos?", a: "Cuando quieras: desde Mi cuenta descargás tus datos y podés pedir la baja." },
];

export function FaroFaq() {
  return (
    <section id="preguntas" aria-labelledby="faq-titulo" className="scroll-mt-16 border-t border-hair bg-night py-16 lg:py-28">
      <Container>
        <SectionIndex n="13">Preguntas frecuentes</SectionIndex>
        <SplitHeading id="faq-titulo" className="display-md mt-8 text-paper">
          Lo que nos preguntan.
        </SplitHeading>
        <div className="mt-12 grid gap-x-10 md:grid-cols-2">
          {FAQ.map((f) => (
            <details key={f.q} className="group border-t border-hair py-5">
              <summary className="flex cursor-pointer list-none items-start justify-between gap-4 text-[17px] text-paper">
                {f.q}
                <span aria-hidden className="text-gold transition-transform duration-300 group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-3 text-[15px] leading-relaxed text-paper/65">{f.a}</p>
            </details>
          ))}
        </div>
        <p className="mt-8 text-[14px] text-paper/55">
          ¿Algo más?{" "}
          <Link href="/ayuda" className="underline underline-offset-4">
            Centro de ayuda
          </Link>
        </p>
      </Container>
    </section>
  );
}

export function FaroCta() {
  return (
    <section aria-labelledby="cta-titulo" className="relative isolate overflow-hidden border-t border-hair bg-night py-20 lg:py-32">
      <div aria-hidden className="faro-glow absolute left-1/2 top-1/2 -z-10 size-[60vmin] -translate-x-1/2 -translate-y-1/2 rounded-full" />
      <Container>
        <div className="mx-auto max-w-3xl text-center">
          <UserRound className="mx-auto size-6 text-gold" strokeWidth={1.25} aria-hidden />
          <h2 id="cta-titulo" className="display-md mt-6 text-paper">
            Prendé la luz en tus números.
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-[17px] text-paper/70">Empezá gratis en dos minutos, o mirá Faro con alguien del equipo.</p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <CtaLink tone="gold" href="/faro/registro">
              Crear mi cuenta gratis
            </CtaLink>
            <GhostLink href="/faro/demo">Agendar una demo</GhostLink>
          </div>
        </div>
      </Container>
    </section>
  );
}
