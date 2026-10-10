import "server-only";
import { eq } from "drizzle-orm";
import { cache } from "react";
import { getDb, isDbConfigured } from "@/db";
import { faro_settings } from "@/db/schema";
import { DEFAULT_USD_ARS, PLANS, type FaroPlan } from "./plans";

// Precios visibles: los planes (editables en el Faro Manager) y la conversión
// USD → ARS configurable. Si la base no responde (build, landing sin base), se
// usan los valores de referencia de la configuración.

export const getUsdArs = cache(async (): Promise<number> => {
  if (!isDbConfigured) return DEFAULT_USD_ARS;
  try {
    const [r] = await getDb().select().from(faro_settings).where(eq(faro_settings.key, "usd_ars"));
    const n = Number(r?.value);
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_USD_ARS;
  } catch {
    return DEFAULT_USD_ARS;
  }
});

/** Planes para mostrar al público (base o configuración) */
export async function publicPlans(): Promise<FaroPlan[]> {
  if (!isDbConfigured) return PLANS;
  try {
    const { getPlans } = await import("./entitlements");
    return await getPlans();
  } catch {
    return PLANS;
  }
}
