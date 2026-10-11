"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { BrandingError, saveBranding, saveLogo, setDomain, verifyDomain } from "@/modules/white-label/server";
import { pauseAccount, saveAccount, studioRow, syncTemplates, WhatsAppError } from "@/modules/whatsapp/server";

// Configuración → Avanzado: marca blanca y WhatsApp del estudio. Solo el
// dueño; el estudio sale siempre de la sesión.

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const MARCA = "/admin/configuracion/avanzado";
const WA = "/admin/configuracion/avanzado?tab=whatsapp";
function go(path: string, q: Record<string, string>): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}${new URLSearchParams(q)}`);
}
async function guard<T>(b: string, fn: () => Promise<T>) {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof BrandingError || e instanceof WhatsAppError) go(b, { error: e.message });
    throw e;
  }
}
async function me() {
  const u = await requireAdmin();
  return { ...u, studioId: u.studioId };
}

export async function saveBrandingAction(fd: FormData) {
  const u = await me();
  await guard(MARCA, () => saveBranding(u, { enabled: fd.get("enabled") === "on", displayName: s(fd, "display_name") || null, primary: s(fd, "primary") || null, accent: s(fd, "accent") || null }));
  revalidatePath("/", "layout");
  go(MARCA, { ok: "Marca guardada. Así la ven tus clientes en el portal." });
}

export async function logoAction(fd: FormData) {
  const u = await me();
  const f = fd.get("logo");
  const remove = s(fd, "op") === "quitar";
  if (!remove && (!(f instanceof File) || !f.size)) go(MARCA, { error: "Elegí el archivo del logo." });
  await guard(MARCA, () => saveLogo(u, remove ? null : (f as File)));
  revalidatePath("/", "layout");
  go(MARCA, { ok: remove ? "Logo quitado." : "Logo actualizado." });
}

export async function domainAction(fd: FormData) {
  const u = await me();
  const r = await guard(MARCA, () => setDomain(u, s(fd, "domain")));
  go(MARCA, { ok: r ? "Dominio cargado. Creá los registros DNS y tocá «Verificar»." : "Dominio quitado." });
}

export async function verifyDomainAction() {
  const u = await me();
  const ok = await guard(MARCA, () => verifyDomain(u));
  revalidatePath("/", "layout");
  go(MARCA, ok ? { ok: "¡Dominio verificado! Ya podés usarlo para el portal." } : { error: "Todavía no vemos el registro TXT. Los cambios de DNS pueden tardar hasta 24 horas." });
}

export async function waAccountAction(fd: FormData) {
  const u = await me();
  const mode = s(fd, "mode") === "propio" ? "propio" : "compartido";
  await guard(WA, () => saveAccount(u, u.studioId, mode, mode === "propio" ? { phoneNumberId: s(fd, "phone_number_id"), wabaId: s(fd, "waba_id"), displayPhone: s(fd, "display_phone"), accessToken: s(fd, "access_token") || null, appSecret: s(fd, "app_secret") || null } : null));
  revalidatePath("/portal", "layout");
  go(WA, { ok: mode === "propio" ? "Número propio guardado." : "Listo: tus clientes reciben los avisos desde el número de Faro." });
}

export async function waPauseAction() {
  const u = await me();
  await pauseAccount(u, u.studioId);
  go(WA, { ok: "Guardado." });
}

export async function waSyncAction() {
  const u = await me();
  const a = await studioRow(u.studioId);
  if (!a || a.mode !== "propio") go(WA, { error: "Las plantillas del número de Faro las sincroniza Faro." });
  const n = await guard(WA, () => syncTemplates(a));
  await audit({ studioId: u.studioId, actor: u, action: "whatsapp.plantillas", entityType: "whatsapp", entityId: a.id, metadata: { plantillas: n } });
  go(WA, { ok: `Sincronizamos ${n} plantilla${n === 1 ? "" : "s"}.` });
}
