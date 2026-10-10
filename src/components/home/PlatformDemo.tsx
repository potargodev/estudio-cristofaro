"use client";

import { Building2, CalendarClock, Check, FileText, House, LayoutDashboard, MessageSquare, Upload, UserRound, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { SplitHeading } from "@/components/web/SplitHeading";
import { Container, SectionIndex } from "@/components/web/ui";
import { DEMO } from "@/lib/home";
import { PLATFORM_TABS, type PlatformTabKey } from "@/lib/platform";
import { cn } from "@/lib/utils";

const money = (n: number) => "$" + new Intl.NumberFormat("es-AR").format(n);

type Tone = "ok" | "warn" | "due" | "info";
const chip: Record<Tone, string> = {
  ok: "border-[#5f9a72]/60 text-[#9fd3ae]",
  warn: "border-rose-light/60 text-rose-light",
  due: "border-rose-light/60 text-rose-light",
  info: "border-paper/25 text-paper/75",
};
function Chip({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return <span className={cn("shrink-0 border px-1.5 py-0.5 text-[11px]", chip[tone])}>{children}</span>;
}

// ───────────── Franja de flujo: de dónde salen los datos ─────────────

function FlowStrip() {
  const nodes = [
    { icon: Building2, title: "Tango y ARCA", text: "Comprobantes, vencimientos e importes" },
    { icon: LayoutDashboard, title: "Plataforma Cristofaro", text: "El estudio revisa, ordena y liquida" },
    { icon: UserRound, title: "Vos", text: "Ves el estado y confirmás" },
  ];
  return (
    <div className="mt-14 border-y border-hair py-8">
      <ol className="relative grid gap-8 md:grid-cols-3 md:gap-0">
        {/* Conexión con un pulso que viaja de izquierda a derecha */}
        <span aria-hidden className="absolute left-[16.66%] right-[16.66%] top-6 hidden h-px bg-hair-strong md:block">
          <span className="flow-pulse absolute top-1/2 h-[3px] w-16 -translate-y-1/2 bg-gradient-to-r from-transparent via-rose-light to-transparent" />
        </span>
        {nodes.map((n, i) => (
          <li key={n.title} className="relative flex items-start gap-4 md:flex-col md:items-center md:text-center">
            <span className="relative z-10 grid size-12 shrink-0 place-items-center border border-hair-strong bg-night text-rose-light">
              <n.icon className="size-5" strokeWidth={1.4} aria-hidden />
            </span>
            <span>
              <span className="block text-[15px] text-paper">
                <span className="tabular mr-2 text-[12px] text-rose-light">0{i + 1}</span>
                {n.title}
              </span>
              <span className="mt-1 block text-[13px] text-paper/60">{n.text}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-6 text-center text-[13px] text-paper/60">Los datos llegan solos. Vos solo confirmás.</p>
    </div>
  );
}

// ───────────── Pantallas de la demo ─────────────

const TASKS: [string, boolean][] = [
  ["F.931 septiembre", true],
  ["Sueldos septiembre", true],
  ["Recibos de sueldo", true],
  ["Ingresos Brutos CABA", true],
  ["Ganancias anticipo 5", true],
  ["Libro IVA digital", true],
  ["Conciliación bancaria", true],
  ["Resumen de septiembre", true],
  ["IVA septiembre", false],
  ["Balance trimestral", false],
];

function Screen({ tab }: { tab: PlatformTabKey }) {
  if (tab === "este-mes")
    return (
      <div className="grid gap-4">
        <div className="grid gap-px bg-hair sm:grid-cols-3">
          {[
            ["Resuelto", "8/10", "2 tareas en curso"],
            ["A pagar en octubre", money(DEMO.toPay), "3 pagos pendientes"],
            ["Próximo vencimiento", "20/10", "IVA septiembre"],
          ].map(([k, v, d]) => (
            <div key={k} className="bg-night p-4">
              <p className="text-[12px] text-paper/60">{k}</p>
              <p className="tabular mt-2 font-display text-[clamp(1.6rem,2.1vw,2.1rem)] leading-none text-paper">{v}</p>
              <p className="mt-2 text-[12px] text-paper/55">{d}</p>
            </div>
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="border border-hair p-4">
            <p className="text-[12px] text-paper/60">Tareas del mes</p>
            <ul className="mt-3 grid grid-cols-1 gap-1.5 text-[13px]">
              {TASKS.map(([t, done]) => (
                <li key={t} className="flex items-center gap-2">
                  <span className={cn("grid size-4 place-items-center border", done ? "border-[#5f9a72] bg-[#5f9a72]/20 text-[#9fd3ae]" : "border-paper/30")}>
                    {done && <Check className="size-3" aria-hidden />}
                  </span>
                  <span className={done ? "text-paper/70" : "text-paper"}>{t}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="border border-hair p-4">
            <p className="text-[12px] text-paper/60">Actividad del estudio</p>
            <ul className="mt-3 text-[13px] text-paper/85">
              {[
                ["Hoy 10:12", "Presentamos Ingresos Brutos CABA."],
                ["Ayer 17:40", "Liquidamos los sueldos de septiembre."],
                ["Ayer 11:05", "Cargamos el VEP de IVA septiembre."],
                ["Lun 09:30", "Clasificamos 14 comprobantes de compras."],
                ["Vie 16:20", "Te mandamos el resumen de septiembre."],
              ].map(([t, a]) => (
                <li key={t} className="grid grid-cols-[5.5rem_1fr] gap-2 border-b border-hair py-1.5 last:border-0">
                  <span className="tabular text-paper/55">{t}</span>
                  {a}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    );
  if (tab === "vencimientos")
    return (
      <div className="text-[13px] text-paper/85">
        <div className="grid grid-cols-[1fr_4.5rem_6.5rem_6.5rem] gap-3 border-b border-hair pb-2 text-[12px] text-paper/60">
          <span>Obligación</span>
          <span className="text-right">Vence</span>
          <span className="text-right">Importe</span>
          <span className="text-right">Estado</span>
        </div>
        {(
          [
            ["F.931 septiembre", "09/10", "$328.800", "Pagado", "ok"],
            ["Ganancias anticipo 5", "13/10", "$214.900", "Pagado", "ok"],
            ["Ingresos Brutos CABA", "16/10", "$98.420", "Pagado", "ok"],
            ["IVA septiembre", "20/10", money(DEMO.ivaAmount), "Vence en 3 días", "due"],
            ["Sindicato (FAECYS)", "15/11", "$41.300", "Programado", "info"],
            ["Bienes Personales socios", "18/11", "$156.700", "Programado", "info"],
          ] as [string, string, string, string, Tone][]
        ).map(([o, d, a, e, t]) => (
          <div key={o} className="grid grid-cols-[1fr_4.5rem_6.5rem_6.5rem] items-center gap-3 border-b border-hair py-2.5">
            <span>{o}</span>
            <span className="tabular text-right text-paper/65">{d}</span>
            <span className="tabular text-right">{a}</span>
            <span className="text-right">
              <Chip tone={t}>{e}</Chip>
            </span>
          </div>
        ))}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border border-rose-light/40 bg-rose-light/[0.06] px-4 py-3">
          <span>
            <span className="block text-paper">IVA septiembre · {money(DEMO.ivaAmount)}</span>
            <span className="block text-[12px] text-paper/60">Te avisamos por mail y WhatsApp el 17/10</span>
          </span>
          <span className="bg-rose-light px-3 py-1.5 text-[12px] font-medium text-night">Pagar con VEP</span>
        </div>
      </div>
    );
  if (tab === "documentos")
    return (
      <div className="grid gap-4 md:grid-cols-[1fr_15rem]">
        <div className="grid gap-4">
          <div className="flex items-center gap-4 border border-dashed border-hair-strong px-4 py-5 text-[13px] text-paper/70">
            <Upload className="size-5 shrink-0 text-rose-light" aria-hidden />
            Arrastrá tus comprobantes o sacales una foto desde el celular
          </div>
          <div className="text-[13px]">
            {(
              [
                ["Factura proveedor 0003-118", "Compras · octubre", "Para confirmar", "due"],
                ["Factura proveedor 0001-904", "Compras · octubre", "Para confirmar", "due"],
                ["Recibos de sueldo", "Sueldos · septiembre", "Del estudio", "info"],
                ["Balance 2025", "Contabilidad · anual", "Del estudio", "info"],
                ["Constancia de inscripción", "Societario", "Clasificado", "ok"],
              ] as [string, string, string, Tone][]
            ).map(([n, m, e, t]) => (
              <div key={n} className="flex items-center justify-between gap-3 border-b border-hair py-2.5">
                <span className="flex min-w-0 items-center gap-2.5">
                  <FileText className="size-4 shrink-0 text-paper/55" aria-hidden />
                  <span className="min-w-0">
                    <span className="block truncate text-paper/90">{n}</span>
                    <span className="block text-[12px] text-paper/55">{m}</span>
                  </span>
                </span>
                <Chip tone={t}>{e}</Chip>
              </div>
            ))}
          </div>
        </div>
        <div className="border border-hair p-4 text-[13px]">
          <p className="text-[12px] text-paper/60">Leímos este comprobante</p>
          <p className="mt-1 text-paper">Factura proveedor 0003-118</p>
          <dl className="mt-3 grid grid-cols-[5rem_1fr] gap-y-1.5 text-[12px]">
            {[
              ["CUIT", "30-71234567-1"],
              ["Fecha", "06/10/2026"],
              ["Neto", "$184.000"],
              ["IVA 21%", "$38.640"],
              ["Total", "$222.640"],
            ].map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-paper/55">{k}</dt>
                <dd className="tabular text-right text-paper">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 bg-rose-light py-2 text-center text-[12px] font-medium text-night">Confirmar datos</p>
        </div>
      </div>
    );
  return (
    <div className="grid gap-4 md:grid-cols-[1fr_15rem]">
      <div className="flex flex-col gap-3 border border-hair p-4 text-[14px]">
        <p className="ml-auto max-w-[80%] bg-navy px-4 py-3 text-paper">Incorporamos una diseñadora el lunes 14.</p>
        <div className="max-w-[88%] border-l border-rose-light pl-4 text-paper/85">
          <p className="text-[12px] text-rose-light">Solicitud creada: Alta de empleada</p>
          <p className="mt-1">Nos faltan su CUIL y el sueldo acordado.</p>
        </div>
        <p className="ml-auto max-w-[80%] bg-navy px-4 py-3 text-paper">CUIL 27-40123456-8. El sueldo te lo paso mañana.</p>
        <div className="max-w-[88%] border-l border-rose-light pl-4 text-paper/85">
          <p className="text-[12px] text-rose-light">Lucía G. · Estudio</p>
          <p className="mt-1">Perfecto, ya la damos de alta en ARCA. Te aviso cuando esté.</p>
        </div>
      </div>
      <div className="border border-hair p-4 text-[13px]">
        <p className="text-[12px] text-paper/60">Alta de empleada</p>
        <p className="mt-1 text-paper">Diseñadora · desde 14/10</p>
        <ul className="mt-3 grid gap-1.5">
          {[
            ["CUIL", true],
            ["Fecha de ingreso", true],
            ["Sueldo acordado", false],
            ["Obra social", false],
          ].map(([t, ok]) => (
            <li key={t as string} className="flex items-center gap-2">
              <span className={cn("grid size-4 place-items-center border", ok ? "border-[#5f9a72] bg-[#5f9a72]/20 text-[#9fd3ae]" : "border-paper/30")}>
                {ok && <Check className="size-3" aria-hidden />}
              </span>
              <span className={ok ? "text-paper/70" : "text-paper"}>{t}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 flex items-center justify-between border-t border-hair pt-3 text-[12px]">
          <span className="text-paper/60">Responde Lucía G.</span>
          <Chip tone="warn">En curso</Chip>
        </p>
      </div>
    </div>
  );
}

const NAV = [
  { key: "este-mes", label: "Inicio", icon: House },
  { key: "vencimientos", label: "Vencimientos", icon: CalendarClock },
  { key: "documentos", label: "Documentos", icon: FileText },
  { key: "solicitudes", label: "Solicitudes", icon: MessageSquare },
  { key: "equipo", label: "Mi equipo", icon: Users },
] as const;

/**
 * Plataforma: franja de flujo (Tango y ARCA → Plataforma → Vos) y demo por
 * pestañas. Cada pestaña cambia con una máscara (clip-path), la ventana de la
 * app ocupa el ancho y a un costado hay tres datos de la pestaña activa.
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
    <section id="plataforma" aria-labelledby="plataforma-titulo" className="scroll-mt-16 border-t border-hair bg-night py-16 lg:py-32">
      {/* anclas de las pestañas para el mega menú */}
      {PLATFORM_TABS.map((t) => (
        <span key={t.key} id={`plataforma-${t.key}`} className="sr-only" />
      ))}
      <Container>
        <SectionIndex n="03">La plataforma</SectionIndex>
        <SplitHeading id="plataforma-titulo" className="display-md mt-8 max-w-[20ch] text-paper lg:max-w-[34ch]">
          Una plataforma para ver tu empresa, no para cargar formularios.
        </SplitHeading>

        <FlowStrip />

        <div ref={tabsRef} role="tablist" aria-label="Partes de la plataforma" onKeyDown={onKey} className="mt-14 flex overflow-x-auto border-b border-hair">
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
                t.key === tab ? "text-paper" : "text-paper/60 hover:text-paper/85",
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

        <div id="plataforma-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="grid gap-8 pt-10 lg:grid-cols-12">
          {/* Ventana de la app */}
          <div className="relative min-w-0 border border-hair-strong bg-navy-deep lg:col-span-9" aria-hidden>
            <div className="flex items-center justify-between border-b border-hair px-5 py-3 text-[12px] text-paper/60">
              <span className="flex items-center gap-2">
                <span className="size-2 bg-rose-light" />
                {DEMO.client}
              </span>
              <span>{DEMO.user} · Dirección</span>
            </div>
            <div className="grid md:grid-cols-[11rem_1fr]">
              <nav className="hidden border-r border-hair p-3 text-[13px] md:block">
                {NAV.map((n) => (
                  <p
                    key={n.key}
                    className={cn(
                      "flex items-center gap-2 border-l px-2.5 py-2",
                      n.key === tab ? "border-rose-light bg-paper/[0.04] text-paper" : "border-transparent text-paper/55",
                    )}
                  >
                    <n.icon className="size-3.5" aria-hidden />
                    {n.label}
                  </p>
                ))}
              </nav>
              <div className="relative min-h-[430px] overflow-hidden p-4 sm:p-5">
                <p className="mb-4 font-display text-[1.6rem] leading-tight text-paper">{current.title}</p>
                <div className="relative">
                  {prev && (
                    <div className="absolute inset-0">
                      <Screen tab={prev} />
                    </div>
                  )}
                  <div key={tab} className="tab-mask relative bg-navy-deep" onAnimationEnd={() => setPrev(null)}>
                    <Screen tab={tab} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Datos de la pestaña activa */}
          <aside className="flex flex-col lg:col-span-3" aria-live="polite">
            <p className="text-[15px] leading-relaxed text-paper/70">{current.text}</p>
            <dl key={tab} className="tab-in mt-6 border-t border-hair">
              {current.facts.map((f) => (
                <div key={f.label} className="border-b border-hair py-5">
                  <dt className="sr-only">{f.label}</dt>
                  <dd className="tabular font-display text-[2.4rem] leading-none text-rose-light">{f.value}</dd>
                  <dd aria-hidden className="mt-2 text-[14px] leading-snug text-paper/70">{f.label}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-8 text-[13px] text-paper/60 lg:mt-auto">
              Incluida en todos los planes.{" "}
              <a href="#planes" className="u-draw pb-0.5 text-paper">
                Ver planes
              </a>
            </p>
          </aside>
        </div>
      </Container>
    </section>
  );
}
