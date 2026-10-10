"use server";

import { generateText } from "ai";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { ai_providers, ai_settings, type AiTask, type ModelRef } from "@/db/schema";
import { AI_PROVIDER_KINDS, AI_TASKS, PROVIDERS, parseModelKey, type AiProviderKind } from "@/lib/ai/catalog";
import { getProvider, languageModel, recordUsage } from "@/lib/ai/models";
import { audit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth";
import { encrypt, encryptionEnabled } from "@/lib/crypto";

// Configuración de IA del estudio: solo administradores, siempre dentro de su estudio.

const BASE = "/admin/ia/configuracion";

function s(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

const back = (q: string): never => redirect(`${BASE}?${q}`);

export async function saveProvider(fd: FormData) {
  const admin = await requireAdmin();
  if (!encryptionEnabled()) back("error=cifrado");
  const id = s(fd, "id");
  const current = id ? await getProvider(admin.studioId, id) : null;
  if (id && !current) back("error=proveedor");
  const kind = (current?.kind ?? s(fd, "kind")) as AiProviderKind | null;
  if (!kind || !(AI_PROVIDER_KINDS as readonly string[]).includes(kind)) back("error=proveedor");
  const meta = PROVIDERS[kind!];
  const apiKey = s(fd, "api_key");
  const baseUrl = s(fd, "base_url");
  if (baseUrl && !/^https?:\/\/[^\s]+$/i.test(baseUrl)) back("error=url");
  if (meta.baseUrl === "requerida" && !baseUrl) back("error=url");
  if (meta.keyRequired && !apiKey && !current?.api_key_enc) back("error=clave");
  const models = (s(fd, "models") ?? "")
    .split(/[,\n]/)
    .map((m) => m.trim())
    .filter((m) => /^[\w.:/@-]{1,120}$/.test(m))
    .slice(0, 20);
  const resourceName = s(fd, "resource_name");
  if (meta.azure && !resourceName && !baseUrl) back("error=azure");
  const values = {
    name: (s(fd, "name") ?? meta.label).slice(0, 80),
    base_url: meta.baseUrl === "no" ? null : baseUrl,
    settings: {
      models: models.length ? models : meta.models.slice(0, 3),
      ...(meta.azure ? { resourceName: resourceName ?? undefined, apiVersion: s(fd, "api_version") ?? undefined } : {}),
    },
    ...(apiKey ? { api_key_enc: encrypt(apiKey), key_hint: apiKey.slice(-4) } : {}),
  };
  const db = getDb();
  let providerId: string;
  if (current) {
    await db.update(ai_providers).set(values).where(and(eq(ai_providers.id, current.id), eq(ai_providers.studio_id, admin.studioId)));
    providerId = current.id;
  } else {
    const [row] = await db
      .insert(ai_providers)
      .values({ ...values, studio_id: admin.studioId, kind: kind!, created_by: admin.id })
      .returning({ id: ai_providers.id });
    providerId = row.id;
  }
  await audit({
    studioId: admin.studioId,
    actor: admin,
    action: current ? "ia.proveedor_editar" : "ia.proveedor_crear",
    entityType: "proveedor_ia",
    entityId: providerId,
    metadata: { tipo: kind, clave_nueva: Boolean(apiKey) },
  });
  revalidatePath("/admin/ia", "layout");
  back(`guardado=1&probar=${providerId}`);
}

export async function deleteProvider(fd: FormData) {
  const admin = await requireAdmin();
  const p = await getProvider(admin.studioId, s(fd, "id") ?? "");
  if (!p) back("error=proveedor");
  await getDb().delete(ai_providers).where(and(eq(ai_providers.id, p!.id), eq(ai_providers.studio_id, admin.studioId)));
  await audit({ studioId: admin.studioId, actor: admin, action: "ia.proveedor_eliminar", entityType: "proveedor_ia", entityId: p!.id, metadata: { tipo: p!.kind } });
  revalidatePath("/admin/ia", "layout");
  back("guardado=1");
}

export async function toggleProvider(fd: FormData) {
  const admin = await requireAdmin();
  const p = await getProvider(admin.studioId, s(fd, "id") ?? "");
  if (!p) back("error=proveedor");
  await getDb().update(ai_providers).set({ active: !p!.active }).where(eq(ai_providers.id, p!.id));
  await audit({ studioId: admin.studioId, actor: admin, action: "ia.proveedor_estado", entityType: "proveedor_ia", entityId: p!.id, metadata: { activo: !p!.active } });
  revalidatePath("/admin/ia", "layout");
  back("guardado=1");
}

/** Prueba de conexión: una llamada mínima al primer modelo cargado (o el indicado) */
export async function testProvider(fd: FormData) {
  const admin = await requireAdmin();
  const p = await getProvider(admin.studioId, s(fd, "id") ?? "");
  if (!p) back("error=proveedor");
  const model = s(fd, "model") ?? p!.settings.models?.[0];
  let ok = false;
  let message: string;
  if (!model) {
    message = "Cargá al menos un modelo para probar la conexión.";
  } else {
    try {
      const r = await generateText({
        model: languageModel(p!, model),
        prompt: "Respondé únicamente con la palabra OK.",
        maxOutputTokens: 16,
        maxRetries: 0,
        timeout: 20000,
      });
      await recordUsage({ studioId: admin.studioId, provider: p!, model, task: "chat", userId: admin.id, inputTokens: r.usage.inputTokens, outputTokens: r.usage.outputTokens });
      ok = true;
      message = `Conexión correcta con ${model}: respondió "${r.text.trim().slice(0, 40)}".`;
    } catch (error) {
      const e = error as { statusCode?: number; message?: string };
      message =
        e.statusCode === 401 || e.statusCode === 403
          ? "El proveedor rechazó la clave (401/403). Revisala."
          : e.statusCode === 404
            ? `El proveedor no encontró el modelo "${model}" (404).`
            : `No se pudo conectar: ${(e.message ?? "error desconocido").slice(0, 200)}`;
    }
  }
  await getDb().update(ai_providers).set({ last_test_at: new Date(), last_test_ok: ok, last_test_message: message }).where(eq(ai_providers.id, p!.id));
  await audit({ studioId: admin.studioId, actor: admin, action: "ia.proveedor_probar", entityType: "proveedor_ia", entityId: p!.id, result: ok ? "ok" : "error", metadata: { modelo: model ?? null } });
  revalidatePath(BASE);
  back(`prueba=${ok ? "ok" : "error"}#proveedor-${p!.id}`);
}

export async function saveAiSettings(fd: FormData) {
  const admin = await requireAdmin();
  const providers = await getDb().select({ id: ai_providers.id }).from(ai_providers).where(eq(ai_providers.studio_id, admin.studioId));
  const ids = new Set(providers.map((p) => p.id));
  // Solo modelos de proveedores del propio estudio
  const ref = (key: string): ModelRef | null => {
    const r = parseModelKey(s(fd, key));
    return r && ids.has(r.providerId) ? r : null;
  };
  const task_models: Partial<Record<AiTask, ModelRef>> = {};
  for (const t of Object.keys(AI_TASKS) as AiTask[]) {
    const r = ref(`task_${t}`);
    if (r) task_models[t] = r;
  }
  const budgetRaw = s(fd, "budget")?.replace(",", ".");
  const budget = budgetRaw ? Number(budgetRaw) : null;
  if (budget !== null && (!Number.isFinite(budget) || budget < 0 || budget > 100000)) back("error=presupuesto");
  const values = { default_model: ref("default_model"), task_models, monthly_budget_usd: budget === null ? null : budget.toFixed(2) };
  await getDb()
    .insert(ai_settings)
    .values({ studio_id: admin.studioId, ...values })
    .onConflictDoUpdate({ target: ai_settings.studio_id, set: values });
  await audit({ studioId: admin.studioId, actor: admin, action: "ia.configurar", metadata: { limite_usd: budget, modelo_por_defecto: values.default_model?.model ?? null } });
  revalidatePath("/admin/ia", "layout");
  back("guardado=1#modelos");
}
