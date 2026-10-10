"use client";

import { Bot, ShieldCheck, Wrench } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { SplitHeading } from "@/components/web/SplitHeading";
import { Container, SectionIndex } from "@/components/web/ui";
import { reducedMotion } from "@/lib/motion/gsap";
import { CONNECTORS, VIA_LABEL } from "@/modules/connectors/catalog";

const SCRIPT = [
  { k: "user", t: "¿Qué vencimientos tiene Agencia Norte esta semana?" },
  { k: "tool", t: "Listar vencimientos · Agencia Norte SRL" },
  { k: "bot", t: "Dos: IVA de septiembre el lunes 13 y Ingresos Brutos el miércoles 15. Ninguno tiene VEP cargado todavía." },
  { k: "user", t: "Avisale al cliente que el IVA vence el lunes." },
  { k: "approval", t: "Enviado a aprobación: comunicar a Agencia Norte el vencimiento de IVA." },
] as const;

/** Mini demo del Asistente: los mensajes entran de a uno en bucle (fijo con reduced-motion) */
function ChatDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const [n, setN] = useState<number>(SCRIPT.length);
  useEffect(() => {
    if (reducedMotion() || !ref.current) return;
    let timer: number | undefined;
    const io = new IntersectionObserver(([e]) => {
      window.clearInterval(timer);
      if (!e.isIntersecting) return;
      setN(1);
      timer = window.setInterval(() => setN((x) => (x >= SCRIPT.length + 2 ? 1 : x + 1)), 1400);
    });
    io.observe(ref.current);
    return () => {
      io.disconnect();
      window.clearInterval(timer);
    };
  }, []);
  return (
    <div ref={ref} className="border border-hair-strong bg-navy-deep p-5" aria-label="Ejemplo de conversación con el Asistente" role="img">
      <p className="flex items-center gap-2 border-b border-hair pb-3 text-[13px] text-paper/70">
        <Bot className="size-4 text-gold" strokeWidth={1.5} aria-hidden /> Faro · Asistente
      </p>
      <div className="mt-4 grid min-h-[300px] content-start gap-3">
        {SCRIPT.slice(0, Math.min(n, SCRIPT.length)).map((m, i) =>
          m.k === "user" ? (
            <p key={i} className="faro-demo-in ml-auto max-w-[85%] bg-paper/10 px-3 py-2 text-[14px] text-paper">
              {m.t}
            </p>
          ) : m.k === "tool" ? (
            <p key={i} className="faro-demo-in flex items-center gap-2 border border-hair px-3 py-1.5 text-[12px] text-paper/60">
              <Wrench className="size-3.5 text-gold" strokeWidth={1.5} aria-hidden /> {m.t}
            </p>
          ) : m.k === "approval" ? (
            <p key={i} className="faro-demo-in flex items-start gap-2 border border-gold/40 bg-gold/10 px-3 py-2 text-[13px] text-paper">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-gold" strokeWidth={1.5} aria-hidden /> {m.t}
            </p>
          ) : (
            <p key={i} className="faro-demo-in max-w-[90%] text-[14px] leading-relaxed text-paper/85">
              {m.t}
            </p>
          ),
        )}
      </div>
    </div>
  );
}

export function FaroAi() {
  const live = CONNECTORS.filter((c) => c.availability !== "proximamente");
  const soon = CONNECTORS.filter((c) => c.availability === "proximamente");
  return (
    <section id="ia" aria-labelledby="ia-titulo" className="scroll-mt-16 border-t border-hair bg-night py-16 lg:py-32">
      <Container>
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <SectionIndex n="10">IA, MCP y conexiones</SectionIndex>
            <SplitHeading id="ia-titulo" className="display-md mt-8 text-paper">
              La IA propone. Vos aprobás.
            </SplitHeading>
            <ul className="mt-10 divide-y divide-hair border-y border-hair text-[15px] text-paper/75">
              <li className="py-4">Tu propia IA en todos los planes: Anthropic, OpenAI, Google, OpenRouter, Azure o un modelo local. La clave queda cifrada.</li>
              <li className="py-4">Faro como servidor MCP: operá el estudio desde Claude, ChatGPT o Claude Code, con alcances y vencimiento.</li>
              <li className="py-4">Nada fiscal, de pagos ni comunicaciones a clientes se ejecuta sin una persona.</li>
            </ul>
          </div>
          <div className="lg:col-span-6 lg:col-start-7">
            <ChatDemo />
          </div>
        </div>
        <div className="mt-16">
          <p className="text-[13px] text-paper/60">Conexiones</p>
          <ul className="mt-4 flex flex-wrap gap-2">
            {live.map((c) => (
              <li key={c.key} className="flex items-center gap-2 border border-hair-strong px-3 py-2 text-[14px] text-paper">
                <span aria-hidden className="grid size-6 place-items-center text-[11px] font-semibold" style={{ background: c.logo.bg, color: c.logo.fg }}>
                  {c.logo.text}
                </span>
                {c.name.split(" (")[0]}
                <span className="text-[12px] text-paper/50">· {VIA_LABEL[c.via]}</span>
              </li>
            ))}
            {soon.map((c) => (
              <li key={c.key} className="flex items-center gap-2 border border-hair px-3 py-2 text-[14px] text-paper/50">
                {c.name} <span className="text-[12px]">· próximamente</span>
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </section>
  );
}
