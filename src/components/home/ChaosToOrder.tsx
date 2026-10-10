"use client";

import { BellRing, FileSpreadsheet, FileText, Mail } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Container, SectionIndex } from "@/components/web/ui";
import { isDesktop, loadScrollTrigger, reducedMotion } from "@/lib/motion/gsap";
import { cn } from "@/lib/utils";

const BEFORE = [
  "Te enterás de los vencimientos cuando ya pasaron.",
  "Mandás el mismo comprobante tres veces.",
  "Para saber cuánto pagaste tenés que reconstruirlo.",
  "Nadie sabe quién tiene que responder.",
];
const AFTER = [
  "Alertas antes de cada vencimiento, con el importe listo.",
  "Subís cada documento una vez y queda ordenado.",
  "Un resumen mensual de una página, en criollo.",
  "Un responsable asignado que contesta en menos de 24 h.",
];
const CLOSING = "Todo en un lugar, con alguien que responde.";

// ───────────── Piezas del caos (reconocibles al instante) ─────────────

const chaosShadow = "shadow-[0_14px_30px_-12px_rgba(20,24,38,0.45)]";

function Bubble({ text, time }: { text: string; time: string }) {
  return (
    <div className={cn("w-[230px] rounded-[8px] rounded-tl-none bg-[#d9fdd3] px-3 py-2 text-[14px] leading-snug text-[#111b21]", chaosShadow)}>
      <p className="text-[11px] font-medium text-[#1f6b3a]">WhatsApp · Martina</p>
      <p className="mt-0.5">{text}</p>
      <p className="mt-1 text-right text-[10px] text-[#3b4a54]">{time}</p>
    </div>
  );
}

function Pdf() {
  return (
    <div className={cn("flex w-[240px] items-center gap-3 border border-[#d5d3d8] bg-white px-3 py-2.5 text-[#1b1e26]", chaosShadow)}>
      <span className="grid h-10 w-8 shrink-0 place-items-center bg-[#b42318] text-[9px] font-bold text-white">PDF</span>
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-medium">factura_prov_FINAL(2).pdf</span>
        <span className="block text-[11px] text-[#5a6176]">1,2 MB · descargado 3 veces</span>
      </span>
    </div>
  );
}

function ExcelRow() {
  return (
    <div className={cn("w-[300px] border border-[#c9d6cd] bg-white text-[12px] text-[#1b1e26]", chaosShadow)}>
      <p className="flex items-center gap-1.5 bg-[#1f6b3a] px-2 py-1 text-[10px] font-medium text-white">
        <FileSpreadsheet className="size-3" aria-hidden />
        pagos_2026_v4.xlsx
      </p>
      <div className="tabular grid grid-cols-[2rem_1fr_4.5rem_4rem] divide-x divide-[#c9d6cd]">
        <span className="bg-[#eef3ef] px-1.5 py-1.5 text-[#5a6176]">14</span>
        <span className="px-1.5 py-1.5">IIBB septiembre</span>
        <span className="px-1.5 py-1.5 text-right">98.420</span>
        <span className="bg-[#fff4d6] px-1.5 py-1.5 text-[#7a4b00]">¿pagado?</span>
      </div>
    </div>
  );
}

function UnreadMail() {
  return (
    <div className={cn("w-[250px] border border-[#d5d3d8] bg-white px-3 py-2.5 text-[#1b1e26]", chaosShadow)}>
      <p className="flex items-center justify-between text-[11px] text-[#5a6176]">
        <span className="flex items-center gap-1.5">
          <Mail className="size-3.5" aria-hidden />
          RRHH Agencia Norte
        </span>
        <span className="flex items-center gap-1 font-medium text-[#1d4ed8]">
          <span className="size-2 rounded-full bg-[#1d4ed8]" aria-hidden />
          Sin leer
        </span>
      </p>
      <p className="mt-1 text-[13px] font-semibold">Recibos de sueldo septiembre</p>
      <p className="truncate text-[12px] text-[#5a6176]">Te paso las novedades del mes para que…</p>
    </div>
  );
}

function PostIt() {
  return (
    <div className={cn("w-[150px] bg-[#fbe38e] px-3 pb-4 pt-3 text-[#3a2f05]", chaosShadow)}>
      <p className="font-display text-[20px] leading-tight">Vence IVA</p>
      <p className="mt-1 text-[16px]">
        <span className="line-through decoration-[#b42318] decoration-2">18/10</span> <span>¿20?</span>
      </p>
      <p className="mt-1 text-[11px]">¡no olvidar!</p>
    </div>
  );
}

