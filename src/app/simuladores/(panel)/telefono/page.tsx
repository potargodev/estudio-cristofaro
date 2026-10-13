import type { Metadata } from "next";
import Link from "next/link";
import { Mic, Paperclip, Send, Smartphone } from "lucide-react";
import { phoneAction } from "@/app/simuladores/actions";
import { Feedback } from "@/components/app/Feedback";
import { EmptyState, Panel, SubmitButton, chipClass, fieldClass } from "@/components/ds";
import { requireTenant } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { modeOf } from "@/modules/simuladores/server";
import { phoneData } from "@/modules/simuladores/panel";

export const metadata: Metadata = { title: "Teléfono de prueba" };

const SAMPLES = ["Facturale 25000 a Juan Pérez por honorarios", "SÍ", "Pagué 8500 de nafta", "¿Cuánto facturé este mes?", "Me di de baja de los avisos"];

/** Parte C · Teléfono de prueba: le escribís al Vigía como si fueras la persona de ese número (texto, audio de prueba, foto o PDF) */
export default async function TelefonoPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await requireTenant();
  const sp = await searchParams;
  if ((await modeOf(me.studioId, null, "whatsapp")) !== "simulador")
    return <EmptyState icon={Smartphone} title="WhatsApp no está en modo Simulador" text="El teléfono de prueba solo funciona con el simulador de WhatsApp. Los modos los cambia el equipo de Faro." />;
  const d = await phoneData(me.studioId, sp.numero ?? null);
  if (!d.current)
    return <EmptyState icon={Smartphone} title="Sin números verificados" text="Verificá un número desde los datos de una persona de una organización (WhatsApp → verificar). En el simulador el código llega a la bitácora del panel." action={{ href: "/simuladores", label: "Ver el panel" }} />;
  return (
    <div className="grid max-w-2xl gap-4">
      <Feedback sp={sp} />
      <div className="flex flex-wrap gap-2" aria-label="Números verificados">
        {d.contacts.map((c) => (
          <Link key={c.phone} href={`/simuladores/telefono?numero=${c.phone}`} className={chipClass(c.phone === d.current?.phone)}>
            {c.name} · {c.organization}
          </Link>
        ))}
      </div>
      <Panel title={`Chat de ${d.current.name} con el Vigía`} icon={Smartphone}>
        <ol className="grid max-h-[28rem] gap-2 overflow-y-auto" aria-label="Conversación">
          {d.messages.length === 0 && <li className="text-ui text-muted">Todavía no hay mensajes. Probá con uno de los ejemplos de abajo.</li>}
          {d.messages.map((m) => (
            <li key={m.id} className={cn("max-w-[85%] rounded-md border px-3 py-2 text-ui", m.direction === "entrante" ? "justify-self-end border-line bg-surface" : "justify-self-start border-line bg-navy-soft")}>
              <p className="whitespace-pre-wrap break-words">{m.body || (m.template ? `Aviso de Faro (plantilla «${m.template}»)` : m.kind === "audio" ? "🎤 Audio" : m.kind === "imagen" ? "📷 Foto" : m.kind === "documento" ? "📄 Archivo" : `(${m.kind})`)}</p>
              <p className="mt-1 text-caption text-muted">
                {formatDate(m.created, "time")}
                {m.status === "fallido" ? " · no salió" : ""}
              </p>
            </li>
          ))}
        </ol>
      </Panel>
      <form action={phoneAction} className="grid gap-3" encType="multipart/form-data">
        <input type="hidden" name="phone" value={d.current.phone} />
        <label className="text-meta text-muted">
          Mensaje
          <input name="text" list="ejemplos" autoComplete="off" placeholder="Escribile al Vigía…" className={cn(fieldClass, "mt-1")} />
          <datalist id="ejemplos">
            {SAMPLES.map((x) => (
              <option key={x} value={x} />
            ))}
          </datalist>
        </label>
        <details className="text-ui">
          <summary className="cursor-pointer text-muted">
            <Mic className="mr-1 inline size-4" aria-hidden /> Audio de prueba o <Paperclip className="mx-1 inline size-4" aria-hidden /> foto o PDF
          </summary>
          <div className="mt-3 grid gap-3">
            <label className="text-meta text-muted">
              Lo que dirías en el audio (viaja como un audio y vuelve como su transcripción)
              <input name="audio" placeholder="Facturale cuarenta mil a Ana López por diseño" className={cn(fieldClass, "mt-1")} />
            </label>
            <label className="text-meta text-muted">
              Foto de un ticket o un PDF
              <input name="file" type="file" accept="image/*,application/pdf" className={cn(fieldClass, "mt-1")} />
            </label>
          </div>
        </details>
        <div>
          <SubmitButton pendingText="Enviando…">
            <Send className="size-4" aria-hidden /> Enviar
          </SubmitButton>
        </div>
      </form>
    </div>
  );
}
