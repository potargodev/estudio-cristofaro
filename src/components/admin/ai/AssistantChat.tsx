"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, getToolName, isToolUIPart, type FileUIPart, type UIMessage } from "ai";
import {
  ArrowUp,
  AtSign,
  Bot,
  Building2,
  Check,
  ChevronDown,
  FileText,
  History,
  Inbox,
  Loader2,
  MessageSquarePlus,
  Paperclip,
  Plus,
  ShieldCheck,
  Square,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { decideInlineAction, deleteConversation, searchContextAction } from "@/app/admin/assistant-actions";
import { CONTEXT_LABEL, type ContextItem, type ContextKind } from "@/lib/ai/context";
import { cn } from "@/lib/utils";

export interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: string;
}

export interface ToolMeta {
  title: string;
  level: "lectura" | "escritura" | "sensible";
}

export type ApprovalStates = Record<string, { status: string; result?: unknown; reason?: string | null }>;

type Meta = { context?: { kind: ContextKind; id: string }[]; kind?: "confirmacion" | "cancelacion"; approvalId?: string; summary?: string };

const KIND_ICON = { organizacion: Building2, documento: FileText, solicitud: Inbox } as const;
const MAX_FILE = 4 * 1024 * 1024;
const FILE_ACCEPT = "image/png,image/jpeg,image/webp,application/pdf,text/plain,text/csv,.md";

const SUGGESTIONS = [
  "¿Qué vencimientos hay esta semana?",
  "Resumime las solicitudes abiertas y cuáles están por vencer.",
  "¿Qué documentos subieron los clientes que nadie revisó?",
  "Proponé horarios para una llamada con un cliente.",
];

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

// ───────────── markdown ─────────────

