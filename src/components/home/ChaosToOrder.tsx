"use client";

import { ArrowLeft, ArrowRight, BellRing, CalendarCheck, FileSpreadsheet, FileText, FolderCheck, Mail, MessageCircle, UserRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Container, SectionIndex } from "@/components/web/ui";
import { onceVisible, reducedMotion } from "@/lib/motion/gsap";

interface Row {
  topic: string;
  /** Cómo es hoy */
  problem: string;
  /** De dónde sale el desorden (lo que se reconoce al instante) */
  source: { icon: LucideIcon; text: string };
  /** Cómo queda con el estudio */
  solution: string;
  /** Su equivalente en la plataforma */
  result: { icon: LucideIcon; label: string; detail: string; status: string };
}

const ROWS: Row[] = [
  {
    topic: "Vencimientos",
    problem: "Te enterás del vencimiento cuando ya pasó.",
    source: { icon: MessageCircle, text: "WhatsApp · ¿Cuándo vence IVA?" },
    solution: "Te avisamos antes, con el importe y el VEP listos.",
    result: { icon: BellRing, label: "IVA septiembre", detail: "Vence el 20/10 · $642.180", status: "Aviso enviado" },
  },
  {
    topic: "Documentos",
    problem: "Mandás el mismo comprobante tres veces.",
    source: { icon: FileText, text: "factura_FINAL(2).pdf · descargado 3 veces" },
    solution: "Lo subís una vez y queda archivado, por período y tipo.",
    result: { icon: FolderCheck, label: "Factura de proveedor", detail: "Septiembre · Compras", status: "Clasificado" },
  },
  {
    topic: "Pagos",
    problem: "Para saber cuánto pagaste, armás otra planilla.",
    source: { icon: FileSpreadsheet, text: "pagos_2026_v4.xlsx · ¿pagado?" },
    solution: "Cada mes, un resumen de una página para leer en dos minutos.",
    result: { icon: CalendarCheck, label: "Resumen de septiembre", detail: "4 presentaciones · $1.284.300", status: "Disponible" },
  },
  {
    topic: "Consultas",
    problem: "No sabés quién te va a responder.",
    source: { icon: Mail, text: "Recibos de sueldo · sin leer" },
    solution: "Tu contador asignado te contesta en menos de 24 h.",
    result: { icon: UserRound, label: "Lucía González", detail: "Respondió tu consulta", status: "En 3 h" },
  },
];

const INTERVAL = 6000;

/**
 * Del caos al orden: el planteo a la izquierda y, a la derecha, un carrusel
 * horizontal donde cada slide muestra un «hoy» y su «con el estudio». Avanza
 * solo (pausa con el mouse encima, con foco o al tocarlo; sin autoplay con
 * reduced motion). Swipe en el celular (scroll-snap nativo), flechas y puntos,
 * y flechas del teclado sobre el carrusel.
 */
