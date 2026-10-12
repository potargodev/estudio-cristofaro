import "server-only";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { transcribe, generateText, type LanguageModel } from "ai";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { platform_ai } from "@/db/schema";
import { decrypt, encrypt } from "@/lib/crypto";

// IA de la plataforma (Faro pone el modelo para personas y autónomos, §2.m).
// Se configura en el Faro Manager; la clave se guarda cifrada con
// ENCRYPTION_KEY, se descifra solo acá al usarla y nunca se muestra ni se loguea.

export type PlatformAi = typeof platform_ai.$inferSelect;
export const PLATFORM_PROVIDERS = { google: "Google Gemini", openai: "OpenAI", openai_compatible: "Compatible con OpenAI" } as const;

/** Límites por plan por defecto (mensajes y audios por mes; null = sin tope) */
const DEFAULT_LIMITS: Record<string, { messages: number | null; audios: number | null }> = {
  persona_gratis: { messages: 100, audios: 30 },
  persona_plus: { messages: 1500, audios: null },
  autonomo_gratis: { messages: 100, audios: 30 },
  autonomo_pro: { messages: 1500, audios: null },
  inicial: { messages: 1500, audios: null },
  profesional: { messages: 3000, audios: null },
  avanzado: { messages: null, audios: null },
};

const DEFAULTS: Omit<PlatformAi, "updated_at"> = {
  id: "default",
  provider: "google",
  api_key_enc: null,
  key_hint: null,
  base_url: null,
  model_primary: "gemini-3.1-flash-lite",
  model_fallback: "gemini-3.5-flash-lite",
  transcription: "nativo",
  transcription_key_enc: null,
  transcription_model: "whisper-1",
  price_in_per_m: "0.10",
  price_out_per_m: "0.40",
  free_tier: false,
  limits: {},
  daily_cap_usd: null,
  monthly_cap_usd: null,
  cap_alerted_at: null,
  updated_by: null,
};

export async function getPlatformAi(): Promise<PlatformAi> {
  const [r] = await getDb().select().from(platform_ai).where(eq(platform_ai.id, "default"));
  return r ?? { ...DEFAULTS, updated_at: new Date() };
}

export const isConfigured = (p: PlatformAi) => !!p.api_key_enc && !!p.model_primary;

export function limitsFor(p: PlatformAi, planKey: string) {
  const own = p.limits?.[planKey];
  const base = DEFAULT_LIMITS[planKey] ?? { messages: 100, audios: 30 };
  return { messages: own?.messages !== undefined ? own.messages : base.messages, audios: own?.audios !== undefined ? own.audios : base.audios };
}

interface PlatformInput {
  provider: string;
  apiKey?: string;
  baseUrl?: string;
  modelPrimary: string;
  modelFallback?: string;
  transcription: string;
  transcriptionKey?: string;
  transcriptionModel?: string;
  priceIn?: number | null;
  priceOut?: number | null;
  freeTier: boolean;
  limits: Record<string, { messages: number | null; audios: number | null }>;
  dailyCap: number | null;
  monthlyCap: number | null;
}

/** Guarda la configuración. Una clave vacía no pisa la guardada */
export async function savePlatformAi(by: string, i: PlatformInput) {
  const cur = await getPlatformAi();
  const provider = (Object.keys(PLATFORM_PROVIDERS) as string[]).includes(i.provider) ? i.provider : "google";
  const key = i.apiKey?.trim();
  const tkey = i.transcriptionKey?.trim();
  const row = {
    id: "default",
    provider,
    api_key_enc: key ? encrypt(key) : cur.api_key_enc,
    key_hint: key ? key.slice(-4) : cur.key_hint,
    base_url: i.baseUrl?.trim() || null,
    model_primary: i.modelPrimary.trim().slice(0, 80) || DEFAULTS.model_primary,
    model_fallback: i.modelFallback?.trim().slice(0, 80) || null,
    transcription: i.transcription === "openai" ? "openai" : "nativo",
    transcription_key_enc: tkey ? encrypt(tkey) : cur.transcription_key_enc,
    transcription_model: i.transcriptionModel?.trim().slice(0, 60) || "whisper-1",
    price_in_per_m: String(i.priceIn ?? cur.price_in_per_m),
    price_out_per_m: String(i.priceOut ?? cur.price_out_per_m),
    free_tier: i.freeTier,
    limits: i.limits,
    daily_cap_usd: i.dailyCap == null ? null : String(i.dailyCap),
    monthly_cap_usd: i.monthlyCap == null ? null : String(i.monthlyCap),
    updated_by: by,
  };
  await getDb().insert(platform_ai).values(row).onConflictDoUpdate({ target: platform_ai.id, set: { ...row, updated_at: new Date() } });
  return { keyChanged: !!key, transcriptionKeyChanged: !!tkey };
}

export async function forgetPlatformKey(by: string) {
  await getDb().update(platform_ai).set({ api_key_enc: null, key_hint: null, updated_by: by }).where(eq(platform_ai.id, "default"));
}

/** Modelo del AI SDK con la clave de la plataforma */
export function platformModel(p: PlatformAi, model: string): LanguageModel {
  const apiKey = p.api_key_enc ? decrypt(p.api_key_enc) : undefined;
  const baseURL = p.base_url?.trim() || undefined;
  if (p.provider === "openai") return createOpenAI({ apiKey, baseURL })(model);
  if (p.provider === "openai_compatible") {
    if (!baseURL) throw new Error("Falta la URL base del proveedor compatible con OpenAI.");
    return createOpenAICompatible({ name: "plataforma", apiKey, baseURL, includeUsage: true }).chatModel(model);
  }
  return createGoogleGenerativeAI({ apiKey, baseURL })(model);
}

export const costUsd = (p: PlatformAi, tokensIn: number, tokensOut: number) => (tokensIn * Number(p.price_in_per_m) + tokensOut * Number(p.price_out_per_m)) / 1_000_000;

/**
 * Transcribe un audio: con Gemini, el modelo entiende el audio nativo; con la
 * alternativa, un modelo de transcripción compatible con OpenAI (Whisper).
 */
export async function transcribeAudio(p: PlatformAi, model: string, audio: Buffer, mime: string) {
  if (p.transcription === "openai" || p.provider !== "google") {
    const apiKey = p.transcription_key_enc ? decrypt(p.transcription_key_enc) : p.api_key_enc ? decrypt(p.api_key_enc) : undefined;
    const baseURL = p.provider === "google" ? undefined : p.base_url?.trim() || undefined;
    const r = await transcribe({ model: createOpenAI({ apiKey, baseURL }).transcription(p.transcription_model || "whisper-1"), audio, maxRetries: 0 });
    return { text: r.text.trim(), tokensIn: 0, tokensOut: 0 };
  }
  const r = await generateText({
    model: platformModel(p, model),
    maxRetries: 0,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "Transcribí este audio en español de Argentina, literal, sin agregar nada. Si no se entiende, respondé solo: [inaudible]" },
          { type: "file", data: audio, mediaType: mime },
        ],
      },
    ],
  });
  return { text: r.text.trim(), tokensIn: r.usage.inputTokens ?? 0, tokensOut: r.usage.outputTokens ?? 0 };
}
