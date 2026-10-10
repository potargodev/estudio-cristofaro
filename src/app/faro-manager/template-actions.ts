"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireFaro } from "@/lib/auth";
import { IndustryError, saveTemplateVersion, validateTemplate } from "@/modules/industries/server";

// Plantillas de rubro en el Faro Manager: editar (versión nueva) y validar.
// Solo el owner de Faro; todo queda en la auditoría de plataforma.

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

export async function saveTemplateAction(fd: FormData) {
  const me = await requireFaro(true);
  const key = str(fd, "key");
  try {
    const v = await saveTemplateVersion(me, key, String(fd.get("content") ?? ""), str(fd, "note"));
    revalidatePath(`/faro-manager/plantillas/${key}`);
    redirect(`/faro-manager/plantillas/${key}?guardado=${v}`);
  } catch (e) {
    if (e instanceof IndustryError) redirect(`/faro-manager/plantillas/${key}?error=${encodeURIComponent(e.message)}`);
    throw e;
  }
}

export async function validateTemplateAction(fd: FormData) {
  const me = await requireFaro(true);
  const key = str(fd, "key");
  try {
    await validateTemplate(me, key, str(fd, "name"), str(fd, "license"));
    revalidatePath(`/faro-manager/plantillas/${key}`);
    redirect(`/faro-manager/plantillas/${key}?validada=1`);
  } catch (e) {
    if (e instanceof IndustryError) redirect(`/faro-manager/plantillas/${key}?error=${encodeURIComponent(e.message)}`);
    throw e;
  }
}
