import { Bell, CalendarClock, Download, FileText, House, MessageSquare, MoreHorizontal } from "lucide-react";
import Image from "next/image";
import { InstallPanel } from "@/components/app/InstallApp";
import { Container } from "@/components/web/ui";

const TABS = [
  { icon: House, label: "Inicio", on: true },
  { icon: CalendarClock, label: "Vencim." },
  { icon: FileText, label: "Docs" },
  { icon: MessageSquare, label: "Consultas" },
  { icon: MoreHorizontal, label: "Más" },
];

/** Celular con la app abierta: inicio del portal y menú inferior */
function Phone() {
  return (
    <div aria-hidden className="relative mx-auto w-[280px] sm:w-[300px]">
      <div className="rounded-[46px] border border-paper/15 bg-[#0b0e18] p-2.5 shadow-[0_40px_80px_-30px_rgba(0,0,0,0.8)]">
        <div className="on-paper relative overflow-hidden rounded-[38px] bg-paper text-ink">
          {/* Barra de estado */}
          <div className="flex items-center justify-between bg-navy px-6 pb-2 pt-3 text-[11px] text-paper">
            <span className="tabular">9:41</span>
            <span className="h-5 w-20 rounded-full bg-black/70" />
            <span className="tabular">100%</span>
          </div>
          {/* Encabezado */}
          <div className="bg-navy px-5 pb-5 pt-2 text-paper">
            <p className="text-[11px] text-paper/60">Agencia Norte</p>
            <p className="mt-0.5 font-display text-[22px] leading-tight">Hola, Martina</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="border border-paper/15 px-3 py-2">
                <p className="text-[10px] text-paper/60">A pagar en octubre</p>
                <p className="tabular font-display text-[17px]">$1.284.300</p>
              </div>
              <div className="border border-paper/15 px-3 py-2">
                <p className="text-[10px] text-paper/60">Resuelto</p>
                <p className="tabular font-display text-[17px]">8/10</p>
              </div>
            </div>
          </div>
          {/* Avisos */}
          <ul className="space-y-2 px-4 py-4 text-[12px]">
            <li className="flex items-center gap-3 border border-line bg-white px-3 py-2.5">
              <span className="grid size-8 shrink-0 place-items-center bg-rose-soft text-rose-deep">
                <Bell className="size-4" strokeWidth={1.5} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">IVA vence en 3 días</span>
                <span className="tabular block text-muted">$642.180 · VEP listo</span>
              </span>
              <span className="bg-navy px-2 py-1 text-[10px] text-paper">Pagar</span>
            </li>
            <li className="flex items-center gap-3 border border-line bg-white px-3 py-2.5">
              <span className="grid size-8 shrink-0 place-items-center bg-navy-soft text-ink">
                <FileText className="size-4" strokeWidth={1.5} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">Recibos de sueldo listos</span>
                <span className="block text-muted">12 recibos de septiembre</span>
              </span>
            </li>
            <li className="flex items-center gap-3 border border-line bg-white px-3 py-2.5">
              <span className="grid size-8 shrink-0 place-items-center bg-navy-soft text-ink">
                <MessageSquare className="size-4" strokeWidth={1.5} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">Lucía te respondió</span>
                <span className="block text-muted">Sobre el alta de la diseñadora</span>
              </span>
            </li>
          </ul>
          {/* Menú inferior */}
          <div className="grid grid-cols-5 border-t border-line bg-white px-1 pb-5 pt-2">
            {TABS.map((t) => (
              <span key={t.label} className={`flex flex-col items-center gap-1 text-[9px] ${t.on ? "text-navy" : "text-muted"}`}>
                <t.icon className={`size-[18px] ${t.on ? "text-rose-deep" : ""}`} strokeWidth={1.5} />
                {t.label}
              </span>
            ))}
          </div>
        </div>
      </div>
      {/* Ícono de la app, como en la pantalla de inicio */}
      <div className="absolute -left-6 top-24 hidden w-20 flex-col items-center gap-1.5 sm:flex lg:-left-16">
        <Image src="/icons/icon-192.png" alt="" width={64} height={64} className="rounded-[16px] shadow-[0_16px_30px_-12px_rgba(0,0,0,0.7)]" />
        <span className="text-[11px] text-paper/70">Cristofaro</span>
      </div>
    </div>
  );
}

/**
 * Descargá la app: la plataforma instalada en el celular o la computadora
 * (PWA). El botón se adapta al dispositivo de quien la mira.
 */
export function AppDownload() {
  return (
    <section id="app" aria-labelledby="app-titulo" className="scroll-mt-16 overflow-hidden border-t border-hair bg-night py-16 text-paper lg:py-32">
      <Container className="grid items-center gap-16 lg:grid-cols-12 lg:gap-12">
        <div className="lg:col-span-6">
          <p className="flex items-center gap-3 text-[13px] text-paper/60">
            <span className="size-1.5 bg-rose-light" aria-hidden />
            La app de Estudio Cristofaro
          </p>
          <h2 id="app-titulo" className="display-md mt-8 max-w-[16ch]">
            La contabilidad de tu empresa, <span className="text-rose-light">desde cualquier lugar.</span>
          </h2>
          <p className="mt-6 max-w-lg text-[17px] leading-relaxed text-paper/65">
            Descargá nuestra app y seguí todo lo de tu empresa desde el celular o la compu: qué vence, qué ya está pagado, tus documentos y la charla
            con tu contador. Gratis para todos los clientes.
          </p>
          <p className="mt-10 flex items-center gap-2 text-[15px] font-medium text-paper">
            <Download className="size-4 text-rose-light" aria-hidden />
            Descargá la aplicación acá
          </p>
          <InstallPanel className="mt-4" />
        </div>
        <div className="lg:col-span-5 lg:col-start-8">
          <Phone />
        </div>
      </Container>
    </section>
  );
}
