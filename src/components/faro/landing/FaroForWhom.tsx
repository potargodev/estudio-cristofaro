"use client";

import { Building2, Briefcase, Check, NotebookPen, Store, UserRound, Users } from "lucide-react";
import { useState } from "react";
import { SplitHeading } from "@/components/web/SplitHeading";
import { Container, CtaLink, GhostLink, SectionIndex } from "@/components/web/ui";
import { cn } from "@/lib/utils";

// docs/faro-producto.md §0 y §2.d: Faro es para todos. La puerta de entrada es
// Bitácora (personas); después autónomos, estudios, sus clientes y empleados.

type Key = "personas" | "estudios" | "contadores" | "autonomos" | "empresas" | "empleados";

const TYPES: { key: Key; label: string; icon: typeof Building2; benefit: string; features: string[]; cta: { href: string; label: string; ghost?: boolean }; note?: string }[] = [
  {
    key: "personas",
    label: "Personas",
    icon: NotebookPen,
    benefit: "Tus finanzas a la vista, sin cargar a mano. Y un contador confiable cuando lo necesites.",
    features: ["Bitácora gratis: decile lo que gastaste y lo registra", "Grupos de gastos con amigos, pareja o el equipo", "Flotas: contratá un estudio en grupo, cada uno con su acuerdo", "Red de estudios con reseñas de clientes reales"],
    cta: { href: "/faro/registro?tipo=persona", label: "Crear mi cuenta gratis" },
    note: "Bitácora, próximamente. Grupos de gastos, ya disponibles",
  },
  {
    key: "estudios",
    label: "Estudios contables",
    icon: Building2,
    benefit: "Más clientes con el mismo equipo: cartera ordenada, automatizaciones, IA y portal para los clientes.",
    features: ["Cartera con la salud de cada cliente", "Vencimientos y solicitudes en bandejas con prioridad", "Asistente IA que propone y vos aprobás", "Portal y app para cada cliente y su equipo"],
    cta: { href: "/faro/registro?tipo=studio", label: "Probar 30 días gratis" },
  },
  {
    key: "contadores",
    label: "Contadores independientes",
    icon: Briefcase,
    benefit: "Un estudio entero en una sola herramienta, sin depender de planillas.",
    features: ["Hasta 10 organizaciones con el plan Inicial, 30 días gratis", "El calendario de toda tu cartera en una vista", "Tu rubro ya configurado con las plantillas por industria", "Llamadas con Meet desde tu agenda"],
    cta: { href: "/faro/registro?tipo=studio", label: "Probar 30 días gratis" },
  },
  {
    key: "autonomos",
    label: "Autónomos",
    icon: UserRound,
    benefit: "Facturar, saber cuánto pagar y no pasarte de categoría, sin ser contador.",
    features: ["Facturas con tu logo y link de pago", "Semáforo de monotributo y recategorización", "Tus vencimientos con el importe", "Un contador de la Red de estudios cuando lo necesites"],
    cta: { href: "/faro/registro?tipo=personal", label: "Empezar gratis" },
    note: "Facturación y semáforo, próximamente",
  },
  {
    key: "empresas",
    label: "Empresas",
    icon: Store,
    benefit: "Ver todo a la vista: vencimientos, pagos, documentos y un responsable que responde.",
    features: ["Lo que vence este mes, con el importe y el VEP", "Documentos y solicitudes con seguimiento", "Tu equipo con roles y permisos", "La app en el celular de cada uno"],
    cta: { href: "/faro#planes", label: "Pedile a tu estudio que use Faro", ghost: true },
  },
  {
    key: "empleados",
    label: "Empleados",
    icon: Users,
    benefit: "Recibos y comunicaciones en el celular, con firma en un toque.",
    features: ["Recibos de sueldo con firma conforme", "Comunicados con confirmación de lectura", "Tu legajo siempre a mano", "Rendición de gastos con foto del ticket"],
    cta: { href: "/faro#gastos", label: "Ver rendición de gastos", ghost: true },
    note: "Recibos y comunicados, próximamente",
  },
];

