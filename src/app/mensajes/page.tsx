import { BellOff, Hash, MessagesSquare, Plus, Ship, User, Users, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PushToggle } from "@/components/mensajes/PushToggle";
import { cn } from "@/lib/utils";
import { blockedList, listConversations } from "@/modules/messages/server";
import { requireChatUser } from "@/modules/messages/session";
import { unblockAction } from "./actions";

export const metadata: Metadata = { title: { absolute: "Mensajes · Faro" } };

const ICON = { directo: User, grupo: Users, gastos: Wallet, flota: Ship, equipo: Hash } as const;
const KIND = { directo: "", grupo: "Grupo", gastos: "Grupo de gastos", flota: "Flota", equipo: "Canal del equipo" } as const;

const when = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return new Intl.DateTimeFormat("es-AR", today ? { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "America/Argentina/Buenos_Aires" } : { day: "numeric", month: "short", timeZone: "America/Argentina/Buenos_Aires" }).format(d);
};

/** Mensajes: conversaciones con personas con las que compartís un espacio */
export default async function MensajesPage() {
  const me = await requireChatUser();
  const [list, blocked] = await Promise.all([listConversations(me), blockedList(me)]);
  return (
    <div className="grid gap-5 pb-10">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[clamp(2rem,6vw,2.6rem)] leading-tight">Mensajes</h1>
          <p className="mt-1 text-[14px] text-muted">Con las personas de tu estudio, tu organización, tus grupos de gastos y tus Flotas.</p>
        </div>
        <Link href="/mensajes/nueva" className="inline-flex h-10 items-center gap-1.5 rounded-md bg-navy px-4 text-[14px] font-medium text-paper hover:bg-night">
          <Plus className="size-4" aria-hidden /> Nueva conversación
        </Link>
      </header>

      {list.length === 0 ? (
        <div className="rounded-md border border-dashed border-line bg-surface p-8 text-center">
          <MessagesSquare className="mx-auto size-8 text-muted" strokeWidth={1.5} aria-hidden />
          <p className="mt-3 text-[15px]">Todavía no tenés conversaciones.</p>
          <p className="mt-1 text-[14px] text-muted">Cuando compartas un grupo de gastos o una Flota, su conversación aparece acá sola.</p>
        </div>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-md border border-line bg-surface">
          {list.map((c) => {
            const Icon = ICON[c.kind as keyof typeof ICON] ?? User;
            return (
              <li key={c.id}>
                <Link href={`/mensajes/${c.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-canvas">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-rose-soft text-rose-deep">
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className={cn("truncate text-[15px]", c.unread > 0 && "font-semibold")}>{c.title}</span>
                      {KIND[c.kind as keyof typeof KIND] && <span className="shrink-0 text-[11px] text-muted">{KIND[c.kind as keyof typeof KIND]}</span>}
                      {c.muted && <BellOff className="size-3.5 shrink-0 text-muted" aria-label="Silenciada" />}
                    </span>
                    <span className={cn("block truncate text-[13px]", c.unread > 0 ? "text-ink" : "text-muted")}>{c.last ?? "Sin mensajes todavía"}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-[12px] text-muted">{when(c.lastAt)}</span>
                    {c.unread > 0 && (
                      <span className="grid h-5 min-w-5 place-items-center rounded-full bg-gold px-1.5 text-[11px] font-semibold text-night" aria-label={`${c.unread} sin leer`}>
                        {c.unread > 99 ? "99+" : c.unread}
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <PushToggle />

      {blocked.length > 0 && (
        <section aria-labelledby="bloqueadas" className="rounded-md border border-line bg-surface p-4">
          <h2 id="bloqueadas" className="text-[15px] font-semibold">
            Personas bloqueadas
          </h2>
          <ul className="mt-2 divide-y divide-line">
            {blocked.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 py-2 text-[14px]">
                {b.name}
                <form action={unblockAction}>
                  <input type="hidden" name="user" value={b.id} />
                  <button className="text-[13px] text-muted underline-offset-4 hover:text-ink hover:underline">Desbloquear</button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
