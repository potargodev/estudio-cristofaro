"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireFaro } from "@/lib/auth";
import { LiquidacionError, saveScale } from "@/modules/liquidacion/server";

// Convenios de sueldos (§2.q etapa 6): solo el owner carga escalas nuevas.

const PATH = "/faro-manager/convenios";
const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

export async function saveCctScaleAction(fd: FormData) {
  const faro = await requireFaro(true);
  const key = s(fd, "cct_key");
  let msg = "Escala guardada.";
  try {
    const r = await saveScale(faro, { cctKey: key, validFrom: s(fd, "valid_from"), status: s(fd, "status"), source: s(fd, "source"), categories: String(fd.get("categories") ?? ""), notify: fd.get("notify") === "on" });
    if (r.notified) msg = `Escala guardada. Avisamos a ${r.notified} ${r.notified === 1 ? "persona" : "personas"}.`;
  } catch (e) {
    if (e instanceof LiquidacionError) redirect(`${PATH}?${new URLSearchParams({ error: e.message })}#cct-${key}`);
    throw e;
  }
  revalidatePath(PATH);
  redirect(`${PATH}?${new URLSearchParams({ ok: msg })}#cct-${key}`);
}