// ───────────── Piezas del panel (estado ordenado) ─────────────

type Tone = "ok" | "alert" | "info";
const toneClass: Record<Tone, string> = {
  ok: "border-[#9cc7aa] bg-[#e7f3ea] text-[#1f5f36]",
  alert: "border-[#e2b8a8] bg-[#f8e9e3] text-[#7d3a24]",
  info: "border-[#c9cede] bg-[#eceef3] text-[#1c2235]",
};

function Row({ title, meta, tag, tone, icon }: { title: string; meta: string; tag: string; tone: Tone; icon?: React.ReactNode }) {
  return (
    <div className="flex min-h-[54px] items-center justify-between gap-3 border border-hair-ink bg-white px-3 py-2">
      <span className="flex min-w-0 items-center gap-2.5">
        {icon}
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-medium text-ink">{title}</span>
          <span className="tabular block truncate text-[12px] text-muted">{meta}</span>
        </span>
      </span>
      <span className={cn("shrink-0 border px-1.5 py-0.5 text-[11px] font-medium", toneClass[tone])}>{tag}</span>
    </div>
  );
}

interface Item {
  key: string;
  area: "venc" | "docs" | "sol";
  chaos: React.ReactNode;
  order: React.ReactNode;
  /** Centro de la pieza desordenada, en fracción del escenario, y giro */
  at: { x: number; y: number; r: number };
}

const iconCls = "size-4 shrink-0 text-rose-deep";
const ITEMS: Item[] = [
  {
    key: "postit",
    area: "venc",
    chaos: <PostIt />,
    order: <Row icon={<BellRing className={iconCls} aria-hidden />} title="IVA septiembre · vence 20/10" meta="$642.180 · VEP listo" tag="Aviso enviado" tone="alert" />,
    at: { x: 0.12, y: 0.58, r: -9 },
  },
  {
    key: "excel",
    area: "venc",
    chaos: <ExcelRow />,
    order: <Row title="Ingresos Brutos CABA" meta="$98.420 · 16/10" tag="Pagado" tone="ok" />,
    at: { x: 0.42, y: 0.86, r: 4 },
  },
  {
    key: "pdf",
    area: "docs",
    chaos: <Pdf />,
    order: <Row icon={<FileText className={iconCls} aria-hidden />} title="Factura proveedor 0003-118" meta="Compras · octubre" tag="Clasificado" tone="info" />,
    at: { x: 0.56, y: 0.42, r: -5 },
  },
  {
    key: "mail",
    area: "docs",
    chaos: <UnreadMail />,
    order: <Row icon={<FileText className={iconCls} aria-hidden />} title="Recibos de sueldo" meta="12 recibos · septiembre" tag="Listos" tone="ok" />,
    at: { x: 0.82, y: 0.72, r: 7 },
  },
  {
    key: "wa1",
    area: "sol",
    chaos: <Bubble text="¿Me reenviás la factura de agosto?" time="23:41" />,
    order: <Row title="Reenviar factura de agosto" meta="Pedido de Martina · ayer" tag="Resuelta" tone="ok" />,
    at: { x: 0.3, y: 0.1, r: -3 },
  },
  {
    key: "wa2",
    area: "sol",
    chaos: <Bubble text="¿Cuándo vence IVA?" time="00:12" />,
    order: <Row title="Consulta: vencimiento de IVA" meta="Respondió Lucía G. · 2 h" tag="Respondida" tone="ok" />,
    at: { x: 0.78, y: 0.16, r: 6 },
  },
];

const AREAS: { key: Item["area"]; title: string; className: string }[] = [
  { key: "venc", title: "Vencimientos", className: "" },
  { key: "docs", title: "Documentos", className: "" },
  { key: "sol", title: "Solicitudes", className: "sm:col-span-2" },
];