function Markdown({ text }: { text: string }) {
  return (
    <div className="faro-md text-[15px] leading-relaxed text-ink [overflow-wrap:anywhere]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          table: ({ children }) => (
            <div className="my-3 overflow-x-auto border border-line">
              <table className="w-full min-w-max border-collapse text-left text-[14px]">{children}</table>
            </div>
          ),
          th: ({ children }) => <th className="border-b border-line bg-paper px-3 py-2 font-medium">{children}</th>,
          td: ({ children }) => <td className="tabular border-b border-line px-3 py-2 align-top">{children}</td>,
          a: ({ href, children }) => (
            <a href={href} className="underline underline-offset-4 hover:text-rose-deep" target={href?.startsWith("/") ? undefined : "_blank"} rel="noreferrer">
              {children}
            </a>
          ),
          code: ({ children }) => <code className="bg-navy-soft px-1 font-mono text-[13px]">{children}</code>,
          pre: ({ children }) => <pre className="my-3 overflow-x-auto bg-navy-soft p-3 font-mono text-[13px]">{children}</pre>,
          ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>,
          p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
          h1: ({ children }) => <h3 className="mb-2 mt-4 text-[17px] font-semibold">{children}</h3>,
          h2: ({ children }) => <h3 className="mb-2 mt-4 text-[16px] font-semibold">{children}</h3>,
          h3: ({ children }) => <h4 className="mb-1 mt-3 text-[15px] font-semibold">{children}</h4>,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

// ───────────── tarjetas de herramientas ─────────────

type ToolPart = Extract<UIMessage["parts"][number], { toolCallId: string }>;

function Json({ value }: { value: unknown }) {
  const text = JSON.stringify(value, null, 2) ?? "";
  return <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words bg-paper p-2 font-mono text-[12px] leading-snug text-ink/80">{text.length > 6000 ? `${text.slice(0, 6000)}…` : text}</pre>;
}

function ToolCard({
  part,
  meta,
  approval,
  onDecide,
  busy,
}: {
  part: ToolPart;
  meta?: ToolMeta;
  approval?: ApprovalStates[string];
  onDecide: (approvalId: string, approve: boolean, summary: string) => void;
  busy: boolean;
}) {
  const name = getToolName(part as never);
  const [open, setOpen] = useState(false);
  const state = (part as { state: string }).state;
  const output = (part as { output?: unknown }).output as { estado?: string; aprobacion_id?: string; resumen?: string; motivo?: string } | undefined;
  const running = state === "input-streaming" || state === "input-available";
  const failed = state === "output-error" || output?.estado === "error" || output?.estado === "denegado";
  const needsConfirm = output?.estado === "requiere_confirmacion";
  const sentToApproval = output?.estado === "enviado_a_aprobacion";
  const status = approval?.status;

  return (
    <div className={cn("my-2 border bg-surface", sentToApproval ? "border-[#e2cdc4]" : needsConfirm ? "border-[#e3cf9f]" : "border-line")}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px]">
        {running ? (
          <Loader2 className="size-4 shrink-0 animate-spin text-muted motion-reduce:animate-none" aria-hidden />
        ) : (
          <Wrench className={cn("size-4 shrink-0", failed ? "text-danger" : "text-rose-deep")} strokeWidth={1.5} aria-hidden />
        )}
        <span className="min-w-0 flex-1 truncate">
          <span className="font-medium text-ink">{meta?.title ?? name}</span>
          <span className="text-muted">
            {" · "}
            {running
              ? "consultando…"
              : sentToApproval
                ? "enviado a aprobación"
                : needsConfirm
                  ? status === "ejecutada"
                    ? "confirmada"
                    : status === "cancelada"
                      ? "cancelada"
                      : status === "error"
                        ? "falló"
                        : "pide confirmación"
                  : failed
                    ? output?.motivo ?? "error"
                    : "listo"}
          </span>
        </span>
        <ChevronDown className={cn("size-4 shrink-0 text-muted transition-transform motion-reduce:transition-none", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <div className="grid gap-2 border-t border-line px-3 py-2 text-[12px]">
          <div>
            <p className="mb-1 font-medium text-muted">Qué consultó</p>
            <Json value={(part as { input?: unknown }).input} />
          </div>
          {state === "output-available" && (
            <div>
              <p className="mb-1 font-medium text-muted">Qué devolvió</p>
              <Json value={output} />
            </div>
          )}
          {state === "output-error" && <p className="text-danger">{(part as { errorText?: string }).errorText}</p>}
        </div>
      )}
      {needsConfirm && output?.aprobacion_id && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line bg-[#fbf5e6] px-3 py-2 text-[13px]">
          <p className="min-w-0 flex-1 text-ink [overflow-wrap:anywhere]">{output.resumen}</p>
          {!status || status === "pendiente" ? (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => onDecide(output.aprobacion_id!, false, output.resumen ?? "")}
                className="h-8 border border-line bg-surface px-3 text-[13px] hover:border-muted disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => onDecide(output.aprobacion_id!, true, output.resumen ?? "")}
                className="inline-flex h-8 items-center gap-1.5 bg-navy px-3 text-[13px] font-medium text-paper hover:bg-navy-deep disabled:opacity-50"
              >
                <Check className="size-4" aria-hidden />
                Confirmar
              </button>
            </>
          ) : (
            <span className="text-[13px] font-medium text-ink">{status === "ejecutada" ? "Confirmada y ejecutada" : status === "error" ? "Falló al ejecutar" : "Cancelada"}</span>
          )}
        </div>
      )}
      {sentToApproval && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line bg-[#f6efeb] px-3 py-2 text-[13px]">
          <ShieldCheck className="size-4 text-[#6d4a3c]" strokeWidth={1.5} aria-hidden />
          <p className="min-w-0 flex-1 text-ink [overflow-wrap:anywhere]">
            <strong className="font-medium">Enviado a aprobación.</strong> {output?.resumen}
          </p>
          <Link href="/admin/aprobaciones" className="font-medium underline underline-offset-4">
            {status && status !== "pendiente" ? (status === "ejecutada" ? "Aprobada" : status === "rechazada" ? "Rechazada" : "Ver") : "Ver en Aprobaciones"}
          </Link>
        </div>
      )}
    </div>
  );
}

