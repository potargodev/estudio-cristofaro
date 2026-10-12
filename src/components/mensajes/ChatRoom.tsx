"use client";

import { ArrowLeft, Ban, Bell, BellOff, CornerUpLeft, Flag, LogOut, MoreVertical, Paperclip, Pencil, Send, Smile, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Popover } from "@/components/ds/Popover";
import { toast } from "sonner";
import { blockAction, deleteMessageAction, editMessageAction, leaveAction, markReadAction, muteAction, reportAction, typingAction } from "@/app/mensajes/actions";
import { cn } from "@/lib/utils";
import type { ConversationView, MessageView } from "@/modules/messages/server";
import { formatDate } from "@/lib/format";

const EMOJIS = ["😀", "😂", "😊", "😍", "🙏", "👍", "👏", "🙌", "🎉", "❤️", "🔥", "✅", "👀", "🤔", "😅", "😢", "😮", "💸", "🧾", "🍕", "🍻", "✈️", "🏠", "⚽"];
const REASONS: [string, string][] = [
  ["acoso", "Acoso o insultos"],
  ["spam", "Spam o estafa"],
  ["inapropiado", "Contenido inapropiado"],
  ["datos", "Comparte datos personales de otros"],
  ["otro", "Otro"],
];
const initials = (n: string) => n.split(/\s+/).slice(0, 2).map((x) => x[0]?.toUpperCase() ?? "").join("");

/**
 * Sala de una conversación. Distinta del Vigía a propósito: burbujas rosé
 * para lo propio, iniciales de cada persona y sin tarjetas de IA. Tiempo real
 * por SSE (si se corta, sondeo cada 5 s).
 */