const Row = ({ a, b, tone = "text-paper/80", d = 0 }: { a: string; b: string; tone?: string; d?: number }) => (
  <div className="faro-demo-in flex items-center justify-between gap-3 border-b border-hair py-2.5 text-[13px] last:border-0" style={{ "--d": d } as React.CSSProperties}>
    <span className="truncate text-paper/75">{a}</span>
    <span className={cn("shrink-0", tone)}>{b}</span>
  </div>
);

/** Mini demo de la pantalla que usaría cada tipo de usuario */
function Demo({ k }: { k: Key }) {
  if (k === "personas")
    return (
      <>
        <p className="text-[12px] text-paper/55">Bitácora · octubre</p>
        <p className="faro-demo-in mt-3 font-display text-[34px] leading-none text-paper">$ 214.300</p>
        <p className="text-[12px] text-paper/55">te quedan para el mes</p>
        <div className="mt-3">
          <Row a="“Un café y dos medialunas, 4.800”" b="Comida · registrado" tone="text-[#8fd1a5]" d={120} />
          <Row a="Delivery de noche" b="+38% vs. septiembre" tone="text-gold" d={200} />
          <Row a="Viaje a Mendoza (grupo)" b="Te deben $ 32.000" tone="text-[#8fd1a5]" d={280} />
        </div>
      </>
    );
  if (k === "estudios")
    return (
      <>
        <p className="text-[12px] text-paper/55">Organizaciones · salud de la cartera</p>
        <div className="mt-3">
          <Row a="Agencia Norte SRL" b="Al día" tone="text-[#8fd1a5]" />
          <Row a="Consultora Sur SAS" b="2 vencimientos" tone="text-gold" d={80} />
          <Row a="Diseño Plural SA" b="Solicitud sin respuesta" tone="text-[#f0a493]" d={160} />
          <Row a="Software Delta SRL" b="Al día" tone="text-[#8fd1a5]" d={240} />
        </div>
      </>
    );
  if (k === "contadores")
    return (
      <>
        <p className="text-[12px] text-paper/55">Semana del 13 de octubre</p>
        <div className="mt-3 grid grid-cols-5 gap-1.5 text-center text-[11px]">
          {["Lun", "Mar", "Mié", "Jue", "Vie"].map((d, i) => (
            <div key={d} className="faro-demo-in border border-hair p-1.5" style={{ "--d": i * 70 } as React.CSSProperties}>
              <p className="text-paper/55">{d}</p>
              <p className="mt-2 font-display text-[22px] text-paper">{[4, 1, 6, 0, 3][i]}</p>
              <p className="text-paper/45">venc.</p>
            </div>
          ))}
        </div>
        <Row a="IVA · Agencia Norte SRL" b="Lun 13" tone="text-gold" d={400} />
        <Row a="Llamada con Consultora Sur" b="Mié 10:30 · Meet" d={480} />
      </>
    );
  if (k === "autonomos")
    return (
      <>
        <p className="text-[12px] text-paper/55">Semáforo de monotributo · categoría D</p>
        <div className="faro-demo-in mt-4 h-2.5 bg-paper/10" aria-hidden>
          <div className="h-2.5 bg-gold" style={{ width: "72%" }} />
        </div>
        <p className="mt-2 flex justify-between text-[12px] text-paper/60">
          <span>Facturaste el 72% del tope anual</span>
          <span className="text-gold">Vas bien</span>
        </p>
        <Row a="Podés facturar sin pasarte" b="$ 4.180.000" tone="font-display text-[18px] text-paper" d={160} />
        <Row a="Próximo vencimiento" b="Monotributo · 20/10" d={240} />
      </>
    );
  if (k === "empresas")
    return (
      <>
        <p className="text-[12px] text-paper/55">Tu mes en Agencia Norte</p>
        <p className="faro-demo-in mt-3 font-display text-[34px] leading-none text-paper">$ 1.284.000</p>
        <p className="text-[12px] text-paper/55">para pagar este mes, en 3 vencimientos</p>
        <div className="mt-3">
          <Row a="IVA septiembre" b="Vence el lunes · VEP" tone="text-gold" d={120} />
          <Row a="Lucía, tu responsable" b="Respondió tu consulta" d={200} />
        </div>
      </>
    );
  return (
    <>
      <p className="text-[12px] text-paper/55">Recibo de sueldo · septiembre</p>
      <div className="faro-demo-in mt-3 border border-hair p-3">
        <p className="flex justify-between text-[13px] text-paper/75">
          <span>Neto a cobrar</span>
          <span className="font-display text-[22px] text-paper">$ 1.120.400</span>
        </p>
      </div>
      <div className="faro-demo-in mt-3 grid grid-cols-2 gap-2 text-[13px]" style={{ "--d": 160 } as React.CSSProperties}>
        <span className="flex h-10 items-center justify-center bg-gold font-medium text-night">Firmar conforme</span>
        <span className="flex h-10 items-center justify-center border border-hair-strong text-paper/80">No conforme</span>
      </div>
    </>
  );
}

