import "server-only";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createAzure } from "@ai-sdk/azure";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import { and, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { ai_providers, ai_settings, ai_usage, type AiTask, type ModelRef } from "@/db/schema";
import { decrypt } from "@/lib/crypto";
import { estimateCost } from "./pricing";

// Proveedores del estudio → modelos del AI SDK. Las claves se descifran solo
// acá, en el servidor, al momento de usarlas.

export type AiProvider = typeof ai_providers.$inferSelect;

export function languageModel(p: AiProvider, model: string): LanguageModel {
  const apiKey = p.api_key_enc ? decrypt(p.api_key_enc) : undefined;
  const baseURL = p.base_url?.trim() || undefined;
  switch (p.kind) {
    case "anthropic":
      return createAnthropic({ apiKey, baseURL })(model);
    case "openai":
      return createOpenAI({ apiKey, baseURL })(model);
    case "google":
      return createGoogleGenerativeAI({ apiKey, baseURL })(model);
    case "openrouter":
      return createOpenAICompatible({ name: "openrouter", apiKey, baseURL: baseURL ?? "https://openrouter.ai/api/v1", includeUsage: true }).chatModel(model);
    case "azure":
      return createAzure({
        apiKey,
        baseURL,
        resourceName: baseURL ? undefined : p.settings.resourceName,
        apiVersion: p.settings.apiVersion || undefined,
      }).chat(model);
    case "openai_compatible":
      if (!baseURL) throw new Error("Falta la URL base del proveedor compatible con OpenAI.");
      return createOpenAICompatible({ name: "compatible", apiKey, baseURL, includeUsage: true }).chatModel(model);
  }
}

export async function getProviders(studioId: string) {
  return getDb().select().from(ai_providers).where(eq(ai_providers.studio_id, studioId)).orderBy(ai_providers.created_at);
}

export async function getProvider(studioId: string, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [p] = await getDb()
    .select()
    .from(ai_providers)
    .where(and(eq(ai_providers.id, id), eq(ai_providers.studio_id, studioId)));
  return p ?? null;
}

export async function getAiSettings(studioId: string) {
  const [s] = await getDb().select().from(ai_settings).where(eq(ai_settings.studio_id, studioId));
  return s ?? { studio_id: studioId, default_model: null, task_models: {}, monthly_budget_usd: null, updated_at: new Date() };
}

/**
 * Modelo a usar: el pedido (si es de un proveedor activo del estudio), el de la
 * tarea, el por defecto o el primero del primer proveedor activo.
 */
export async function resolveModel(studioId: string, task: AiTask, wanted?: ModelRef | null) {
  const [providers, settings] = await Promise.all([getProviders(studioId), getAiSettings(studioId)]);
  const active = providers.filter((p) => p.active);
  if (!active.length) return null;
  for (const ref of [wanted, settings.task_models[task], settings.default_model]) {
    const p = ref && active.find((x) => x.id === ref.providerId);
    if (p && ref.model) return { provider: p, model: ref.model };
  }
  const p = active[0];
  const model = p.settings.models?.[0];
  return model ? { provider: p, model } : null;
}

/** Gasto estimado del mes calendario (hora de Buenos Aires) */
export async function monthSpend(studioId: string) {
  const now = new Date();
  const ar = new Date(now.toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
  const start = new Date(Date.UTC(ar.getFullYear(), ar.getMonth(), 1, 3));
  const [row] = await getDb()
    .select({ total: sql<string>`coalesce(sum(${ai_usage.cost_usd}), 0)`, tokens: sql<string>`coalesce(sum(${ai_usage.input_tokens} + ${ai_usage.output_tokens}), 0)` })
    .from(ai_usage)
    .where(and(eq(ai_usage.studio_id, studioId), gte(ai_usage.created_at, start)));
  return { usd: Number(row.total), tokens: Number(row.tokens), since: start };
}

/** null si hay margen; si no, el mensaje para la persona */
export async function budgetBlock(studioId: string) {
  const s = await getAiSettings(studioId);
  if (!s.monthly_budget_usd) return null;
  const limit = Number(s.monthly_budget_usd);
  const spent = await monthSpend(studioId);
  if (spent.usd < limit) return null;
  return `Se alcanzó el límite de gasto de IA del mes (US$ ${limit.toFixed(2)}). Un administrador puede subirlo en IA → Configuración.`;
}

export async function recordUsage(e: {
  studioId: string;
  provider: AiProvider;
  model: string;
  task: AiTask;
  userId?: string | null;
  conversationId?: string | null;
  inputTokens?: number;
  outputTokens?: number;
}) {
  const input = e.inputTokens ?? 0;
  const output = e.outputTokens ?? 0;
  try {
    await getDb()
      .insert(ai_usage)
      .values({
        studio_id: e.studioId,
        provider_id: e.provider.id,
        provider_kind: e.provider.kind,
        model: e.model,
        task: e.task,
        user_id: e.userId ?? null,
        conversation_id: e.conversationId ?? null,
        input_tokens: input,
        output_tokens: output,
        cost_usd: estimateCost(e.model, input, output).toFixed(6),
      });
  } catch (error) {
    console.error("[ai] No se pudo registrar el uso", error);
  }
}