export function ChatRoom({ initial, meId }: { initial: ConversationView; meId: string }) {
  const router = useRouter();
  const [view, setView] = useState(initial);
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [reply, setReply] = useState<MessageView | null>(null);
  const [editing, setEditing] = useState<MessageView | null>(null);
  const [sending, setSending] = useState(false);
  const [emoji, setEmoji] = useState(false);
  const emojiBtn = useRef<HTMLButtonElement>(null);
  const closeEmoji = useCallback(() => setEmoji(false), []);
  const [menu, setMenu] = useState(false);
  const menuBtn = useRef<HTMLButtonElement>(null);
  const closeMenu = useCallback(() => setMenu(false), []);
  const [typingNames, setTypingNames] = useState<Record<string, number>>({});
  const [report, setReport] = useState<MessageView | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const lastTyping = useRef(0);
  const convId = initial.id;

  const reload = useCallback(async () => {
    const r = await fetch(`/api/mensajes/c/${convId}`, { cache: "no-store" });
    if (r.status === 404) return router.push("/mensajes");
    if (r.ok) setView((await r.json()) as ConversationView);
  }, [convId, router]);

  // Tiempo real: SSE; si falla, sondeo
  useEffect(() => {
    let poll: number | undefined;
    let es: EventSource | null = null;
    const startPolling = () => {
      if (poll) return;
      poll = window.setInterval(() => void reload(), 5000);
    };
    const visibleRead = () => document.visibilityState === "visible" && void markReadAction(convId);
    if ("EventSource" in window) {
      es = new EventSource("/api/mensajes/stream");
      const onChange = (ev: MessageEvent) => {
        const e = JSON.parse(ev.data) as { conversationId?: string; userId?: string };
        if (e.conversationId !== convId) return;
        void reload().then(() => (ev.type === "message" && e.userId !== meId ? visibleRead() : undefined));
      };
      for (const t of ["message", "edit", "delete", "read"]) es.addEventListener(t, onChange as EventListener);
      es.addEventListener("typing", ((ev: MessageEvent) => {
        const e = JSON.parse(ev.data) as { conversationId: string; userId: string };
        if (e.conversationId === convId && e.userId !== meId) setTypingNames((x) => ({ ...x, [e.userId]: Date.now() }));
      }) as EventListener);
      es.addEventListener("membership", () => void reload());
      es.onerror = () => {
        if (es?.readyState === EventSource.CLOSED) startPolling();
      };
    } else startPolling();
    const onVis = () => visibleRead();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      es?.close();
      if (poll) window.clearInterval(poll);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [convId, meId, reload]);

  // "escribiendo…" se apaga solo a los 4 s
  useEffect(() => {
    const t = window.setInterval(() => setTypingNames((x) => Object.fromEntries(Object.entries(x).filter(([, at]) => Date.now() - at < 4000))), 1000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [view.messages.length]);

  const send = async () => {
    if (editing) {
      const r = await editMessageAction(editing.id, text);
      if (!r.ok) return toast.error(r.message ?? "No pudimos editarlo.");
      setEditing(null);
      setText("");
      return reload();
    }
    if (!text.trim() && !file) return;
    setSending(true);
    const fd = new FormData();
    fd.set("body", text);
    if (reply) fd.set("replyTo", reply.id);
    if (file) fd.set("file", file);
    try {
      const r = await fetch(`/api/mensajes/c/${convId}`, { method: "POST", body: fd });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) toast.error(j.error ?? "No pudimos mandar el mensaje.");
      else {
        setText("");
        setFile(null);
        setReply(null);
        await reload();
      }
    } catch {
      toast.error("Sin conexión. Probá de nuevo.");
    } finally {
      setSending(false);
      area.current?.focus();
    }
  };

  const onType = (v: string) => {
    setText(v);
    if (Date.now() - lastTyping.current > 2500 && v.trim()) {
      lastTyping.current = Date.now();
      void typingAction(convId);
    }
  };

  const others = view.members.filter((m) => m.id !== meId);
  const typingList = Object.keys(typingNames)
    .map((id) => others.find((o) => o.id === id)?.name.split(" ")[0])
    .filter(Boolean);
  const mineLast = [...view.messages].reverse().find((m) => m.mine && !m.deleted);
  const seenBy = mineLast ? others.filter((o) => o.lastReadAt && o.lastReadAt >= mineLast.createdAt) : [];

  return (
    <div className="flex min-h-[calc(100dvh-13rem)] flex-col">
      <header className="sticky top-[var(--app-top,3.5rem)] z-20 -mx-4 flex items-center gap-2 border-b border-line bg-canvas/95 px-4 py-2 backdrop-blur sm:mx-0 sm:px-0">
        <Link href="/mensajes" aria-label="Volver a Mensajes" className="grid size-9 place-items-center rounded-md hover:bg-surface">
          <ArrowLeft className="size-4" aria-hidden />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lead font-semibold">{view.title}</h1>
          <p className="truncate text-caption text-muted">
            {typingList.length ? `${typingList.join(", ")} ${typingList.length === 1 ? "está" : "están"} escribiendo…` : view.kind === "directo" ? "Conversación privada" : `${view.members.length} personas`}
            {view.href && (
              <>
                {" · "}
                <Link href={view.href} className="underline underline-offset-2">
                  {view.kind === "gastos" ? "Ver el grupo" : "Ver la Flota"}
                </Link>
              </>
            )}
          </p>
        </div>
        <div className="relative">
          <button ref={menuBtn} type="button" onClick={() => setMenu((x) => !x)} aria-expanded={menu} aria-haspopup="menu" aria-label="Opciones de la conversación" className="grid size-9 place-items-center rounded-md hover:bg-surface">
            <MoreVertical className="size-4" aria-hidden />
          </button>
          <Popover open={menu} onClose={closeMenu} anchor={menuBtn} label="Opciones de la conversación" className="w-64 border border-line bg-surface p-1 text-ui">
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left hover:bg-canvas"
                onClick={async () => {
                  setMenu(false);
                  const r = await muteAction(convId, !view.muted);
                  toast(r.message ?? "");
                  void reload();
                }}
              >
                {view.muted ? <Bell className="size-4" aria-hidden /> : <BellOff className="size-4" aria-hidden />} {view.muted ? "Activar avisos" : "Silenciar"}
              </button>
              {view.kind === "directo" && view.otherId && !view.blockedOther && (
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-danger hover:bg-canvas"
                  onClick={async () => {
                    setMenu(false);
                    if (!confirm(`¿Bloquear a ${view.title}? No te va a poder escribir y no vas a ver sus mensajes.`)) return;
                    const r = await blockAction(view.otherId!);
                    toast(r.message ?? "");
                    void reload();
                  }}
                >
                  <Ban className="size-4" aria-hidden /> Bloquear a {view.title.split(" ")[0]}
                </button>
              )}
              {(view.kind === "grupo" || view.kind === "equipo") && (
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left hover:bg-canvas"
                  onClick={() => {
                    setMenu(false);
                    if (confirm("¿Salir de esta conversación?")) void leaveAction(convId);
                  }}
                >
                  <LogOut className="size-4" aria-hidden /> Salir de la conversación
                </button>
              )}
          </Popover>
        </div>
      </header>

      <ol className="grid flex-1 content-end gap-1.5 py-4" aria-live="polite">
        {view.messages.length === 0 && <li className="py-10 text-center text-ui text-muted">Todavía no hay mensajes. Escribí el primero.</li>}
        {view.messages.map((m, i) => {
          const prev = view.messages[i - 1];
          const newDay = !prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
          const showName = !m.mine && view.kind !== "directo" && (!prev || prev.authorId !== m.authorId || newDay);
          return (
            <li key={m.id} id={`msg-${m.id}`}>
              {newDay && <p className="my-3 text-center text-caption text-muted first-letter:uppercase">{formatDate(m.createdAt, "weekday")}</p>}
              <div className={cn("group flex items-start gap-2", m.mine ? "justify-end" : "justify-start")}>
                {!m.mine && (
                  <span aria-hidden className={cn("grid size-7 shrink-0 place-items-center rounded-full bg-navy-soft text-micro font-semibold text-ink", showName && "mt-5", !showName && view.kind !== "directo" && "invisible")}>
                    {initials(m.authorName)}
                  </span>
                )}
                <div className={cn("max-w-[80%] sm:max-w-[70%]")}>
                  {showName && <p className="mb-0.5 ml-1 text-caption font-medium text-rose-deep">{m.authorName}</p>}
                  <div className={cn("rounded-md border px-3 py-2 text-body leading-snug", m.mine ? "rounded-br-xs border-rose-light/50 bg-rose-soft" : "rounded-bl-xs border-line bg-surface", m.deleted && "italic text-muted")}>
                    {m.replyTo && (
                      <a href={`#msg-${m.replyTo.id}`} className="mb-1.5 block rounded-md border-l-2 border-rose-deep bg-canvas/70 px-2 py-1 text-caption text-muted">
                        <span className="font-medium text-ink">{m.replyTo.authorName}</span>: {m.replyTo.body?.slice(0, 90) ?? "Mensaje borrado"}
                      </a>
                    )}
                    {m.deleted ? (
                      "Mensaje borrado"
                    ) : (
                      <>
                        {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                        {m.file && (
                          <a href={`/api/mensajes/archivo/${m.id}`} target="_blank" rel="noreferrer" className="mt-1 flex items-center gap-1.5 text-meta underline underline-offset-2">
                            <Paperclip className="size-3.5" aria-hidden /> {m.file.name}
                          </a>
                        )}
                      </>
                    )}
                    <p className="mt-0.5 text-right text-micro text-muted">
                      {m.editedAt && !m.deleted && "editado · "}
                      {formatDate(m.createdAt, "time")}
                    </p>
                  </div>
                  {!m.deleted && (
                    <div className={cn("mt-0.5 flex gap-1 text-caption text-muted opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100", m.mine ? "justify-end" : "justify-start")}>
                      <button type="button" onClick={() => (setReply(m), setEditing(null), area.current?.focus())} className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-surface" aria-label="Responder">
                        <CornerUpLeft className="size-3" aria-hidden /> Responder
                      </button>
                      {m.mine ? (
                        <>
                          <button type="button" onClick={() => (setEditing(m), setReply(null), setText(m.body ?? ""), area.current?.focus())} className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-surface" aria-label="Editar">
                            <Pencil className="size-3" aria-hidden /> Editar
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              if (!confirm("¿Borrar este mensaje para todos?")) return;
                              const r = await deleteMessageAction(m.id);
                              if (!r.ok) toast.error(r.message ?? "");
                              void reload();
                            }}
                            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-surface"
                            aria-label="Borrar"
                          >
                            <Trash2 className="size-3" aria-hidden /> Borrar
                          </button>
                        </>
                      ) : (
                        <button type="button" onClick={() => setReport(m)} className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-surface" aria-label="Reportar">
                          <Flag className="size-3" aria-hidden /> Reportar
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </li>
          );
        })}
        {mineLast && seenBy.length > 0 && (
          <li className="text-right text-micro text-muted">{view.kind === "directo" ? "Visto" : `Visto por ${seenBy.length === others.length ? "todos" : seenBy.map((s) => s.name.split(" ")[0]).join(", ")}`}</li>
        )}
        <div ref={end} />
      </ol>

      <div className="sticky bottom-[var(--app-bottom,0px)] -mx-4 border-t border-line bg-canvas/95 px-4 py-2 backdrop-blur sm:mx-0 sm:px-0">
        {!view.canPost ? (
          <p className="py-2 text-center text-ui text-muted">No podés escribir en esta conversación.</p>
        ) : (
          <>
            {(reply || editing) && (
              <div className="mb-2 flex items-center gap-2 rounded-md border-l-2 border-rose-deep bg-surface px-3 py-1.5 text-meta">
                <span className="min-w-0 flex-1 truncate">{editing ? "Editando tu mensaje" : `Respondiendo a ${reply!.authorName}: ${reply!.body?.slice(0, 60) ?? ""}`}</span>
                <button type="button" aria-label="Cancelar" onClick={() => (setReply(null), editing && setText(""), setEditing(null))} className="grid size-7 place-items-center rounded hover:bg-canvas">
                  <X className="size-3.5" aria-hidden />
                </button>
              </div>
            )}
            {file && (
              <div className="mb-2 flex items-center gap-2 rounded-md bg-surface px-3 py-1.5 text-meta">
                <Paperclip className="size-3.5" aria-hidden /> <span className="min-w-0 flex-1 truncate">{file.name}</span>
                <button type="button" aria-label="Quitar el archivo" onClick={() => setFile(null)} className="grid size-7 place-items-center rounded hover:bg-canvas">
                  <X className="size-3.5" aria-hidden />
                </button>
              </div>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
              className="flex items-end gap-1.5"
            >
              <input ref={fileInput} type="file" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} accept="image/jpeg,image/png,application/pdf,.jpg,.jpeg,.png,.pdf,.xlsx,.docx,.csv" />
              <button type="button" onClick={() => fileInput.current?.click()} aria-label="Adjuntar un archivo" className="grid size-10 shrink-0 place-items-center rounded-md text-muted hover:bg-surface hover:text-ink">
                <Paperclip className="size-5" aria-hidden />
              </button>
              <button ref={emojiBtn} type="button" onClick={() => setEmoji((x) => !x)} aria-expanded={emoji} aria-haspopup="listbox" aria-label="Emojis" className="grid size-10 shrink-0 place-items-center rounded-md text-muted hover:bg-surface hover:text-ink">
                <Smile className="size-5" aria-hidden />
              </button>
              <Popover open={emoji} onClose={closeEmoji} anchor={emojiBtn} align="start" role="listbox" label="Emojis" className="grid w-[min(20rem,calc(100vw-1rem))] grid-cols-8 gap-1 border border-line bg-surface p-2">
                {EMOJIS.map((e) => (
                  <button key={e} type="button" role="option" aria-selected={false} onClick={() => (setText((t) => t + e), area.current?.focus())} className="h-(--control-h) rounded-md text-section hover:bg-canvas">
                    {e}
                  </button>
                ))}
              </Popover>
              <label className="min-w-0 flex-1">
                <span className="sr-only">Mensaje</span>
                <textarea
                  ref={area}
                  id="mensaje-texto"
                  rows={1}
                  value={text}
                  onChange={(e) => onType(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                  placeholder="Escribí un mensaje"
                  className="max-h-40 min-h-10 w-full resize-none rounded-md border border-line bg-surface px-3 py-2 text-lead focus:border-navy focus:outline-none"
                />
              </label>
              <button type="submit" disabled={sending} aria-label={editing ? "Guardar" : "Mandar"} className="grid size-10 shrink-0 place-items-center rounded-md bg-navy text-paper hover:bg-night disabled:opacity-60">
                <Send className="size-4" aria-hidden />
              </button>
            </form>
          </>
        )}
      </div>

      {report && <ReportDialog m={report} onClose={() => setReport(null)} />}
    </div>
  );
}

function ReportDialog({ m, onClose }: { m: MessageView; onClose: () => void }) {
  const [reason, setReason] = useState("acoso");
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-night/50 p-4" role="presentation" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="reporte-titulo" className="w-full max-w-sm rounded-md border border-line bg-surface p-5" onClick={(e) => e.stopPropagation()}>
        <h2 id="reporte-titulo" className="text-title font-semibold">
          Reportar mensaje
        </h2>
        <p className="mt-1 text-meta text-muted">El equipo de Faro ve solo este mensaje, no la conversación. Quien lo escribió no se entera de que lo reportaste.</p>
        <blockquote className="mt-3 rounded-md bg-canvas px-3 py-2 text-ui">{m.body?.slice(0, 200) ?? m.file?.name}</blockquote>
        <fieldset className="mt-3 grid gap-1.5 text-ui">
          <legend className="sr-only">Motivo</legend>
          {REASONS.map(([k, l]) => (
            <label key={k} className="flex items-center gap-2">
              <input type="radio" name="motivo" checked={reason === k} onChange={() => setReason(k)} className="size-4 accent-navy" /> {l}
            </label>
          ))}
        </fieldset>
        <textarea value={detail} onChange={(e) => setDetail(e.target.value)} maxLength={500} rows={2} placeholder="Contanos algo más (opcional)" className="mt-3 w-full rounded-md border border-line bg-surface px-3 py-2 text-ui" />
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-(--control-h) rounded-md border border-line px-4 text-ui">
            Cancelar
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const r = await reportAction(m.id, reason, detail);
              setBusy(false);
              if (r.ok) toast.success(r.message ?? "Reportado");
              else toast.error(r.message ?? "No pudimos reportarlo.");
              onClose();
            }}
            className="h-(--control-h) rounded-md bg-navy px-4 text-ui font-medium text-paper disabled:opacity-60"
          >
            Reportar
          </button>
        </div>
      </div>
    </div>
  );
}