export function ChaosToOrder() {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [hold, setHold] = useState(false);
  const [touchHold, setTouchHold] = useState(false);
  const [reduce, setReduce] = useState(true);
  const [seen, setSeen] = useState<Set<number>>(new Set([0]));

  useEffect(() => setReduce(reducedMotion()), []);

  const goTo = useCallback((i: number) => {
    const el = track.current;
    if (!el) return;
    const n = (i + ROWS.length) % ROWS.length;
    const slide = el.children[n] as HTMLElement | undefined;
    if (slide) el.scrollTo({ left: slide.offsetLeft - el.offsetLeft, behavior: reducedMotion() ? "auto" : "smooth" });
  }, []);

  // Slide visible según el scroll (swipe, flechas o teclado)
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const i = Math.round(el.scrollLeft / el.clientWidth);
        setIndex(Math.max(0, Math.min(ROWS.length - 1, i)));
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  // La animación hoy → con el estudio corre la primera vez que se ve cada slide
  useEffect(() => {
    const id = window.setTimeout(() => setSeen((x) => (x.has(index) ? x : new Set([...x, index]))), reduce ? 0 : 150);
    return () => window.clearTimeout(id);
  }, [index, reduce]);

  // Autoplay: solo en pantalla, sin hover, foco ni toque reciente
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    return onceVisible(el, () => setVisible(true), "0px 0px -20% 0px");
  }, []);
  useEffect(() => {
    if (reduce || hold || touchHold || !visible) return;
    const id = window.setTimeout(() => goTo(index + 1), INTERVAL);
    return () => window.clearTimeout(id);
  }, [index, hold, touchHold, reduce, visible, goTo]);
  useEffect(() => {
    if (!touchHold) return;
    const id = window.setTimeout(() => setTouchHold(false), 12_000);
    return () => window.clearTimeout(id);
  }, [touchHold]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") (e.preventDefault(), goTo(index + 1));
    if (e.key === "ArrowLeft") (e.preventDefault(), goTo(index - 1));
  };

  return (
    <section aria-labelledby="caos-titulo" className="on-paper border-t border-hair-ink bg-paper py-16 text-ink lg:py-32">
      <Container className="grid gap-12 lg:grid-cols-12 lg:gap-12">
        {/* Planteo */}
        <div className="lg:col-span-4">
          <SectionIndex n="02" light>
            Del caos al orden
          </SectionIndex>
          <h2 id="caos-titulo" className="display-sm mt-6 max-w-[14ch]">
            Del grupo de WhatsApp a un sistema que avisa solo.
          </h2>
          <p className="mt-6 max-w-sm text-lead leading-relaxed text-muted">
            Mails, planillas y mensajes sueltos pasan a un solo lugar, con fechas, estados y una persona que responde.
          </p>
          <dl className="mt-10 grid grid-cols-2 border-t border-hair-ink text-meta">
            <div className="border-r border-hair-ink py-4 pr-4">
              <dt className="text-muted">Hoy</dt>
              <dd className="mt-1 text-ink">Todo depende de acordarse.</dd>
            </div>
            <div className="py-4 pl-4">
              <dt className="text-rose-deep">Con Estudio Cristofaro</dt>
              <dd className="mt-1 text-ink">Todo tiene fecha y dueño.</dd>
            </div>
          </dl>
          <a href="#plataforma" className="mt-8 inline-flex items-center gap-2 text-body text-ink underline decoration-hair-ink underline-offset-[6px] hover:decoration-rose-deep">
            Ver la plataforma <ArrowRight className="size-4" aria-hidden />
          </a>
        </div>

        {/* Carrusel */}
        <div
          className="min-w-0 lg:col-span-8"
          role="region"
          aria-roledescription="carrusel"
          aria-label="Antes y después con el estudio"
          onMouseEnter={() => setHold(true)}
          onMouseLeave={() => setHold(false)}
          onFocusCapture={() => setHold(true)}
          onBlurCapture={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setHold(false)}
          onPointerDown={(e) => e.pointerType !== "mouse" && setTouchHold(true)}
        >
          <div
            ref={track}
            tabIndex={0}
            onKeyDown={onKey}
            aria-live={hold || touchHold || reduce ? "polite" : "off"}
            className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain border-y border-hair-ink [scrollbar-width:none] focus-visible:outline-2 focus-visible:outline-offset-4 [&::-webkit-scrollbar]:hidden"
          >
            {ROWS.map((r, i) => (
              <div
                key={r.topic}
                role="group"
                aria-roledescription="slide"
                aria-label={`${i + 1} de ${ROWS.length}: ${r.topic}`}
                data-on={seen.has(i) ? "1" : undefined}
                className="group w-full shrink-0 snap-start snap-always py-8 lg:py-10"
              >
                <p className="flex items-center gap-3 text-meta text-muted">
                  <span className="tabular text-rose-deep">0{i + 1}</span>
                  {r.topic}
                </p>
                <div className="mt-5 grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-10">
                  {/* Hoy */}
                  <div className="min-w-0">
                    <p className="text-caption text-muted">Hoy</p>
                    <p className="mt-1.5 text-[clamp(1.15rem,1.6vw,1.4rem)] leading-snug text-ink transition-[color,text-decoration-color] delay-200 duration-700 [text-decoration-line:line-through] [text-decoration-color:transparent] group-data-[on]:text-muted group-data-[on]:[text-decoration-color:var(--color-rose-deep)] motion-reduce:transition-none">
                      {r.problem}
                    </p>
                    <p className="mt-4 inline-flex max-w-full items-center gap-2.5 border border-dashed border-hair-ink px-3 py-2 text-meta text-muted">
                      <r.source.icon className="size-4 shrink-0" strokeWidth={1.5} aria-hidden />
                      <span className="min-w-0 truncate">{r.source.text}</span>
                    </p>
                  </div>
                  {/* Con el estudio */}
                  <div className="min-w-0 translate-y-3 opacity-0 transition-[opacity,transform] delay-500 duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-data-[on]:translate-y-0 group-data-[on]:opacity-100 motion-reduce:translate-y-0 motion-reduce:opacity-100 motion-reduce:transition-none">
                    <p className="text-caption text-rose-deep">Con Estudio Cristofaro</p>
                    <p className="mt-1.5 text-[clamp(1.15rem,1.6vw,1.4rem)] font-medium leading-snug text-ink">{r.solution}</p>
                    <div className="mt-4 flex items-center gap-3 border border-hair-ink bg-white px-3.5 py-3 shadow-[0_10px_30px_-18px_rgba(28,34,53,0.35)]">
                      <span className="grid size-9 shrink-0 place-items-center bg-navy text-paper">
                        <r.result.icon className="size-4" strokeWidth={1.5} aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-ui font-medium text-ink">{r.result.label}</span>
                        <span className="tabular block truncate text-meta text-muted">{r.result.detail}</span>
                      </span>
                      <span className="shrink-0 border border-rose/40 bg-rose-soft px-2 py-0.5 text-caption text-rose-deep">{r.result.status}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {/* Controles */}
          <div className="mt-5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2" role="group" aria-label="Elegir una comparación">
              {ROWS.map((r, i) => (
                <button
                  key={r.topic}
                  type="button"
                  onClick={() => goTo(i)}
                  aria-label={`Ver ${r.topic}`}
                  aria-current={i === index ? "true" : undefined}
                  className="grid h-8 min-w-8 place-items-center"
                >
                  <span className={`block h-[3px] transition-all duration-500 motion-reduce:transition-none ${i === index ? "w-8 bg-rose-deep" : "w-4 bg-hair-ink"}`} />
                </button>
              ))}
              <span className="tabular ml-2 text-caption text-muted">
                0{index + 1} / 0{ROWS.length}
              </span>
            </div>
            <div className="hidden gap-2 md:flex">
              <button type="button" onClick={() => goTo(index - 1)} aria-label="Comparación anterior" className="grid size-10 place-items-center border border-hair-ink text-ink transition-colors hover:border-ink">
                <ArrowLeft className="size-4" aria-hidden />
              </button>
              <button type="button" onClick={() => goTo(index + 1)} aria-label="Comparación siguiente" className="grid size-10 place-items-center border border-hair-ink text-ink transition-colors hover:border-ink">
                <ArrowRight className="size-4" aria-hidden />
              </button>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
