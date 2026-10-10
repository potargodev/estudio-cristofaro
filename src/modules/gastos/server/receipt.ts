import "server-only";
import { generateText } from "ai";
import { hasModule } from "@/lib/faro/entitlements";
import { budgetBlock, languageModel, recordUsage, resolveModel } from "@/lib/ai/models";
import { checkUpload } from "@/lib/uploads";
import { CATEGORIES, CURRENCIES } from "../constants";

// Lectura del ticket con IA: solo si el tenant tiene Documentos inteligentes
// y un modelo de extracción. Propone los datos; la persona los revisa y
// guarda (nada se carga solo). Sin módulo o sin modelo, la carga es manual.

export interface ReceiptGuess {
  description?: string;
  amount?: number; // centavos
  currency?: string;
  date?: string;
  category?: string;
}

export async function receiptReadingAvailable(studioId: string) {
  return (await hasModule(studioId, "smart_docs")) && !!(await resolveModel(studioId, "extraccion"));
}

export async function readReceipt(studioId: string, userId: string | null, file: File): Promise<ReceiptGuess | { error: string }> {
  if (!(await hasModule(studioId, "smart_docs"))) return { error: "La lectura de tickets viene con Documentos inteligentes. Cargalo a mano." };
  const m = await resolveModel(studioId, "extraccion");
  if (!m) return { error: "No hay un modelo de IA configurado para leer tickets." };
  const block = await budgetBlock(studioId);
  if (block) return { error: block };
  const check = await checkUpload(file);
  if (!check.ok) return { error: check.error };
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = file.name.toLowerCase().endsWith(".pdf");
  try {
    const r = await generateText({
      model: languageModel(m.provider, m.model),
      maxRetries: 0,
      timeout: 30000,
      maxOutputTokens: 300,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Leé este comprobante (ticket o factura) y respondé SOLO un JSON con: description (comercio o concepto, corto), amount (total como número, con punto decimal), currency (${CURRENCIES.join("|")}), date (YYYY-MM-DD) y category (${Object.keys(CATEGORIES).join("|")}). Si no sabés un dato, omitilo.`,
            },
            pdf ? { type: "file", data, mediaType: "application/pdf" } : { type: "image", image: data, mediaType: file.type || "image/jpeg" },
          ],
        },
      ],
    });
    await recordUsage({ studioId, provider: m.provider, model: m.model, task: "extraccion", userId, inputTokens: r.usage.inputTokens, outputTokens: r.usage.outputTokens });
    const json = r.text.match(/\{[\s\S]*\}/)?.[0];
    if (!json) return { error: "No pudimos leer el ticket. Cargalo a mano." };
    const p = JSON.parse(json) as Record<string, unknown>;
    const out: ReceiptGuess = {};
    if (typeof p.description === "string") out.description = p.description.slice(0, 140);
    const amount = Number(p.amount);
    if (Number.isFinite(amount) && amount > 0) out.amount = Math.round(amount * 100);
    if (typeof p.currency === "string" && (CURRENCIES as readonly string[]).includes(p.currency)) out.currency = p.currency;
    if (typeof p.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.date)) out.date = p.date;
    if (typeof p.category === "string" && p.category in CATEGORIES) out.category = p.category;
    return out;
  } catch (error) {
    console.error("[gastos] lectura de ticket", (error as Error).message);
    return { error: "No pudimos leer el ticket. Cargalo a mano." };
  }
}
