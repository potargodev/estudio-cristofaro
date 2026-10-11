"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePersonal } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { dismissSuggestion } from "@/modules/escudo/server";

const safeBack = (v: FormDataEntryValue | null) => (typeof v === "string" && v.startsWith("/") && !v.startsWith("//") ? v : "/personal");

/** Descartar una sugerencia de sumar un contador (vuelve a aparecer más adelante) */
export async function dismissSuggestionAction(fd: FormData) {
  const me = await requirePersonal();
  const id = String(fd.get("id") ?? "");
  const ok = await dismissSuggestion(me.id, id);
  await audit({ studioId: me.studioId, actor: me, action: "escudo.sugerencia_descartada", entityType: "derivacion", entityId: id, result: ok ? "ok" : "denegado" });
  const back = safeBack(fd.get("volver"));
  revalidatePath(back);
  redirect(back);
}
