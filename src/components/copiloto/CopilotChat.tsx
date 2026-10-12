"use client";

import { Camera, Check, Clock, FileText, Loader2, Mic, Paperclip, Pencil, RotateCcw, Send, Settings2, Square, Undo2, WandSparkles, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { confirmCardAction, editGroupCardAction, editMovementCardAction, redoCardAction, retryMessageAction, setAutoAction, undoCardAction, type CardState } from "@/app/vigia/actions";
import { cn } from "@/lib/utils";
import { fieldClass } from "@/components/ds/primitives";
import { formatDate, formatNumber } from "@/lib/format";

// Vigía: chat estilo WhatsApp con el agente (IA). Visualmente distinto de
// Mensajes (personas): burbujas con el acento rosé y el ícono de varita.

export interface ChatProposal {
  id: string;
  tool: string;
  status: "propuesta" | "confirmada" | "deshecha" | "descartada";
  auto: boolean;
  title: string;
  lines: string[];
  needsConfirm: boolean;
  data: Record<string, unknown>;
  error?: string | null;
}

export interface ChatMessage {
  id: string;
  role: "usuario" | "copiloto";
  kind: string;
  text: string | null;
  transcript: string | null;
  hasFile: boolean;
  fileName: string | null;
  fileMime: string | null;
  status: "ok" | "procesando" | "pendiente" | "error";
  createdAt: string;
  proposals: ChatProposal[];
}

const TOOL_LABEL: Record<string, string> = { registrar_en_caja_compartida: "Caja compartida", crear_movimiento: "Bitácora", crear_gasto_en_grupo: "Grupo de gastos", crear_grupo: "Grupo nuevo", recordar: "Recordatorio" };
const STATUS_LABEL: Record<string, string> = { propuesta: "Para confirmar", confirmada: "Registrado", deshecha: "Deshecho", descartada: "Descartado" };
const field = `mt-1 ${fieldClass}`;

function CardForm({ action, id, children, className }: { action: (p: CardState, fd: FormData) => Promise<CardState>; id: string; children: React.ReactNode; className?: string }) {
  const [state, act, pending] = useActionState(action, { ok: true });
  return (
    <form action={act} className={className}>
      <input type="hidden" name="id" value={id} />
      <fieldset disabled={pending} className="contents">
        {children}
      </fieldset>
      {state.message && !state.ok && (
        <p role="alert" className="mt-1 text-caption text-danger">
          {state.message}
        </p>
      )}
    </form>
  );
}

function Card({ p, categories }: { p: ChatProposal; categories: { id: string; name: string }[] }) {
  const [editing, setEditing] = useState(false);
  const d = p.data as Record<string, string | number | null>;
  const btn = "inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-meta font-medium";
  return (
    <div className={cn("mt-2 rounded-lg border bg-surface p-3", p.status === "propuesta" ? "border-rose-light" : "border-line", (p.status === "deshecha" || p.status === "descartada") && "opacity-60")}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-micro uppercase tracking-[0.12em] text-muted">{p.title.startsWith("Negocio ·") ? "Caja de negocio" : (TOOL_LABEL[p.tool] ?? "Registro")}</p>
          <p className={cn("text-body font-semibold text-ink", (p.status === "deshecha" || p.status === "descartada") && "line-through")}>{p.title}</p>
          {p.lines.map((l, i) => (
            <p key={i} className="text-meta text-muted">
              {l}
            </p>
          ))}
        </div>
        <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-micro", p.status === "confirmada" ? "bg-navy-soft text-ink" : "text-muted")}>
          {p.auto && p.status === "confirmada" ? "Registrado solo" : STATUS_LABEL[p.status]}
        </span>
      </div>
      {p.status === "propuesta" && p.needsConfirm && <p className="mt-1 text-caption text-muted">Afecta a otras personas: confirmalo vos.</p>}
      {!editing && (
        <div className="mt-2 flex flex-wrap gap-2">
          {p.status === "propuesta" && p.tool === "registrar_en_caja_compartida" && (
            <>
              {/* Dos finales (§18.4): los elige quien pagó, en el momento */}
              <CardForm action={confirmCardAction} id={p.id}>
                <input type="hidden" name="final" value="registrar" />
                <button type="submit" className={cn(btn, "bg-navy text-paper hover:bg-night")}>
                  <Check className="size-4" aria-hidden /> Solo registrar
                </button>
              </CardForm>
              <CardForm action={confirmCardAction} id={p.id}>
                <input type="hidden" name="final" value="dividir" />
                <button type="submit" className={cn(btn, "bg-navy text-paper hover:bg-night")}>
                  <Check className="size-4" aria-hidden /> Dividir
                </button>
              </CardForm>
            </>
          )}
          {p.status === "propuesta" && p.tool !== "registrar_en_caja_compartida" && (
            <CardForm action={confirmCardAction} id={p.id}>
              <button type="submit" className={cn(btn, "bg-navy text-paper hover:bg-night")}>
                <Check className="size-4" aria-hidden /> Confirmar
              </button>
            </CardForm>
          )}
          {(p.status === "propuesta" || (p.status === "confirmada" && p.tool === "crear_movimiento")) && (p.tool === "crear_movimiento" || p.tool === "crear_gasto_en_grupo") && (
            <button type="button" onClick={() => setEditing(true)} className={cn(btn, "border border-line hover:border-muted")}>
              <Pencil className="size-4" aria-hidden /> Editar
            </button>
          )}
          {(p.status === "propuesta" || p.status === "confirmada") && (
            <CardForm action={undoCardAction} id={p.id}>
              <button type="submit" className={cn(btn, "border border-line hover:border-muted")}>
                <Undo2 className="size-4" aria-hidden /> {p.status === "propuesta" ? "Descartar" : "Deshacer"}
              </button>
            </CardForm>
          )}
          {p.status === "deshecha" && p.tool === "crear_movimiento" && (
            <CardForm action={redoCardAction} id={p.id}>
              <button type="submit" className={cn(btn, "border border-line hover:border-muted")}>
                <RotateCcw className="size-4" aria-hidden /> Rehacer
              </button>
            </CardForm>
          )}
          {p.status === "confirmada" && p.tool === "crear_gasto_en_grupo" && typeof d.groupId === "string" && (
            <Link href={`/grupos/g/${d.groupId}`} className={cn(btn, "border border-line hover:border-muted")}>
              Ver el grupo
            </Link>
          )}
          {p.status === "confirmada" && p.tool === "registrar_en_caja_compartida" && typeof d.boxId === "string" && (
            <Link href={`/cajas/${d.boxId}`} className={cn(btn, "border border-line hover:border-muted")}>
              Ver la caja
            </Link>
          )}
          {p.status === "confirmada" && p.tool === "crear_movimiento" && (
            <Link href="/bitacora" className={cn(btn, "border border-line hover:border-muted")}>
              Ver en Bitácora
            </Link>
          )}
        </div>
      )}
      {editing && p.tool === "crear_movimiento" && (
        <CardForm action={editMovementCardAction} id={p.id} className="mt-3 grid grid-cols-2 gap-2 text-caption text-muted">
          <label className="col-span-2">
            Descripción
            <input name="description" defaultValue={String(d.description ?? "")} required className={field} />
          </label>
          <label>
            Monto
            <input name="amount" defaultValue={formatNumber((Number(d.amount) || 0) / 100, 2)} inputMode="decimal" required className={field} />
          </label>
          <label>
            Tipo
            <select name="kind" defaultValue={String(d.kind ?? "gasto")} className={field}>
              <option value="gasto">Gasto</option>
              <option value="ingreso">Ingreso</option>
            </select>
          </label>
          <label>
            Fecha
            <input name="date" type="date" defaultValue={String(d.date ?? "")} required className={field} />
          </label>
          <label>
            Moneda
            <select name="currency" defaultValue={String(d.currency ?? "ARS")} className={field}>
              <option value="ARS">ARS</option>
              <option value="USD">USD</option>
            </select>
          </label>
          <label className="col-span-2">
            Categoría
            <select name="category" defaultValue={String(d.categoryId ?? "")} className={field}>
              <option value="">Sin categoría</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="col-span-2">
            Medio de pago
            <select name="method" defaultValue={String(d.paymentMethod ?? "")} className={field}>
              <option value="">Sin indicar</option>
              <option value="efectivo">Efectivo</option>
              <option value="debito">Débito</option>
              <option value="credito">Crédito</option>
              <option value="transferencia">Transferencia</option>
              <option value="mercado_pago">Mercado Pago</option>
            </select>
          </label>
          <input type="hidden" name="note" value={String(d.note ?? "")} />
          <div className="col-span-2 flex gap-2">
            <button type="submit" className="inline-flex h-9 items-center rounded-md bg-navy px-3 text-meta font-medium text-paper">
              {p.status === "propuesta" ? "Guardar y confirmar" : "Guardar"}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="inline-flex h-9 items-center rounded-md border border-line px-3 text-meta">
              Cancelar
            </button>
          </div>
        </CardForm>
      )}
      {editing && p.tool === "crear_gasto_en_grupo" && (
        <CardForm action={editGroupCardAction} id={p.id} className="mt-3 grid grid-cols-2 gap-2 text-caption text-muted">
          <label className="col-span-2">
            Descripción
            <input name="description" defaultValue={String(d.description ?? "")} required className={field} />
          </label>
          <label>
            Monto total
            <input name="amount" defaultValue={formatNumber((Number(d.amount) || 0) / 100, 2)} inputMode="decimal" required className={field} />
          </label>
          <label>
            Fecha
            <input name="date" type="date" defaultValue={String(d.date ?? "")} required className={field} />
          </label>
          <p className="col-span-2">El reparto se recalcula en la misma proporción. Para cambiar quién participa, editalo después en el grupo.</p>
          <div className="col-span-2 flex gap-2">
            <button type="submit" className="inline-flex h-9 items-center rounded-md bg-navy px-3 text-meta font-medium text-paper" onClick={() => setTimeout(() => setEditing(false), 400)}>
              Actualizar
            </button>
            <button type="button" onClick={() => setEditing(false)} className="inline-flex h-9 items-center rounded-md border border-line px-3 text-meta">
              Cancelar
            </button>
          </div>
        </CardForm>
      )}
    </div>
  );
}

function Bubble({ m, categories }: { m: ChatMessage; categories: { id: string; name: string }[] }) {
  const mine = m.role === "usuario";
  const file = m.hasFile ? `/api/copiloto/archivo/${m.id}` : null;
  return (
    <li id={`m-${m.id}`} className={cn("scroll-mt-20", mine ? "flex justify-end" : "flex justify-start")}>
      <div className={cn("max-w-[88%] sm:max-w-[75%]", !mine && "flex gap-2")}>
        {!mine && (
          <span aria-hidden className="mt-1 grid size-7 shrink-0 place-items-center rounded-full bg-gold text-night">
            <WandSparkles className="size-3.5" />
          </span>
        )}
        <div className="min-w-0">
          <div className={cn("rounded-2xl px-3.5 py-2.5 text-body leading-snug", mine ? "rounded-br-md bg-navy text-paper" : "rounded-bl-md border border-line bg-surface text-ink")}>
            {file && m.kind === "audio" && <audio controls preload="none" src={file} className="mb-1 h-10 w-60 max-w-full" aria-label="Audio que mandaste" />}
            {file && m.kind === "imagen" && (
              <a href={file} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={file} alt="Imagen que mandaste" className="mb-1 max-h-60 rounded-lg object-cover" />
              </a>
            )}
            {file && m.kind === "pdf" && (
              <a href={file} target="_blank" rel="noreferrer" className="mb-1 flex items-center gap-2 underline underline-offset-4">
                <FileText className="size-4" aria-hidden /> {m.fileName ?? "PDF"}
              </a>
            )}
            {m.text &&
              (mine ? (
                <p className="whitespace-pre-wrap break-words">{m.text}</p>
              ) : (
                <div className="copilot-md break-words [&_a]:font-medium [&_a]:text-rose-deep [&_a]:underline [&_li]:ml-4 [&_li]:list-disc [&_p+p]:mt-2 [&_ul]:mt-1">
                  <ReactMarkdown components={{ a: ({ href = "", children }) => (href.startsWith("/") ? <Link href={href}>{children}</Link> : <a href={href} target="_blank" rel="noreferrer">{children}</a>) }}>{m.text}</ReactMarkdown>
                </div>
              ))}
            {m.transcript && <p className={cn("mt-1 text-meta italic", mine ? "text-paper/75" : "text-muted")}>«{m.transcript}»</p>}
          </div>
          <p className={cn("mt-0.5 flex items-center gap-1 px-1 text-micro text-muted", mine && "justify-end")}>
            {m.status === "procesando" && <Loader2 className="size-3 animate-spin motion-reduce:animate-none" aria-hidden />}
            {m.status === "pendiente" && <Clock className="size-3" aria-hidden />}
            {formatDate(m.createdAt, "time")}
            {m.status === "procesando" && " · interpretando…"}
            {m.status === "pendiente" && " · en cola: lo proceso apenas vuelva la IA"}
            {m.status === "error" && " · no se pudo procesar"}
          </p>
          {mine && (m.status === "pendiente" || m.status === "error") && (
            <form action={retryMessageAction} className="flex justify-end">
              <input type="hidden" name="id" value={m.id} />
              <button type="submit" className="text-caption text-rose-deep underline underline-offset-4">
                Reintentar ahora
              </button>
            </form>
          )}
          {m.proposals.map((p) => (
            <Card key={p.id} p={p} categories={categories} />
          ))}
        </div>
      </div>
    </li>
  );
}

function pickMime() {
  if (typeof MediaRecorder === "undefined") return null;
  for (const t of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]) if (MediaRecorder.isTypeSupported(t)) return t;
  return "";
}

