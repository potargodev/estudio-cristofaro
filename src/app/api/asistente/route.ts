import { convertToModelMessages, isStepCount, streamText, type UIMessage } from "ai";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { ai_conversations, approvals, studios } from "@/db/schema";
import { parseModelKey } from "@/lib/ai/catalog";
import { assistantToolContext, assistantTools, loadMessages, ownConversation, resolveContext, saveMessages, systemPrompt } from "@/lib/ai/assistant";
import { parseContextRefs, type ContextRef } from "@/lib/ai/context";
import { budgetBlock, languageModel, recordUsage, resolveModel } from "@/lib/ai/models";
import { tenantForApi } from "@/lib/auth";
import { aiCanAct } from "@/lib/faro/entitlements";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const fail = (status: number, message: string) => new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FILE_TYPES = /^(image\/(png|jpeg|webp|gif)|application\/pdf|text\/(plain|csv|markdown))$/;
const MAX_FILE_CHARS = 6 * 1024 * 1024; // data URL de ~4,5 MB

type Meta = { context?: ContextRef[]; kind?: "confirmacion" | "cancelacion"; approvalId?: string; summary?: string };

/** El mensaje nuevo de la persona: solo texto y archivos permitidos. Nunca se aceptan partes de herramientas del navegador. */
function sanitize(raw: unknown): UIMessage | null {
  const m = raw as UIMessage | null;
  if (!m || m.role !== "user" || typeof m.id !== "string" || m.id.length > 80 || !Array.isArray(m.parts)) return null;
  const parts: UIMessage["parts"] = [];
  for (const p of m.parts.slice(0, 12)) {
    if (p.type === "text" && typeof p.text === "string") parts.push({ type: "text", text: p.text.slice(0, 20000) });
    if (p.type === "file" && typeof p.url === "string" && p.url.startsWith("data:") && p.url.length <= MAX_FILE_CHARS && FILE_TYPES.test(p.mediaType ?? "")) {
      parts.push({ type: "file", mediaType: p.mediaType, url: p.url, filename: typeof p.filename === "string" ? p.filename.slice(0, 120) : undefined });
    }
  }
  if (!parts.length) return null;
  const meta = (m.metadata ?? {}) as Meta;
  return { id: m.id, role: "user", parts, metadata: { context: parseContextRefs(meta.context), kind: meta.kind, approvalId: meta.approvalId } satisfies Meta };
}

export async function POST(request: Request) {
  const user = await tenantForApi();
  if (!user) return fail(401, "Tu sesión venció. Volvé a entrar.");
  let body: { id?: unknown; message?: unknown; model?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail(400, "Pedido inválido.");
  }
  const id = typeof body.id === "string" && UUID.test(body.id) ? body.id : null;
  const message = sanitize(body.message);
  if (!id || !message) return fail(400, "Pedido inválido.");

  const blocked = await budgetBlock(user.studioId);
  if (blocked) return fail(402, blocked);
  const chosen = await resolveModel(user.studioId, "chat", typeof body.model === "string" ? parseModelKey(body.model) : null);
  if (!chosen) return fail(409, "El estudio todavía no configuró un proveedor de IA. Un administrador lo hace en IA → Configuración.");

  const db = getDb();
  let conversation = await ownConversation(user, id);
  if (!conversation) {
    const firstText = message.parts.find((p) => p.type === "text")?.text ?? "Conversación nueva";
    const [created] = await db
      .insert(ai_conversations)
      .values({ id, studio_id: user.studioId, user_id: user.id, title: firstText.replace(/\s+/g, " ").slice(0, 70), model: { providerId: chosen.provider.id, model: chosen.model } })
      .onConflictDoNothing()
      .returning();
    // Si el id ya existe y es de otra persona, no se toca
    if (!created) return fail(404, "Conversación inexistente.");
    conversation = created;
  } else {
    await db.update(ai_conversations).set({ model: { providerId: chosen.provider.id, model: chosen.model } }).where(eq(ai_conversations.id, conversation.id));
  }

  // Confirmación o cancelación de una acción desde una tarjeta: el texto lo arma el servidor con el resultado real
  const meta = message.metadata as Meta;
  if (meta.kind && meta.approvalId && UUID.test(meta.approvalId)) {
    const [a] = await db.select().from(approvals).where(eq(approvals.id, meta.approvalId));
    if (!a || a.studio_id !== user.studioId || a.conversation_id !== conversation.id) return fail(400, "Acción inexistente.");
    const result = a.result ? JSON.stringify(a.result).slice(0, 4000) : null;
    message.parts = [
      {
        type: "text",
        text:
          a.status === "ejecutada"
            ? `Confirmé la acción: ${a.title}. Resultado: ${result}`
            : a.status === "error"
              ? `Intenté confirmar la acción "${a.title}" pero falló: ${result}`
              : `Cancelé la acción: ${a.title}.`,
      },
    ];
    message.metadata = { ...meta, summary: a.title };
  }

  const history = await loadMessages(conversation.id);
  const all = [...history.filter((m) => m.id !== message.id), message];
  const refs = new Map<string, ContextRef>();
  for (const m of all) for (const r of ((m.metadata as Meta | undefined)?.context ?? [])) refs.set(`${r.kind}:${r.id}`, r);
  const [[studio], context] = await Promise.all([
    db.select({ name: studios.name }).from(studios).where(eq(studios.id, user.studioId)),
    resolveContext(user.studioId, [...refs.values()]),
  ]);

  const ctx = assistantToolContext(user, conversation.id);
  // Inicial y los planes gratis: la IA solo consulta (sin herramientas de escritura)
  ctx.canWrite = await aiCanAct(user.studioId);
  const tools = await assistantTools(ctx);
  const convId = conversation.id;
  const result = streamText({
    model: languageModel(chosen.provider, chosen.model),
    system: systemPrompt(user, studio?.name ?? "estudio", context),
    messages: await convertToModelMessages(all, { tools, ignoreIncompleteToolCalls: true }),
    tools,
    stopWhen: isStepCount(8),
    abortSignal: request.signal,
    onFinish: async (event) => {
      await recordUsage({
        studioId: user.studioId,
        provider: chosen.provider,
        model: chosen.model,
        task: "chat",
        userId: user.id,
        conversationId: convId,
        inputTokens: event.totalUsage.inputTokens,
        outputTokens: event.totalUsage.outputTokens,
      });
    },
    onError: ({ error }) => console.error("[asistente]", error),
  });

  return result.toUIMessageStreamResponse({
    originalMessages: all,
    generateMessageId: () => crypto.randomUUID(),
    onFinish: async ({ messages }) => {
      await saveMessages(convId, messages);
    },
    onError: (error) => {
      const e = error as { statusCode?: number; message?: string };
      if (e.statusCode === 401 || e.statusCode === 403) return "El proveedor de IA rechazó la clave. Revisala en IA → Configuración.";
      if (e.statusCode === 429) return "El proveedor de IA está limitando los pedidos (429). Probá en un rato.";
      return "No se pudo completar la respuesta. Probá de nuevo.";
    },
  });
}