/** Tablero ordenado. Con `animated`, cada pieza lleva encima su versión desordenada. */
function Board({ animated }: { animated: boolean }) {
  return (
    <div data-board className="relative border border-hair-ink bg-[#fbfaf9] p-4 sm:p-5">
      <div data-chrome className="flex items-center justify-between gap-4 border-b border-hair-ink pb-3">
        <p className="text-[13px] font-medium text-ink">Agencia Norte · octubre</p>
        <p className="flex items-center gap-2 text-[12px] text-muted">
          <span className="tabular">8 de 10 resuelto</span>
          <span className="relative h-1 w-16 bg-[#dddbdf]" aria-hidden>
            <span className="absolute inset-y-0 left-0 w-4/5 bg-rose-deep" />
          </span>
        </p>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {AREAS.map((a) => (
          <div key={a.key} className={cn("min-w-0", a.className)}>
            <p data-chrome className="mb-2 text-[12px] font-medium text-rose-deep">
              {a.title}
            </p>
            <div className={cn("grid grid-cols-1 gap-2", a.key === "sol" && "sm:grid-cols-2")}>
              {ITEMS.filter((i) => i.area === a.key).map((i) => (
                <div key={i.key} data-piece={i.key} className="relative">
                  <div data-order>{i.order}</div>
                  {animated && (
                    <div data-chaos className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2" aria-hidden>
                      {i.chaos}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Collage del caos para la versión estática (celular, reduced-motion) */
function Collage() {
  return (
    <div className="relative h-[420px] overflow-hidden border border-dashed border-[#c9c6cc] bg-[#efece8] sm:h-[460px]" aria-hidden>
      {ITEMS.map((i) => (
        <div
          key={i.key}
          className="absolute -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${12 + i.at.x * 76}%`, top: `${10 + i.at.y * 80}%`, rotate: `${i.at.r}deg` }}
        >
          <div className="origin-center scale-[0.72] sm:scale-100">{i.chaos}</div>
        </div>
      ))}
    </div>
  );
}

function StateLabel({ n, children }: { n: string; children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-3 text-[14px] font-medium text-ink">
      <span className="tabular text-[13px] text-rose-deep">{n}</span>
      {children}
    </p>
  );
}

function List({ items, accent }: { items: string[]; accent: boolean }) {
  return (
    <ul className="mt-6 space-y-3 text-[15px] leading-snug text-ink/85">
      {items.map((b) => (
        <li key={b} className={cn("border-l-2 pl-4", accent ? "border-rose-deep" : "border-[#c9c6cc]")}>
          {b}
        </li>
      ))}
    </ul>
  );
}

/**
 * "Del caos al orden". En escritorio, la sección queda fija y la historia se
 * cuenta con el scroll: el desorden de hoy (WhatsApp, un PDF, una fila de
 * Excel, un mail sin leer, un post-it) viaja a su lugar y cada pieza se
 * convierte en su equivalente del panel. Un indicador muestra en qué estado
 * estás. En el celular y con reduced-motion se ve el antes y el después lado
 * a lado (o uno debajo del otro).
 */
export function ChaosToOrder() {
  const root = useRef<HTMLElement>(null);
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    if (!reducedMotion() && isDesktop()) setAnimated(true);
  }, []);

  useEffect(() => {
    if (!animated) return;
    let ctx: { revert: () => void } | undefined;
    loadScrollTrigger().then(({ gsap }) => {
      const el = root.current;
      if (!el) return;
      ctx = gsap.context(() => {
        const stage = el.querySelector<HTMLElement>("[data-board]")!;
        // Desplazamiento de cada pieza desde su lugar en el panel hasta su posición desordenada
        const offset = (piece: HTMLElement, i: Item) => {
          const s = stage.getBoundingClientRect();
          const p = piece.getBoundingClientRect();
          return { x: s.left + s.width * i.at.x - (p.left + p.width / 2), y: s.top + s.height * i.at.y - (p.top + p.height / 2) };
        };
        const tl = gsap.timeline({
          defaults: { ease: "power2.inOut" },
          scrollTrigger: {
            trigger: "[data-pin]",
            start: "top top",
            end: "+=170%",
            scrub: 0.7,
            pin: true,
            anticipatePin: 1,
            invalidateOnRefresh: true,
            onUpdate: (st) => {
              el.style.setProperty("--chaos-progress", String(st.progress));
              el.dataset.state = st.progress < 0.5 ? "hoy" : "orden";
            },
          },
        });
        tl.set({}, {}, 0);
        tl.from("[data-chrome]", { opacity: 0, duration: 0.25 }, 0.35);
        tl.from("[data-board]", { backgroundColor: "rgba(251,250,249,0)", borderColor: "rgba(27,30,38,0)", duration: 0.25 }, 0.35);
        ITEMS.forEach((item, k) => {
          const piece = el.querySelector<HTMLElement>(`[data-piece="${item.key}"]`)!;
          const chaos = piece.querySelector("[data-chaos]")!;
          const order = piece.querySelector("[data-order]")!;
          const start = 0.08 + k * 0.06;
          tl.from(piece, { x: () => offset(piece, item).x, y: () => offset(piece, item).y, rotation: item.at.r, duration: 0.42 }, start);
          tl.to(chaos, { opacity: 0, scale: 0.9, duration: 0.14 }, start + 0.3);
          tl.from(order, { opacity: 0, duration: 0.14 }, start + 0.32);
        });
        tl.to("[data-before]", { opacity: 0, y: -16, duration: 0.08 }, 0.38);
        tl.from("[data-after]", { opacity: 0, y: 16, duration: 0.1 }, 0.48);
        tl.from("[data-closing]", { opacity: 0, y: 24, duration: 0.16 }, 0.84);
        tl.to({}, { duration: 0.06 });
      }, root);
    });
    return () => ctx?.revert();
  }, [animated]);

  return (
    <section ref={root} aria-labelledby="caos-titulo" data-state="hoy" className="on-paper bg-paper text-ink">
      <h2 id="caos-titulo" className="sr-only">
        Del caos al orden
      </h2>
      {animated ? (
        <div data-pin className="flex h-[100svh] flex-col justify-center pt-16">
          <Container>
            {/* Indicador: en qué estado estás */}
            <div className="flex items-center gap-4" aria-hidden>
              <SectionIndex n="02" light className="shrink-0">
                Del caos al orden
              </SectionIndex>
              <span className="ml-6 text-[13px] font-medium text-ink transition-opacity duration-300 [[data-state=orden]_&]:opacity-55">01 Hoy</span>
              <span className="relative h-px flex-1 bg-hair-ink">
                <span className="absolute inset-0 origin-left bg-rose-deep" style={{ transform: "scaleX(var(--chaos-progress, 0))" }} />
              </span>
              <span className="text-[13px] font-medium text-ink opacity-55 transition-opacity duration-300 [[data-state=orden]_&]:opacity-100">
                02 Con Estudio Cristofaro
              </span>
            </div>
            <div className="mt-8 grid items-center gap-10 lg:grid-cols-12">
              <div className="relative lg:col-span-4">
                <div data-before>
                  <StateLabel n="01">Hoy</StateLabel>
                  <p className="display-sm mt-4">La administración vive en WhatsApp, mails y planillas.</p>
                  <List items={BEFORE} accent={false} />
                </div>
                <div data-after className="absolute inset-0">
                  <StateLabel n="02">Con Estudio Cristofaro</StateLabel>
                  <p className="display-sm mt-4">Cada cosa en su lugar, con estado y responsable.</p>
                  <List items={AFTER} accent />
                </div>
              </div>
              <div className="lg:col-span-8">
                <Board animated />
              </div>
            </div>
            <p data-closing className="mt-10 font-display text-[clamp(2.2rem,3.6vw,3.6rem)] leading-none text-ink">
              {CLOSING}
            </p>
          </Container>
        </div>
      ) : (
        <Container className="py-24 lg:py-32">
          <SectionIndex n="02" light>
            Del caos al orden
          </SectionIndex>
          <div className="mt-10 grid gap-14 lg:grid-cols-2 lg:gap-10">
            <div>
              <StateLabel n="01">Hoy</StateLabel>
              <p className="display-sm mt-4">La administración vive en WhatsApp, mails y planillas.</p>
              <List items={BEFORE} accent={false} />
              <div className="mt-8">
                <Collage />
              </div>
            </div>
            <div>
              <StateLabel n="02">Con Estudio Cristofaro</StateLabel>
              <p className="display-sm mt-4">Cada cosa en su lugar, con estado y responsable.</p>
              <List items={AFTER} accent />
              <div className="mt-8">
                <Board animated={false} />
              </div>
            </div>
          </div>
          <p className="display-md mt-16 border-t border-hair-ink pt-10">{CLOSING}</p>
        </Container>
      )}
    </section>
  );
}
