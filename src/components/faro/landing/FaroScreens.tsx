"use client";

import { BadgeCheck, CalendarClock, Check, Clock, FileText, Inbox, LayoutDashboard, MapPin, MessageSquare, Ship, Sparkles, Star, Users } from "lucide-react";
import { useState } from "react";
import { SplitHeading } from "@/components/web/SplitHeading";
import { Container, SectionIndex } from "@/components/web/ui";
import { cn } from "@/lib/utils";

// Pantallas reales de Faro construidas en código, con datos ficticios (sin
// fotos de stock). Entran con un movimiento sutil que se apaga con
// prefers-reduced-motion (.faro-demo-in).

const d = (n: number) => ({ "--d": n }) as React.CSSProperties;

function Frame({ title, children, phone = false }: { title: string; children: React.ReactNode; phone?: boolean }) {
  return (
    <div className={cn("overflow-hidden rounded-lg border border-hair-strong bg-navy-deep shadow-[0_30px_80px_-30px_rgba(0,0,0,0.6)]", phone && "mx-auto max-w-[340px] rounded-[28px] border-[6px] border-[#0d1120]")}>
      {!phone && (
        <div className="flex items-center gap-1.5 border-b border-hair px-4 py-2.5">
          <span className="size-2.5 rounded-full bg-paper/15" />
          <span className="size-2.5 rounded-full bg-paper/15" />
          <span className="size-2.5 rounded-full bg-paper/15" />
          <span className="ml-3 truncate text-[11px] text-paper/40">{title}</span>
        </div>
      )}
      {children}
    </div>
  );
}

