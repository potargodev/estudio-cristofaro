// Proveedores de IA que puede configurar un estudio. Archivo sin "server-only":
// lo usan las pantallas para armar el formulario.

export const AI_PROVIDER_KINDS = ["anthropic", "openai", "google", "openrouter", "azure", "openai_compatible"] as const;
export type AiProviderKind = (typeof AI_PROVIDER_KINDS)[number];

export interface ProviderMeta {
  label: string;
  /** Texto de ayuda: dónde se saca la clave */
  help: string;
  keyRequired: boolean;
  /** Pide URL base (compatible con OpenAI) */
  baseUrl: "no" | "opcional" | "requerida";
  /** Azure: nombre del recurso y versión de API */
  azure?: boolean;
  /** Modelos sugeridos (el estudio puede escribir otros) */
  models: string[];
}

export const PROVIDERS: Record<AiProviderKind, ProviderMeta> = {
  anthropic: {
    label: "Anthropic (Claude)",
    help: "Creá la clave en console.anthropic.com → API Keys.",
    keyRequired: true,
    baseUrl: "no",
    models: ["claude-sonnet-5-5", "claude-opus-5-5", "claude-haiku-5-5"],
  },
  openai: {
    label: "OpenAI",
    help: "Creá la clave en platform.openai.com → API keys.",
    keyRequired: true,
    baseUrl: "no",
    models: ["gpt-5.1", "gpt-5.1-mini", "gpt-4.1-mini"],
  },
  google: {
    label: "Google (Gemini)",
    help: "Creá la clave en aistudio.google.com → Get API key.",
    keyRequired: true,
    baseUrl: "no",
    models: ["gemini-2.5-pro", "gemini-2.5-flash"],
  },
  openrouter: {
    label: "OpenRouter",
    help: "Una sola clave para muchos modelos: openrouter.ai → Keys. El modelo se escribe con su proveedor (anthropic/claude-sonnet-4.5).",
    keyRequired: true,
    baseUrl: "no",
    models: ["anthropic/claude-sonnet-4.5", "openai/gpt-5.1", "google/gemini-2.5-flash"],
  },
  azure: {
    label: "Azure OpenAI",
    help: "En el portal de Azure: recurso de Azure OpenAI → Claves y punto de conexión. El modelo es el nombre del deployment.",
    keyRequired: true,
    baseUrl: "opcional",
    azure: true,
    models: [],
  },
  openai_compatible: {
    label: "Compatible con OpenAI",
    help: "Ollama, LM Studio, vLLM o cualquier servidor con la API de OpenAI. Ejemplo de URL base: http://localhost:11434/v1 (Ollama). La clave es opcional.",
    keyRequired: false,
    baseUrl: "requerida",
    models: ["llama3.1", "qwen2.5"],
  },
};

export const AI_TASKS = { chat: "Chat del Asistente", extraccion: "Extracción de documentos", redaccion: "Redacción de borradores" } as const;
export type AiTaskKey = keyof typeof AI_TASKS;

/** "providerId:modelo" para los selectores */
export const modelKey = (providerId: string, model: string) => `${providerId}::${model}`;
export function parseModelKey(v: string | null | undefined): { providerId: string; model: string } | null {
  if (!v) return null;
  const i = v.indexOf("::");
  if (i < 0) return null;
  const providerId = v.slice(0, i);
  const model = v.slice(i + 2).trim();
  return /^[0-9a-f-]{36}$/i.test(providerId) && model && model.length <= 120 ? { providerId, model } : null;
}
