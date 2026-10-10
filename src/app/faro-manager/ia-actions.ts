"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { requireFaro } from "@/lib/auth";
import { PLANS } from "@/lib/faro/plans";
import { forgetPlatformKey, savePlatformAi } from "@/modules/copilot/platform";

// IA de la plataforma (Faro Manager): solo el owner de Faro. La clave se
// guarda cifrada y nunca vuelve al navegador; en la auditoría queda que se
// cambió, sin el valor.

const s = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
};
const num = (v: string) => {
  if (v === "") return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : null;
};
const int = (v: string) => {
  const n = num(v);
  return n == null ? null : Math.floor(n);
};

export async function savePlatformAiAction(fd: FormData) {
  const faro = await requireFaro(true);
  const model = s(fd, "model_primary");
  if (!model) redirect("/faro-manager/ia?error=Falta%20el%20modelo%20principal");
  const limits: Record<string, { messages: number | null; audios: number | null }> = {};
  for (const p of PLANS) limits[p.key] = { messages: int(s(fd, `msg_${p.key}`)), audios: int(s(fd, `aud_${p.key}`)) };
  const r = await savePlatformAi(faro.id, {
    provider: s(fd, "provider"),
    apiKey: s(fd, "api_key"),
    baseUrl: s(fd, "base_url"),
    modelPrimary: model,
    modelFallback: s(fd, "model_fallback"),
    transcription: s(fd, "transcription"),
    transcriptionKey: s(fd, "transcription_key"),
    transcriptionModel: s(fd, "transcription_model"),
    priceIn: num(s(fd, "price_in")),
    priceOut: num(s(fd, "price_out")),
    freeTier: fd.get("free_tier") === "on",
    limits,
    dailyCap: num(s(fd, "daily_cap")),
    monthlyCap: num(s(fd, "monthly_cap")),
  });
  await audit({
    studioId: null,
    actor: faro,
    action: "faro.ia_configurada",
    entityType: "ia_plataforma",
    metadata: { proveedor: s(fd, "provider"), modelo: model, respaldo: s(fd, "model_fallback") || null, clave_cambiada: r.keyChanged, clave_transcripcion_cambiada: r.transcriptionKeyChanged },
  });
  revalidatePath("/faro-manager/ia");
  redirect("/faro-manager/ia?ok=Configuraci%C3%B3n%20guardada");
}

export async function forgetPlatformKeyAction() {
  const faro = await requireFaro(true);
  await forgetPlatformKey(faro.id);
  await audit({ studioId: null, actor: faro, action: "faro.ia_clave_borrada", entityType: "ia_plataforma" });
  revalidatePath("/faro-manager/ia");
  redirect("/faro-manager/ia?ok=Clave%20borrada.%20El%20Vigía%20qued%C3%B3%20en%20modo%20solo%20texto");
}