// ───────────── selector de contexto ─────────────

function ContextPicker({ onPick, onFile, onClose }: { onPick: (c: ContextItem) => void; onFile: () => void; onClose: () => void }) {
  const [kind, setKind] = useState<ContextKind>("organizacion");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<ContextItem[]>([]);
  const [pending, start] = useTransition();
  useEffect(() => {
    const t = setTimeout(() => start(async () => setItems(await searchContextAction(kind, q))), 200);
    return () => clearTimeout(t);
  }, [kind, q]);
  return (
    <div role="dialog" aria-label="Adjuntar contexto" className="absolute bottom-full left-0 z-20 mb-2 w-[min(420px,calc(100vw-2rem))] border border-line bg-surface shadow-lg">
      <div className="flex items-center gap-1 border-b border-line p-1.5">
        {(Object.keys(CONTEXT_LABEL) as ContextKind[]).map((k) => {
          const Icon = KIND_ICON[k];
          return (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              aria-pressed={kind === k}
              className={cn("inline-flex h-8 items-center gap-1.5 px-2.5 text-[13px]", kind === k ? "bg-navy-soft text-ink" : "text-muted hover:text-ink")}
            >
              <Icon className="size-4" strokeWidth={1.5} aria-hidden />
              {CONTEXT_LABEL[k]}
            </button>
          );
        })}
        <button type="button" onClick={onFile} className="inline-flex h-8 items-center gap-1.5 px-2.5 text-[13px] text-muted hover:text-ink">
          <Paperclip className="size-4" strokeWidth={1.5} aria-hidden />
          Archivo
        </button>
        <button type="button" onClick={onClose} aria-label="Cerrar" className="ml-auto grid size-8 place-items-center text-muted hover:text-ink">
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <div className="p-2">
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`Buscar ${CONTEXT_LABEL[kind].toLowerCase()}…`}
          className="h-9 w-full border border-line bg-paper px-2 text-[14px] outline-none focus:border-muted"
        />
        <ul className="mt-2 max-h-60 overflow-y-auto">
          {items.map((it) => (
            <li key={it.id}>
              <button type="button" onClick={() => onPick(it)} className="flex w-full flex-col items-start px-2 py-1.5 text-left hover:bg-paper">
                <span className="text-[14px] text-ink">{it.label}</span>
                {it.hint && <span className="text-[12px] text-muted">{it.hint}</span>}
              </button>
            </li>
          ))}
          {!pending && items.length === 0 && <li className="px-2 py-3 text-[13px] text-muted">Sin resultados.</li>}
        </ul>
      </div>
    </div>
  );
}

// ───────────── chat ─────────────

