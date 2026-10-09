"use client";

import { FileText, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { SplitHeading } from "@/components/web/SplitHeading";
import { Container, SectionIndex } from "@/components/web/ui";
import { DEMO } from "@/lib/home";
import { PLATFORM_TABS, type PlatformTabKey } from "@/lib/platform";
import { cn } from "@/lib/utils";

const money = (n: number) => "$" + new Intl.NumberFormat("es-AR").format(n);

function Row({ cells, className }: { cells: React.ReactNode[]; className?: string }) {
  return (
    <div className={cn("grid grid-cols-[1fr_auto_auto] items-baseline gap-4 border-b border-hair py-2.5 text-[13px]", className)}>
      {cells.map((c, i) => (
        <span key={i} className={i > 0 ? "tabular text-right" : ""}>
          {c}
        </span>
      ))}
    </div>
  );
}

function Screen({ tab }: { tab: PlatformTabKey }) {
  if (tab === "este-mes")
    return (
      <div className="grid gap-px bg-hair sm:grid-cols-3">
        {[
          ["Resuelto", "8/10"],
          ["A pagar", money(DEMO.toPay)],
          ["Próximo vencimiento", "20/10"],
        ].map(([k, v]) => (
          <div key={k} className="bg-night p-5">
            <p className="text-[12px] text-paper/55">{k}</p>
            <p className="tabular mt-3 font-display text-[clamp(1.9rem,3vw,2.6rem)] leading-none text-paper">{v}</p>
          </div>
        ))}
        <div className="bg-night p-5 sm:col-span-3">
          <p className="text-[12px] text-paper/55">Actividad reciente</p>
          <ul className="mt-3 text-[13px] text-paper/80">
            {[
              ["Hoy 10:12", "Presentamos Ingresos Brutos CABA."],
              ["Ayer 17:40", "Liquidamos los sueldos de septiembre."],
              ["Ayer 11:05", "Cargamos el VEP de IVA septiembre."],
            ].map(([t, a]) => (
              <li key={t} className="grid grid-cols-[6.5rem_1fr] gap-3 border-b border-hair py-2 last:border-0">
                <span className="tabular text-paper/45">{t}</span>
                {a}
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  if (tab === "vencimientos")
    return (
      <div className="bg-night p-5 text-paper/85">
        <Row className="text-[12px] text-paper/45" cells={["Obligación", "Vence", "Importe"]} />
        <Row cells={["IVA septiembre", "20/10", money(DEMO.ivaAmount)]} />
        <Row cells={["Ganancias anticipo 5", "13/10", "$214.900"]} />
        <Row cells={["Ingresos Brutos CABA", "16/10", "$98.420"]} />
        <Row cells={["F.931 septiembre", "09/10", "$328.800"]} />
        <p className="mt-4 flex items-center justify-between text-[12px]">
          <span className="text-paper/55">VEP listo para IVA septiembre</span>
          <span className="border-b border-rose-light pb-0.5 text-rose-light">Pagar con VEP</span>
        </p>
      </div>
    );
  if (tab === "documentos")
    return (
      <div className="grid gap-px bg-hair sm:grid-cols-2">
        <div className="flex flex-col items-center justify-center gap-3 border border-dashed border-hair-strong bg-night p-8 text-center text-[13px] text-paper/60">
          <Upload className="size-5 text-rose-light" aria-hidden />
          Arrastrá tus comprobantes o sacales una foto
        </div>
        <div className="bg-night p-5 text-[13px] text-paper/80">
          <p className="text-[12px] text-paper/55">Del estudio</p>
          {["Balance 2025.pdf", "Recibos septiembre.pdf"].map((f) => (
            <p key={f} className="flex items-center gap-2 border-b border-hair py-2">
              <FileText className="size-3.5 text-paper/45" aria-hidden />
              {f}
            </p>
          ))}
          <p className="mt-4 text-[12px] text-paper/55">Tuyos</p>
          <p className="flex items-center justify-between gap-2 border-b border-hair py-2">
            <span className="flex items-center gap-2">
              <FileText className="size-3.5 text-paper/45" aria-hidden />
              Factura proveedor 0003-118
            </span>
            <span className="border border-rose-light px-1.5 py-0.5 text-[11px] text-rose-light">para confirmar</span>
          </p>
        </div>
      </div>
    );
  return (
    <div className="flex flex-col gap-3 bg-night p-5 text-[14px]">
      <p className="ml-auto max-w-[80%] bg-navy px-4 py-3 text-paper">Incorporamos una diseñadora el lunes 14.</p>
      <div className="max-w-[85%] border-l border-rose-light pl-4 text-paper/85">
        <p className="text-[12px] text-rose-light">Solicitud creada: Alta de empleada</p>
        <p className="mt-1">Nos faltan su CUIL y el sueldo acordado.</p>
      </div>
      <div className="mt-2 flex items-center justify-between border-t border-hair pt-3 text-[12px] text-paper/45">
        <span>Responde: Lucía G.</span>
        <span className="tabular">Seguimiento 1 de 3</span>
      </div>
    </div>
  );
}

/**
 * Demo de la plataforma por pestañas. El cambio de pestaña es una máscara
 * (clip-path) que barre la pantalla nueva sobre la anterior, no un corte.
 * Los links del mega menú (#plataforma-<pestaña>) abren la pestaña indicada.
 */
export function PlatformDemo() {
  const [tab, setTab] = useState<PlatformTabKey>("este-mes");
  const [prev, setPrev] = useState<PlatformTabKey | null>(null);
  const tabsRef = useRef<HTMLDivElement>(null);

  const select = (k: PlatformTabKey) => {
    if (k === tab) return;
    setPrev(tab);
    setTab(k);
  };

  useEffect(() => {
    const fromHash = () => {
      const m = /^#plataforma-(.+)$/.exec(window.location.hash);
      const k = PLATFORM_TABS.find((t) => t.key === m?.[1])?.key;
      if (k) {
        setTab(k);
        document.getElementById("plataforma")?.scrollIntoView();
      }
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);

  const onKey = (e: React.KeyboardEvent) => {
    const i = PLATFORM_TABS.findIndex((t) => t.key === tab);
    const n = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : null;
    if (n === null) return;
    e.preventDefault();
    const next = PLATFORM_TABS[(n + PLATFORM_TABS.length) % PLATFORM_TABS.length].key;
    select(next);
    tabsRef.current?.querySelector<HTMLButtonElement>(`[data-tab="${next}"]`)?.focus();
  };

  const current = PLATFORM_TABS.find((t) => t.key === tab)!;

  return (
    <section id="plataforma" aria-labelledby="plataforma-titulo" className="scroll-mt-16 border-t border-hair bg-night py-24 lg:py-36">
      {/* anclas de las pestañas para el mega menú */}
      {PLATFORM_TABS.map((t) => (
        <span key={t.key} id={`plataforma-${t.key}`} className="sr-only" />
      ))}
      <Container>
        <div className="grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <SectionIndex n="03">La plataforma</SectionIndex>
            <SplitHeading id="plataforma-titulo" className="display-md mt-8 text-paper">
              Una plataforma para ver tu empresa, no para cargar formularios.
            </SplitHeading>
          </div>
          <p className="self-end text-[17px] leading-relaxed text-paper/65 lg:col-span-4 lg:col-start-9">
            Los datos salen de Tango y de tus documentos. Vos solo confirmás.
          </p>
        </div>

        <div ref={tabsRef} role="tablist" aria-label="Partes de la plataforma" onKeyDown={onKey} className="mt-16 flex overflow-x-auto border-b border-hair">
          {PLATFORM_TABS.map((t, i) => (
            <button
              key={t.key}
              data-tab={t.key}
              id={`tab-${t.key}`}
              role="tab"
              type="button"
              aria-selected={t.key === tab}
              aria-controls="plataforma-panel"
              tabIndex={t.key === tab ? 0 : -1}
              onClick={() => select(t.key)}
              className={cn(
                "relative shrink-0 px-1 pb-4 pr-8 text-left text-[15px] transition-colors duration-300",
                t.key === tab ? "text-paper" : "text-paper/45 hover:text-paper/80",
              )}
            >
              <span className="tabular mr-2 text-[12px] text-rose-light">0{i + 1}</span>
              {t.label}
              <span
                aria-hidden
                className={cn(
                  "absolute bottom-[-1px] left-0 right-8 h-px origin-left bg-rose-light transition-transform duration-500 ease-[var(--ease-expo)]",
                  t.key === tab ? "scale-x-100" : "scale-x-0",
                )}
              />
            </button>
          ))}
        </div>

        <div id="plataforma-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="grid gap-10 pt-10 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <h3 key={tab} className="animate-[tab-in_.6s_var(--ease-expo)_both] font-display text-[clamp(1.8rem,2.6vw,2.4rem)] leading-[1.05] text-paper">
              {current.title}
            </h3>
            <p className="mt-4 text-[15px] leading-relaxed text-paper/65">{current.text}</p>
            <ul className="mt-6 border-t border-hair text-[14px] text-paper/75">
              {current.bullets.map((b) => (
                <li key={b} className="border-b border-hair py-2.5">
                  {b}
                </li>
              ))}
            </ul>
          </div>
          <div className="relative border border-hair-strong lg:col-span-8" aria-hidden>
            <div className="flex items-center justify-between border-b border-hair px-5 py-3 text-[12px] text-paper/45">
              <span>{DEMO.client}</span>
              <span>{current.label}</span>
            </div>
            <div className="relative">
              {prev && (
                <div className="absolute inset-0">
                  <Screen tab={prev} />
                </div>
              )}
              <div key={tab} className="tab-mask relative" onAnimationEnd={() => setPrev(null)}>
                <Screen tab={tab} />
              </div>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