function StudioScreen() {
  const nav = [LayoutDashboard, Users, CalendarClock, Inbox, FileText, Sparkles];
  const stats = [
    { l: "Organizaciones activas", v: "38" },
    { l: "Vencen esta semana", v: "14" },
    { l: "Solicitudes abiertas", v: "6" },
    { l: "Para aprobar", v: "3" },
  ];
  const rows = [
    { o: "Panadería La Espiga", t: "IVA · DDJJ mensual", s: "Hoy", tone: "text-rose-light" },
    { o: "Estudio de diseño Norte", t: "Monotributo · cuota", s: "Mañana", tone: "text-gold" },
    { o: "Transportes Paraná SRL", t: "F.931 · cargas sociales", s: "Jue 16", tone: "text-paper/70" },
    { o: "Dra. Valeria Sosa", t: "Ganancias · anticipo", s: "Vie 17", tone: "text-paper/70" },
  ];
  return (
    <Frame title="app.faro · Resumen del estudio">
      <div className="flex min-h-[340px]">
        <div className="hidden w-14 shrink-0 flex-col items-center gap-4 border-r border-hair bg-night py-4 sm:flex">
          <span className="font-display text-[15px] text-gold">F</span>
          {nav.map((I, i) => (
            <I key={i} className={cn("size-4", i === 0 ? "text-rose-light" : "text-paper/40")} strokeWidth={1.5} aria-hidden />
          ))}
        </div>
        <div className="min-w-0 flex-1 p-4 sm:p-5">
          <p className="font-display text-[22px] text-paper">Hola, Marina</p>
          <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
            {stats.map((s, i) => (
              <div key={s.l} className="faro-demo-in rounded-md border border-hair p-3" style={d(i * 80)}>
                <p className="text-[11px] text-paper/50">{s.l}</p>
                <p className="mt-1 font-display text-[26px] leading-none text-paper">{s.v}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-[11px] uppercase tracking-[0.12em] text-paper/45">Requiere atención</p>
          <ul className="mt-2 divide-y divide-hair rounded-md border border-hair">
            {rows.map((r, i) => (
              <li key={r.o} className="faro-demo-in flex items-center gap-3 px-3 py-2 text-[12px]" style={d(300 + i * 90)}>
                <CalendarClock className="size-3.5 shrink-0 text-gold/80" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-paper/85">
                  {r.o} <span className="text-paper/45">· {r.t}</span>
                </span>
                <span className={r.tone}>{r.s}</span>
              </li>
            ))}
          </ul>
          <div className="faro-demo-in mt-3 flex items-start gap-2 rounded-md border border-gold/30 bg-gold/[0.07] px-3 py-2 text-[12px] text-paper/85" style={d(750)}>
            <Sparkles className="mt-0.5 size-3.5 shrink-0 text-gold" aria-hidden />
            La IA preparó 3 recordatorios de vencimiento. Quedan en Aprobaciones hasta que los revises.
          </div>
        </div>
      </div>
    </Frame>
  );
}

function PortalScreen() {
  return (
    <Frame title="Portal del cliente" phone>
      <div className="bg-navy-deep px-4 pb-5 pt-6">
        <p className="text-[11px] text-paper/45">Panadería La Espiga · tu estudio</p>
        <p className="mt-1 font-display text-[24px] text-paper">Hola, Rubén</p>
        <div className="faro-demo-in mt-4 rounded-lg border border-hair p-3" style={d(0)}>
          <p className="text-[11px] text-paper/50">Próximo vencimiento</p>
          <p className="mt-1 text-[15px] text-paper">IVA de septiembre</p>
          <p className="font-display text-[28px] leading-tight text-gold">$ 482.900</p>
          <p className="text-[11px] text-paper/50">Vence hoy · con link de pago</p>
        </div>
        <ul className="mt-3 grid gap-2 text-[12px]">
          {[
            { i: FileText, t: "Subiste 4 comprobantes", s: "Recibido por el estudio" },
            { i: MessageSquare, t: "¿Puedo facturarle a un cliente del exterior?", s: "Respondida" },
            { i: CalendarClock, t: "Cargas sociales", s: "Pagado" },
          ].map((x, k) => (
            <li key={x.t} className="faro-demo-in flex items-center gap-2.5 rounded-md border border-hair px-3 py-2" style={d(150 + k * 100)}>
              <x.i className="size-3.5 shrink-0 text-rose-light" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-paper/85">{x.t}</span>
              <span className="shrink-0 text-paper/45">{x.s}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 grid grid-cols-4 gap-1 border-t border-hair pt-3 text-center text-[10px] text-paper/50">
          {["Inicio", "Vencimientos", "Documentos", "Más"].map((x, i) => (
            <span key={x} className={i === 0 ? "text-paper" : ""}>
              {x}
            </span>
          ))}
        </div>
      </div>
    </Frame>
  );
}

function RedScreen() {
  const list = [
    { n: "Estudio Ríos & Asociados", z: "Rosario, Santa Fe · presencial y remoto", r: "4,9", c: 23, h: "Responde en 3 h" },
    { n: "Contadora Lucía Ferrero", z: "Córdoba · remoto", r: "4,8", c: 11, h: "Responde en 5 h" },
    { n: "Estudio Paraná", z: "Paraná, Entre Ríos · presencial", r: "4,6", c: 31, h: "Responde en 1 día" },
  ];
  return (
    <Frame title="Red de estudios · orden neutral">
      <div className="p-4 sm:p-5">
        <div className="flex flex-wrap gap-2 text-[11px]">
          {["Zona: Rosario", "Rubro: Gastronomía", "Servicio: Monotributo"].map((f) => (
            <span key={f} className="rounded border border-hair px-2 py-1 text-paper/70">
              {f}
            </span>
          ))}
        </div>
        <ul className="mt-3 grid gap-2">
          {list.map((x, i) => (
            <li key={x.n} className="faro-demo-in rounded-md border border-hair p-3" style={d(i * 110)}>
              <div className="flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-md bg-night font-display text-[16px] text-gold">{x.n.charAt(0)}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] text-paper">{x.n}</p>
                  <p className="flex items-center gap-1 text-[11px] text-paper/50">
                    <MapPin className="size-3" aria-hidden /> {x.z}
                  </p>
                  <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-paper/70">
                    <span className="flex items-center gap-1">
                      <BadgeCheck className="size-3 text-gold" aria-hidden /> Matrícula verificada
                    </span>
                    <span className="flex items-center gap-1">
                      <Star className="size-3 text-gold" aria-hidden /> {x.r} · {x.c} reseñas
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="size-3" aria-hidden /> {x.h}
                    </span>
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] text-paper/45">Nadie paga por aparecer primero. Reseñas solo de clientes reales.</p>
      </div>
    </Frame>
  );
}

function FlotaScreen() {
  const props = [
    { s: "Estudio Ríos", m: "$ 58.000", ri: "$ 115.000", v: 4 },
    { s: "Lucía Ferrero", m: "$ 52.000", ri: "$ 120.000", v: 2 },
  ];
  return (
    <Frame title="Flota · grupo informal · Diseñadores de Rosario">
      <div className="grid gap-4 p-4 sm:grid-cols-[1fr_1.3fr] sm:p-5">
        <div>
          <p className="flex items-center gap-2 text-[13px] text-paper">
            <Ship className="size-4 text-gold" aria-hidden /> Tripulación · 7 de 20
          </p>
          <ul className="mt-2 grid gap-1.5 text-[12px]">
            {[
              ["Sofía", "Monotributista", "Capitán"],
              ["Martín", "Monotributista", "Aceptó"],
              ["Carla", "Resp. inscripta", "Aceptó"],
              ["Nico", "Monotributista", "Activo"],
            ].map(([n, p, s], i) => (
              <li key={n} className="faro-demo-in flex items-center justify-between gap-2 rounded border border-hair px-2.5 py-1.5" style={d(i * 70)}>
                <span className="text-paper/85">
                  {n} <span className="text-paper/45">· {p}</span>
                </span>
                <span className={s === "Aceptó" ? "flex items-center gap-1 text-gold" : "text-paper/50"}>
                  {s === "Aceptó" && <Check className="size-3" aria-hidden />}
                  {s}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-paper/45">Nadie ve las finanzas de nadie.</p>
        </div>
        <div>
          <p className="text-[13px] text-paper">Propuestas · precio por integrante</p>
          <table className="mt-2 w-full text-left text-[12px]">
            <thead className="text-[10px] uppercase tracking-[0.1em] text-paper/45">
              <tr>
                <th className="pb-1.5 font-medium">Estudio</th>
                <th className="pb-1.5 text-right font-medium">Monotributo</th>
                <th className="pb-1.5 text-right font-medium">RI</th>
                <th className="pb-1.5 text-right font-medium">Votos</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hair">
              {props.map((p, i) => (
                <tr key={p.s} className="faro-demo-in" style={d(250 + i * 100)}>
                  <td className="py-2 text-paper/85">{p.s}</td>
                  <td className="py-2 text-right tabular-nums text-paper">{p.m}</td>
                  <td className="py-2 text-right tabular-nums text-paper/70">{p.ri}</td>
                  <td className="py-2 text-right text-gold">{p.v}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="faro-demo-in mt-3 rounded-md border border-gold/30 bg-gold/[0.07] px-3 py-2 text-[12px] text-paper/85" style={d(550)}>
            Cada uno firma su propio acuerdo y paga solo su abono. Sin deuda solidaria.
          </div>
        </div>
      </div>
    </Frame>
  );
}

const TABS = [
  { key: "estudio", label: "El estudio", text: "La cartera entera en una pantalla: lo que vence, lo que espera respuesta y lo que la IA dejó para aprobar.", C: StudioScreen },
  { key: "portal", label: "El cliente", text: "Cada cliente tiene su portal y su app: vencimientos con el importe, documentos, consultas y su equipo.", C: PortalScreen },
  { key: "red", label: "La Red", text: "Un directorio neutral de estudios con matrícula verificada, reseñas reales y el tiempo de respuesta medido en Faro.", C: RedScreen },
  { key: "flota", label: "Una Flota", text: "Entre 3 y 20 personas piden juntas una propuesta. Comparan, votan y cada una decide por su cuenta.", C: FlotaScreen },
] as const;

export function FaroScreens() {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("estudio");
  const t = TABS.find((x) => x.key === tab)!;
  return (
    <section id="pantallas" aria-labelledby="pantallas-titulo" className="scroll-mt-16 border-t border-hair bg-night py-16 lg:py-32">
      <Container>
        <div className="grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-6">
            <SectionIndex n="05">Así se ve</SectionIndex>
            <SplitHeading id="pantallas-titulo" className="display-md mt-8 text-paper">
              Pantallas reales, datos de ejemplo.
            </SplitHeading>
          </div>
          <p className="self-end text-[15px] leading-relaxed text-paper/65 lg:col-span-4 lg:col-start-9">Nada de fotos de stock: esto es Faro, con nombres e importes inventados.</p>
        </div>
        <div role="tablist" aria-label="Pantallas de Faro" className="mt-12 flex flex-wrap gap-2">
          {TABS.map((x) => (
            <button
              key={x.key}
              role="tab"
              type="button"
              aria-selected={x.key === tab}
              aria-controls={`pantalla-${x.key}`}
              onClick={() => setTab(x.key)}
              className={cn("rounded-[2px] border px-4 py-2 text-[14px] transition-colors duration-300", x.key === tab ? "border-gold bg-gold/10 text-paper" : "border-hair-strong text-paper/65 hover:text-paper")}
            >
              {x.label}
            </button>
          ))}
        </div>
        <div id={`pantalla-${t.key}`} role="tabpanel" className="mt-8 grid gap-8 lg:grid-cols-12 lg:items-center">
          <p className="text-[17px] leading-relaxed text-paper/75 lg:col-span-4">{t.text}</p>
          <div key={t.key} className="min-w-0 lg:col-span-8">
            <t.C />
          </div>
        </div>
        <p className="mt-6 text-[12px] text-paper/40">Ejemplos ilustrativos con datos ficticios.</p>
      </Container>
    </section>
  );
}
