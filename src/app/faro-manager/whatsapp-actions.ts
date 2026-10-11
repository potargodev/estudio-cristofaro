"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireFaro } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { pauseAccount, platformAccount, saveAccount, syncTemplates, WhatsAppError } from "@/modules/whatsapp/server";

// Número de WhatsApp de Faro (lo usan compartido los estudios). Solo faro_owner.

const PATH = "/faro-manager/whatsapp";
const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
function go(q: Record<string, string>): never {
  redirect(`${PATH}?${new URLSearchParams(q)}`);
}

export async function saveFaroWaAction(fd: FormData) {
  const faro = await requireFaro(true);
  try {
    await saveAccount(faro, null, "propio", { phoneNumberId: s(fd, "phone_number_id"), wabaId: s(fd, "waba_id"), displayPhone: s(fd, "display_phone"), accessToken: s(fd, "access_token") || null, appSecret: s(fd, "app_secret") || null });
  } catch (e) {
    if (e instanceof WhatsAppError) go({ error: e.message });
    throw e;
  }
  revalidatePath(PATH);
  go({ ok: "Número de Faro guardado." });
}

export async function syncFaroWaAction() {
  const faro = await requireFaro(true);
  const a = await platformAccount();
  if (!a) go({ error: "Primero cargá el número." });
  try {
    const n = await syncTemplates(a);
    await audit({ studioId: null, actor: faro, action: "whatsapp.plantillas", entityType: "whatsapp", entityId: "faro", metadata: { plantillas: n } });
    go({ ok: `Sincronizamos ${n} plantillas.` });
  } catch (e) {
    if (e instanceof WhatsAppError) go({ error: e.message });
    throw e;
  }
}

export async function pauseFaroWaAction() {
  const faro = await requireFaro(true);
  await pauseAccount(faro, null);
  go({ ok: "Guardado." });
}