export function AssistantChat({
  conversationId,
  isNew,
  initialMessages,
  conversations,
  models,
  defaultModel,
  orgs,
  initialContext,
  toolMeta,
  approvals: initialApprovals,
}: {
  conversationId: string;
  isNew: boolean;
  initialMessages: UIMessage[];
  conversations: ConversationSummary[];
  models: { value: string; label: string }[];
  defaultModel: string;
  orgs: { id: string; name: string }[];
  initialContext: ContextItem[];
  toolMeta: Record<string, ToolMeta>;
  approvals: ApprovalStates;
}) {
  const router = useRouter();
  const [model, setModel] = useState(defaultModel);
  const modelRef = useRef(model);
  modelRef.current = model;
  const [input, setInput] = useState("");
  const [chips, setChips] = useState<ContextItem[]>(initialContext);
  const [files, setFiles] = useState<FileUIPart[]>([]);
  const [picker, setPicker] = useState(false);
  const [history, setHistory] = useState(false);
  const [mention, setMention] = useState<{ q: string; start: number } | null>(null);
  const [approvals, setApprovals] = useState<ApprovalStates>(initialApprovals);
  const [fileError, setFileError] = useState<string | null>(null);
  const [deciding, setDeciding] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const started = useRef(!isNew);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/asistente",
        prepareSendMessagesRequest: ({ id, messages }) => ({ body: { id, message: messages[messages.length - 1], model: modelRef.current } }),
      }),
    [],
  );
  const { messages, sendMessage, status, stop, error, clearError } = useChat({ id: conversationId, messages: initialMessages, transport });
  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [messages, status]);

  // La conversación nueva pasa a tener URL propia y aparece en el historial
  useEffect(() => {
    if (status === "ready" && messages.length && !started.current) {
      started.current = true;
      window.history.replaceState(null, "", `/admin/asistente?c=${conversationId}`);
      router.refresh();
    }
  }, [status, messages.length, conversationId, router]);

  const mentionMatches = useMemo(() => {
    if (!mention) return [];
    const q = mention.q.toLowerCase();
    return orgs.filter((o) => o.name.toLowerCase().includes(q)).slice(0, 6);
  }, [mention, orgs]);

  function addChip(c: ContextItem) {
    setChips((list) => (list.some((x) => x.kind === c.kind && x.id === c.id) ? list : [...list, c].slice(0, 10)));
  }

  function onInput(value: string, caret: number) {
    setInput(value);
    const before = value.slice(0, caret);
    const m = /(^|\s)@([^\s@]{0,40})$/.exec(before);
    setMention(m ? { q: m[2], start: caret - m[2].length - 1 } : null);
  }

  function pickMention(o: { id: string; name: string }) {
    if (!mention) return;
    const caret = textarea.current?.selectionStart ?? input.length;
    const next = `${input.slice(0, mention.start)}@${o.name} ${input.slice(caret)}`;
    setInput(next);
    setMention(null);
    addChip({ kind: "organizacion", id: o.id, label: o.name });
    requestAnimationFrame(() => textarea.current?.focus());
  }

  async function onFiles(list: FileList | null) {
    setFileError(null);
    if (!list) return;
    for (const f of Array.from(list).slice(0, 4)) {
      if (f.size > MAX_FILE) {
        setFileError(`${f.name} supera los 4 MB.`);
        continue;
      }
      const mediaType = f.type || (f.name.endsWith(".md") ? "text/markdown" : "");
      if (!/^(image\/(png|jpeg|webp)|application\/pdf|text\/(plain|csv|markdown))$/.test(mediaType)) {
        setFileError(`${f.name}: formato no admitido (PDF, imagen o texto).`);
        continue;
      }
      setFiles((x) => [...x, { type: "file", mediaType, filename: f.name, url: "" }]);
      const url = await readAsDataUrl(f);
      setFiles((x) => x.map((p) => (p.filename === f.name && !p.url ? { ...p, url } : p)));
    }
  }

  function submit(text = input) {
    const t = text.trim();
    if ((!t && !files.length) || busy || files.some((f) => !f.url)) return;
    clearError();
    const metadata: Meta = { context: chips.map((c) => ({ kind: c.kind, id: c.id })) };
    void sendMessage(files.length ? { text: t || "Mirá este archivo.", files, metadata } : { text: t, metadata });
    setInput("");
    setFiles([]);
    setMention(null);
  }

  async function decide(approvalId: string, approve: boolean, summary: string) {
    setDeciding(true);
    const r = await decideInlineAction(approvalId, approve);
    setDeciding(false);
    const st = r.ok ? (r.status === "ejecutada" ? "ejecutada" : "cancelada") : "error";
    setApprovals((a) => ({ ...a, [approvalId]: { status: st } }));
    const metadata: Meta = { kind: approve ? "confirmacion" : "cancelacion", approvalId, summary };
    void sendMessage({ text: approve ? `Confirmé: ${summary}` : `Cancelé: ${summary}`, metadata });
  }

  const noModels = models.length === 0;

  return (
    <div className="relative -mt-2 flex h-[calc(100dvh-11rem)] min-h-[480px] border border-line bg-surface sm:h-[calc(100dvh-12rem)] lg:h-[calc(100dvh-7.5rem)]">
      {/* Historial */}
      <aside
        className={cn(
          "absolute inset-y-0 left-0 z-30 w-72 shrink-0 flex-col border-r border-line bg-paper lg:static lg:flex",
          history ? "flex shadow-xl" : "hidden",
        )}
        aria-label="Conversaciones"
      >
        <div className="flex items-center gap-2 border-b border-line p-3">
          <Link href="/admin/asistente?nueva=1" className="inline-flex h-9 flex-1 items-center justify-center gap-2 bg-navy text-[14px] font-medium text-paper hover:bg-navy-deep">
            <MessageSquarePlus className="size-4" aria-hidden />
            Conversación nueva
          </Link>
          <button type="button" onClick={() => setHistory(false)} aria-label="Cerrar historial" className="grid size-9 place-items-center border border-line lg:hidden">
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <ul className="flex-1 overflow-y-auto p-2">
          {conversations.length === 0 && <li className="px-2 py-3 text-[13px] text-muted">Tus conversaciones van a aparecer acá.</li>}
          {conversations.map((c) => (
            <li key={c.id} className="group flex items-center">
              <Link
                href={`/admin/asistente?c=${c.id}`}
                aria-current={c.id === conversationId ? "page" : undefined}
                className={cn("min-w-0 flex-1 truncate px-2 py-2 text-[14px]", c.id === conversationId ? "bg-navy-soft text-ink" : "text-ink/80 hover:bg-surface")}
              >
                {c.title}
              </Link>
              <form action={deleteConversation}>
                <input type="hidden" name="id" value={c.id} />
                <button type="submit" aria-label={`Borrar ${c.title}`} className="grid size-8 place-items-center text-muted opacity-60 hover:text-danger group-hover:opacity-100">
                  <Trash2 className="size-3.5" aria-hidden />
                </button>
              </form>
            </li>
          ))}
        </ul>
      </aside>

      {/* Chat */}
      <section className="relative flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-line px-3 py-2 sm:px-4">
          <button type="button" onClick={() => setHistory(true)} className="inline-flex h-8 items-center gap-1.5 border border-line px-2 text-[13px] lg:hidden" aria-label="Ver conversaciones">
            <History className="size-4" aria-hidden />
          </button>
          <p className="flex min-w-0 flex-1 items-center gap-2 text-[14px] font-medium text-ink">
            <Bot className="size-4 shrink-0 text-rose-deep" strokeWidth={1.5} aria-hidden />
            <span className="truncate">{conversations.find((c) => c.id === conversationId)?.title ?? "Faro · Asistente"}</span>
          </p>
          <label className="sr-only" htmlFor="modelo">
            Modelo
          </label>
          <select
            id="modelo"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            disabled={noModels}
            className="h-8 max-w-[45%] truncate border border-line bg-surface px-2 text-[13px] text-ink"
          >
            {models.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </header>

        <div className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-5 sm:px-6" aria-live="polite">
          {messages.length === 0 && (
            <div className="mx-auto max-w-2xl pt-6 text-center sm:pt-12">
              <p className="font-display text-[32px] leading-tight text-ink sm:text-[40px]">¿En qué te ayudo?</p>
              <p className="mt-2 text-[15px] text-muted">Consulto organizaciones, vencimientos, documentos, solicitudes, agenda y conexiones. Lo sensible pasa siempre por tu aprobación.</p>
              <div className="mt-6 grid gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map((s) => (
                  <button key={s} type="button" onClick={() => submit(s)} disabled={noModels} className="border border-line bg-paper px-3 py-3 text-left text-[14px] text-ink hover:border-muted disabled:opacity-50">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="mx-auto grid w-full max-w-3xl gap-5 [&>*]:min-w-0">
            {messages.map((m) => {
              const meta = (m.metadata ?? {}) as Meta;
              if (m.role === "user") {
                if (meta.kind) {
                  return (
                    <p key={m.id} className="flex items-center justify-end gap-1.5 text-[13px] text-muted">
                      <Check className="size-3.5" aria-hidden />
                      {meta.kind === "confirmacion" ? "Confirmaste" : "Cancelaste"}: {meta.summary}
                    </p>
                  );
                }
                return (
                  <div key={m.id} className="ml-auto max-w-[85%]">
                    <div className="bg-navy px-4 py-2.5 text-[15px] leading-relaxed text-paper">
                      {m.parts.map((p, i) =>
                        p.type === "text" ? (
                          <p key={i} className="whitespace-pre-wrap [overflow-wrap:anywhere]">
                            {p.text}
                          </p>
                        ) : p.type === "file" ? (
                          <p key={i} className="mt-1 inline-flex items-center gap-1 text-[13px] text-paper/80">
                            <Paperclip className="size-3.5" aria-hidden />
                            {p.filename ?? "archivo"}
                          </p>
                        ) : null,
                      )}
                    </div>
                    {!!meta.context?.length && (
                      <p className="mt-1 text-right text-[12px] text-muted">Con contexto: {meta.context.length === 1 ? "1 elemento" : `${meta.context.length} elementos`}</p>
                    )}
                  </div>
                );
              }
              return (
                <div key={m.id} className="flex gap-3">
                  <span className="mt-0.5 grid size-7 shrink-0 place-items-center bg-night text-paper" aria-hidden>
                    <Bot className="size-4" strokeWidth={1.5} />
                  </span>
                  <div className="min-w-0 flex-1">
                    {m.parts.map((p, i) => {
                      if (p.type === "text") return p.text ? <Markdown key={i} text={p.text} /> : null;
                      if (isToolUIPart(p)) {
                        const id = ((p as { output?: { aprobacion_id?: string } }).output?.aprobacion_id) ?? "";
                        return <ToolCard key={i} part={p as ToolPart} meta={toolMeta[getToolName(p)]} approval={approvals[id]} onDecide={decide} busy={deciding || busy} />;
                      }
                      return null;
                    })}
                  </div>
                </div>
              );
            })}
            {status === "submitted" && (
              <p className="flex items-center gap-2 pl-10 text-[14px] text-muted">
                <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
                Pensando…
              </p>
            )}
            {error && (
              <div role="alert" className="border border-danger/30 bg-danger/5 px-3 py-2 text-[14px] text-danger">
                {error.message || "No se pudo completar la respuesta."}
              </div>
            )}
            <div ref={bottom} />
          </div>
        </div>

        {/* Caja de entrada */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="border-t border-line p-3 sm:px-6 sm:pb-5"
        >
          <div className="relative mx-auto max-w-3xl">
            {picker && (
              <ContextPicker
                onPick={(c) => {
                  addChip(c);
                  setPicker(false);
                }}
                onFile={() => {
                  setPicker(false);
                  fileInput.current?.click();
                }}
                onClose={() => setPicker(false)}
              />
            )}
            {mention && mentionMatches.length > 0 && (
              <ul role="listbox" aria-label="Organizaciones" className="absolute bottom-full left-0 z-20 mb-2 w-72 border border-line bg-surface shadow-lg">
                {mentionMatches.map((o) => (
                  <li key={o.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={false}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        pickMention(o);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-[14px] hover:bg-paper"
                    >
                      <Building2 className="size-4 text-muted" strokeWidth={1.5} aria-hidden />
                      {o.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="border border-line bg-paper focus-within:border-muted">
              {(chips.length > 0 || files.length > 0) && (
                <div className="flex flex-wrap gap-1.5 px-2 pt-2">
                  {chips.map((c) => {
                    const Icon = KIND_ICON[c.kind];
                    return (
                      <span key={`${c.kind}:${c.id}`} className="inline-flex max-w-full items-center gap-1 border border-line bg-surface py-0.5 pl-1.5 pr-0.5 text-[12px] text-ink">
                        <Icon className="size-3.5 shrink-0 text-rose-deep" strokeWidth={1.5} aria-hidden />
                        <span className="truncate">{c.label}</span>
                        <button type="button" aria-label={`Quitar ${c.label}`} onClick={() => setChips((x) => x.filter((y) => y !== c))} className="grid size-5 place-items-center text-muted hover:text-ink">
                          <X className="size-3" aria-hidden />
                        </button>
                      </span>
                    );
                  })}
                  {files.map((f) => (
                    <span key={f.filename} className="inline-flex items-center gap-1 border border-line bg-surface py-0.5 pl-1.5 pr-0.5 text-[12px] text-ink">
                      {f.url ? <Paperclip className="size-3.5 text-rose-deep" aria-hidden /> : <Loader2 className="size-3.5 animate-spin" aria-hidden />}
                      {f.filename}
                      <button type="button" aria-label={`Quitar ${f.filename}`} onClick={() => setFiles((x) => x.filter((y) => y !== f))} className="grid size-5 place-items-center text-muted hover:text-ink">
                        <X className="size-3" aria-hidden />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <label htmlFor="mensaje" className="sr-only">
                Mensaje para Faro
              </label>
              <textarea
                id="mensaje"
                ref={textarea}
                rows={2}
                value={input}
                disabled={noModels}
                onChange={(e) => onInput(e.target.value, e.target.selectionStart)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    if (mention && mentionMatches[0]) pickMention(mentionMatches[0]);
                    else submit();
                  }
                  if (e.key === "Escape") setMention(null);
                }}
                placeholder={noModels ? "Configurá un proveedor de IA para empezar" : "Preguntale a Faro… (@ para mencionar una organización)"}
                className="block max-h-48 min-h-[56px] w-full resize-none bg-transparent px-3 py-2.5 text-[15px] text-ink outline-none placeholder:text-muted"
              />
              <div className="flex items-center gap-1 px-2 pb-2">
                <button type="button" onClick={() => setPicker((v) => !v)} aria-label="Adjuntar contexto" aria-expanded={picker} className="grid size-8 place-items-center text-muted hover:text-ink">
                  <Plus className="size-5" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setInput((v) => `${v}${v && !v.endsWith(" ") ? " " : ""}@`);
                    setMention({ q: "", start: input.length + (input && !input.endsWith(" ") ? 1 : 0) });
                    textarea.current?.focus();
                  }}
                  aria-label="Mencionar una organización"
                  className="grid size-8 place-items-center text-muted hover:text-ink"
                >
                  <AtSign className="size-4" aria-hidden />
                </button>
                <button type="button" onClick={() => fileInput.current?.click()} aria-label="Adjuntar archivo" className="grid size-8 place-items-center text-muted hover:text-ink">
                  <Paperclip className="size-4" aria-hidden />
                </button>
                <input ref={fileInput} type="file" multiple accept={FILE_ACCEPT} className="hidden" onChange={(e) => onFiles(e.target.files).then(() => (e.target.value = ""))} />
                {fileError && <span className="ml-1 text-[12px] text-danger">{fileError}</span>}
                <span className="flex-1" />
                {busy ? (
                  <button type="button" onClick={() => stop()} aria-label="Detener" className="grid size-9 place-items-center bg-ink text-paper">
                    <Square className="size-3.5" fill="currentColor" aria-hidden />
                  </button>
                ) : (
                  <button type="submit" disabled={noModels || (!input.trim() && !files.length)} aria-label="Enviar" className="grid size-9 place-items-center bg-navy text-paper hover:bg-navy-deep disabled:opacity-40">
                    <ArrowUp className="size-4" aria-hidden />
                  </button>
                )}
              </div>
            </div>
            <p className="mt-1.5 text-center text-[11px] text-muted">Faro puede equivocarse: revisá los datos importantes. Lo sensible siempre pasa por Aprobaciones.</p>
          </div>
        </form>
      </section>
    </div>
  );
}