export function CopilotChat({ messages, categories, aiReady, auto, embedded = false }: { messages: ChatMessage[]; categories: { id: string; name: string }[]; aiReady: boolean; auto: boolean; embedded?: boolean }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [optimistic, setOptimistic] = useState<ChatMessage | null>(null);
  const [rec, setRec] = useState<{ start: number } | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [settings, setSettings] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const cancelRec = useRef(false);
  const end = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const camInput = useRef<HTMLInputElement>(null);

  const list = optimistic ? [...messages, optimistic] : messages;
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [list.length]);
  // Mientras haya algo en cola o procesándose, se refresca solo
  const busy = messages.some((m) => m.status === "pendiente" || m.status === "procesando");
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => router.refresh(), 10_000);
    return () => clearInterval(t);
  }, [busy, router]);
  useEffect(() => {
    if (!rec) return;
    const t = setInterval(() => setElapsed(Math.round((Date.now() - rec.start) / 1000)), 250);
    return () => clearInterval(t);
  }, [rec]);

  const send = useCallback(
    async (opts: { text?: string; file?: File | null }) => {
      const t = (opts.text ?? "").trim();
      if (!t && !opts.file) return;
      setSending(true);
      setError(null);
      setOptimistic({ id: "tmp", role: "usuario", kind: opts.file ? (opts.file.type.startsWith("audio") ? "audio" : opts.file.type === "application/pdf" ? "pdf" : "imagen") : "texto", text: t || (opts.file ? opts.file.name : null), transcript: null, hasFile: false, fileName: opts.file?.name ?? null, fileMime: null, status: "procesando", createdAt: new Date().toISOString(), proposals: [] });
      const fd = new FormData();
      if (t) fd.set("text", t);
      if (opts.file) fd.set("file", opts.file);
      try {
        const r = await fetch("/api/copiloto", { method: "POST", body: fd });
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        if (!r.ok) setError(j.error ?? "No pude mandar el mensaje.");
        else {
          setText("");
          setFile(null);
        }
      } catch {
        setError("Sin conexión. Probá de nuevo.");
      } finally {
        setSending(false);
        setOptimistic(null);
        router.refresh();
      }
    },
    [router],
  );

  const startRec = async () => {
    if (rec || sending) return;
    setError(null);
    const mime = pickMime();
    if (mime === null || !navigator.mediaDevices?.getUserMedia) {
      setError("Tu navegador no permite grabar audio. Escribime o mandá una foto.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      cancelRec.current = false;
      r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      r.onstop = () => {
        stream.getTracks().forEach((x) => x.stop());
        const type = (r.mimeType || mime || "audio/webm").split(";")[0];
        const blob = new Blob(chunks.current, { type });
        setRec(null);
        setElapsed(0);
        if (cancelRec.current || blob.size < 1500) return;
        const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
        void send({ text, file: new File([blob], `audio.${ext}`, { type }) });
      };
      recorder.current = r;
      r.start();
      setRec({ start: Date.now() });
    } catch {
      setError("No pude usar el micrófono. Revisá el permiso del navegador.");
    }
  };
  const stopRec = (cancel = false) => {
    cancelRec.current = cancel;
    if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
  };
  // Mantener apretado: al soltar (después de 0,6 s) se manda. Un toque corto
  // deja grabando hasta tocar "Terminar y mandar".
  useEffect(() => {
    if (!rec) return;
    const up = () => {
      if (Date.now() - rec.start > 600) stopRec(false);
    };
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, [rec]);

  return (
    <div className={cn("flex flex-col", embedded ? "min-h-[calc(100dvh-7rem)]" : "min-h-[calc(100dvh-14rem)]")}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span aria-hidden className="grid size-10 place-items-center rounded-full bg-gold text-night">
            <WandSparkles className="size-5" />
          </span>
          <div>
            <h1 className="text-title font-semibold leading-tight">Vigía</h1>
            <p className="text-caption text-muted">Tu asistente con IA · registra y responde</p>
          </div>
        </div>
        <div className="relative">
          <button type="button" onClick={() => setSettings((s) => !s)} aria-expanded={settings} aria-label="Ajustes del Vigía" data-tour="copiloto-ajustes" className="grid size-9 place-items-center rounded-md border border-line bg-surface hover:border-muted">
            <Settings2 className="size-4" aria-hidden />
          </button>
          {settings && (
            <form action={setAutoAction} className="absolute right-0 top-full z-20 mt-1 w-72 rounded-md border border-line bg-surface p-3 text-ui shadow-overlay">
              <label className="flex items-start gap-2">
                <input type="checkbox" name="auto" defaultChecked={auto} className="mt-1 size-4 accent-navy" onChange={(e) => e.currentTarget.form?.requestSubmit()} />
                <span>
                  Registrar solo mis movimientos personales
                  <span className="block text-caption text-muted">Siempre con Deshacer. Los gastos de grupo siempre te los pregunto.</span>
                </span>
              </label>
            </form>
          )}
        </div>
      </div>
      {!aiReady && (
        <p role="note" className="mb-3 rounded-md border border-[#e3cf9f] bg-[#fbf5e6] px-3 py-2 text-meta text-[#7a5410]">
          La IA todavía no está configurada: por ahora solo leo texto y no puedo interpretar audios ni fotos.
        </p>
      )}
      <ol aria-label="Conversación con el Vigía" aria-live="polite" className="flex-1 space-y-3 pb-4">
        {list.map((m) => (
          <Bubble key={m.id} m={m} categories={categories} />
        ))}
      </ol>
      <div ref={end} />
      <div className={cn("sticky z-20 -mx-4 border-t border-line bg-canvas/95 px-4 py-2.5 backdrop-blur", embedded ? "bottom-0 pb-[calc(0.625rem+env(safe-area-inset-bottom))]" : "bottom-[var(--app-bottom,0px)] sm:-mx-6 sm:px-6 lg:bottom-0 lg:mx-0 lg:rounded-lg lg:border lg:px-3")}>
        {error && (
          <p role="alert" className="mb-2 text-meta text-danger">
            {error}
          </p>
        )}
        {file && (
          <p className="mb-2 flex items-center gap-2 text-meta">
            <Paperclip className="size-3.5" aria-hidden /> <span className="truncate">{file.name}</span>
            <button type="button" onClick={() => setFile(null)} aria-label="Quitar el archivo" className="text-muted hover:text-ink">
              <X className="size-4" aria-hidden />
            </button>
          </p>
        )}
        {rec ? (
          <div className="flex items-center gap-3" role="status">
            <span className="size-3 animate-pulse rounded-full bg-danger motion-reduce:animate-none" aria-hidden />
            <span className="flex-1 text-body tabular-nums">Grabando… {elapsed}s · soltá para mandar</span>
            <button type="button" onClick={() => stopRec(true)} className="h-10 rounded-md border border-line px-3 text-meta">
              Cancelar
            </button>
            <button type="button" onClick={() => stopRec(false)} aria-label="Terminar y mandar" className="grid size-11 place-items-center rounded-full bg-navy text-paper">
              <Square className="size-4" aria-hidden />
            </button>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send({ text, file });
            }}
            className="flex items-end gap-1.5"
          >
            <input ref={fileInput} type="file" accept="image/*,application/pdf,audio/*" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <input ref={camInput} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <button type="button" onClick={() => fileInput.current?.click()} aria-label="Adjuntar foto, captura o PDF" data-tour="copiloto-adjunto" className="grid size-11 shrink-0 place-items-center rounded-full text-muted hover:bg-surface hover:text-ink">
              <Paperclip className="size-5" aria-hidden />
            </button>
            <button type="button" onClick={() => camInput.current?.click()} aria-label="Sacar una foto" className="grid size-11 shrink-0 place-items-center rounded-full text-muted hover:bg-surface hover:text-ink sm:hidden">
              <Camera className="size-5" aria-hidden />
            </button>
            <label htmlFor="copiloto-texto" className="sr-only">
              Mensaje para el Vigía
            </label>
            <textarea
              id="copiloto-texto"
              data-tour="copiloto-texto"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send({ text, file });
                }
              }}
              rows={1}
              maxLength={2000}
              placeholder="Contame un gasto…"
              className="max-h-32 min-h-11 flex-1 resize-none rounded-3xl border border-line bg-surface px-4 py-2.5 text-body text-ink placeholder:text-muted focus:border-navy focus:outline-none"
            />
            {text.trim() || file ? (
              <button type="submit" disabled={sending} aria-label="Mandar" className="grid size-11 shrink-0 place-items-center rounded-full bg-navy text-paper disabled:opacity-60">
                {sending ? <Loader2 className="size-5 animate-spin motion-reduce:animate-none" aria-hidden /> : <Send className="size-5" aria-hidden />}
              </button>
            ) : (
              <button
                type="button"
                disabled={sending}
                aria-label="Mantené apretado para grabar un audio (o tocá para empezar y terminar)"
                data-tour="copiloto-mic"
                onPointerDown={(e) => {
                  e.preventDefault();
                  void startRec();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    void startRec();
                  }
                }}
                className="grid size-11 shrink-0 touch-none select-none place-items-center rounded-full bg-gold text-night disabled:opacity-60"
              >
                {sending ? <Loader2 className="size-5 animate-spin motion-reduce:animate-none" aria-hidden /> : <Mic className="size-5" aria-hidden />}
              </button>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
