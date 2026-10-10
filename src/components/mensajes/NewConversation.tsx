"use client";

import { Search } from "lucide-react";
import { useActionState, useMemo, useState } from "react";
import { createGroupChatAction, openDirectAction, type ChatState } from "@/app/mensajes/actions";
import { cn } from "@/lib/utils";
import type { Contact } from "@/modules/messages/server";

const field = "h-11 w-full rounded-md border border-line bg-surface px-3 text-[16px] focus:border-navy focus:outline-none";

export function NewConversation({ contacts, staff }: { contacts: Contact[]; staff: boolean }) {
  const [tab, setTab] = useState<"persona" | "grupo">("persona");
  const [q, setQ] = useState("");
  const [canal, setCanal] = useState(false);
  const [state, action, pending] = useActionState<ChatState, FormData>(createGroupChatAction, {});
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const shown = useMemo(() => contacts.filter((c) => (!canal || tab !== "grupo" || c.team) && (!q || norm(c.name).includes(norm(q)) || c.via.some((v) => norm(v).includes(norm(q))))), [contacts, q, canal, tab]);
  if (!contacts.length)
    return <p className="rounded-md border border-dashed border-line bg-surface p-6 text-center text-[14px] text-muted">Todavía no compartís ningún espacio con otra persona. Sumate a un grupo de gastos o a una Flota, o pedile a tu estudio que te invite.</p>;
  return (
    <div className="grid gap-4">
      <div role="tablist" aria-label="Tipo de conversación" className="grid grid-cols-2 rounded-md border border-line p-1">
        {(
          [
            ["persona", "Con una persona"],
            ["grupo", staff ? "Grupo o canal" : "Grupo"],
          ] as const
        ).map(([k, t]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cn("h-10 rounded-[4px] text-[14px]", tab === k ? "bg-navy text-paper" : "text-muted hover:text-ink")}>
            {t}
          </button>
        ))}
      </div>
      <label className="relative">
        <span className="sr-only">Filtrar tus contactos</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrar por nombre o espacio" className={cn(field, "pl-9")} />
      </label>
      {tab === "persona" ? (
        <ul className="divide-y divide-line overflow-hidden rounded-md border border-line bg-surface">
          {shown.map((c) => (
            <li key={c.id} className="flex items-center gap-3 px-4 py-3">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px]">{c.name}</span>
                <span className="block truncate text-[12px] text-muted">{c.via.join(" · ")}</span>
              </span>
              <form action={openDirectAction}>
                <input type="hidden" name="user" value={c.id} />
                <button className="h-9 rounded-md border border-line px-3 text-[13px] hover:border-muted">Escribir</button>
              </form>
            </li>
          ))}
          {shown.length === 0 && <li className="px-4 py-6 text-center text-[14px] text-muted">Nadie coincide con el filtro.</li>}
        </ul>
      ) : (
        <form action={action} className="grid gap-3">
          {canal && <input type="hidden" name="canal" value="1" />}
          <label className="grid gap-1.5 text-[14px]">
            {canal ? "Nombre del canal" : "Nombre de la conversación"}
            <input name="title" required minLength={2} maxLength={80} placeholder={canal ? "Liquidaciones, Clientes nuevos…" : "Cumple de Ana, Viaje…"} className={field} />
          </label>
          {staff && (
            <label className="flex items-center gap-2 text-[14px]">
              <input type="checkbox" checked={canal} onChange={(e) => setCanal(e.target.checked)} className="size-4 accent-navy" />
              Canal interno del equipo (solo personas del estudio)
            </label>
          )}
          <fieldset className="overflow-hidden rounded-md border border-line bg-surface">
            <legend className="sr-only">Personas</legend>
            <ul className="max-h-[50vh] divide-y divide-line overflow-y-auto">
              {shown.map((c) => (
                <li key={c.id}>
                  <label className="flex cursor-pointer items-center gap-3 px-4 py-2.5">
                    <input type="checkbox" name="users" value={c.id} className="size-4 accent-navy" />
                    <span className="min-w-0">
                      <span className="block truncate text-[15px]">{c.name}</span>
                      <span className="block truncate text-[12px] text-muted">{c.via.join(" · ")}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
          {state.message && (
            <p role="alert" className="text-[14px] text-danger">
              {state.message}
            </p>
          )}
          <button disabled={pending} className="h-11 rounded-md bg-navy px-5 text-paper hover:bg-night disabled:opacity-60 sm:justify-self-start">
            {pending ? "Creando…" : canal ? "Crear el canal" : "Crear la conversación"}
          </button>
        </form>
      )}
    </div>
  );
}