export function FaroForWhom() {
  const [k, setK] = useState<Key>("personas");
  const t = TYPES.find((x) => x.key === k)!;
  return (
    <section id="para-quien" aria-labelledby="para-quien-titulo" className="scroll-mt-16 border-t border-hair bg-night py-16 lg:py-32">
      <Container>
        <div className="grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-6">
            <SectionIndex n="03">Para quién es Faro</SectionIndex>
            <SplitHeading id="para-quien-titulo" className="display-md mt-8 text-paper">
              Una herramienta, seis maneras de usarla.
            </SplitHeading>
          </div>
          <p className="self-end text-[15px] leading-relaxed text-paper/65 lg:col-span-4 lg:col-start-9">
            Empezás gratis con tus finanzas. Si sos autónomo, Faro te acompaña sin contador; si sos contador, gestionás tu cartera y conectás a tus clientes y a sus empleados.
          </p>
        </div>
        <div className="mt-14 grid gap-8 lg:grid-cols-12">
          <div role="tablist" aria-label="Tipo de usuario" aria-orientation="vertical" className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 sm:mx-0 sm:px-0 lg:col-span-4 lg:flex-col lg:gap-0 lg:overflow-visible lg:border-t lg:border-hair">
            {TYPES.map((x, i) => (
              <button
                key={x.key}
                role="tab"
                type="button"
                id={`quien-${x.key}`}
                aria-selected={k === x.key}
                aria-controls="quien-panel"
                onClick={() => setK(x.key)}
                className={cn(
                  "group flex shrink-0 items-center gap-3 border px-4 py-3 text-left transition-colors duration-300 lg:border-x-0 lg:border-t-0 lg:border-b lg:border-hair lg:px-0 lg:py-5",
                  k === x.key ? "border-gold text-paper" : "border-hair-strong text-paper/60 hover:text-paper",
                )}
              >
                <span className="tabular hidden text-[13px] text-gold lg:inline">0{i + 1}</span>
                <x.icon className={cn("size-5", k === x.key ? "text-gold" : "")} strokeWidth={1.5} aria-hidden />
                <span className="whitespace-nowrap text-[15px] lg:font-display lg:text-[26px] lg:leading-none">{x.label}</span>
              </button>
            ))}
          </div>
          <div id="quien-panel" role="tabpanel" aria-labelledby={`quien-${k}`} key={k} className="grid gap-8 lg:col-span-8 lg:grid-cols-2">
            <div>
              <p className="faro-demo-in font-display text-[28px] leading-tight text-paper sm:text-[34px]">{t.benefit}</p>
              <ul className="mt-6 grid gap-3 text-[15px] text-paper/80">
                {t.features.map((f, i) => (
                  <li key={f} className="faro-demo-in flex gap-3" style={{ "--d": 80 + i * 70 } as React.CSSProperties}>
                    <Check className="mt-0.5 size-4 shrink-0 text-gold" aria-hidden />
                    {f}
                  </li>
                ))}
              </ul>
              {t.note && <p className="mt-4 text-[13px] text-paper/50">{t.note}</p>}
              <div className="mt-8">
                {t.cta.ghost ? <GhostLink href={t.cta.href}>{t.cta.label}</GhostLink> : <CtaLink tone="gold" href={t.cta.href}>{t.cta.label}</CtaLink>}
              </div>
            </div>
            <div className="border border-hair-strong bg-navy-deep p-5" role="img" aria-label={`Ejemplo de la pantalla para ${t.label.toLowerCase()}`}>
              <Demo k={k} />
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
