"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { getDb } from "@/db";
import { studios } from "@/db/schema";
import { takeAfterLogin } from "@/lib/after-login";
import { audit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { getAuth } from "@/lib/auth-server";

// Segundo factor del estudio (TOTP con app autenticadora + códigos de respaldo).

function v(fd: FormData, k: string) {
  const x = fd.get(k);
  return typeof x === "string" ? x.trim() : "";
}

const errorStatus = (e: unknown) => (e as { status?: string; body?: { code?: string } }) ?? {};

export interface VerifyState {
  ok: boolean;
  message?: string;
}

/** Paso 2 del login: código de la app o código de respaldo */
export async function verifySecondFactor(_prev: VerifyState, fd: FormData): Promise<VerifyState> {
  const backup = v(fd, "mode") === "backup";
  const code = backup ? v(fd, "code") : v(fd, "code").replace(/\s/g, "");
  if (!code) return { ok: false, message: "Ingresá el código." };
  try {
    const h = await headers();
    if (backup) await getAuth().api.verifyBackupCode({ body: { code }, headers: h });
    else await getAuth().api.verifyTOTP({ body: { code }, headers: h });
  } catch (error) {
    const e = errorStatus(error);
    const expired = e.body?.code === "INVALID_TWO_FACTOR_COOKIE";
    await audit({
      studioId: null,
      actorLabel: "segundo factor",
      action: "sesion.rechazada",
      result: "denegado",
      metadata: { via: backup ? "código de respaldo" : "app autenticadora", motivo: e.body?.code ?? e.status },
    });
    if (expired) return { ok: false, message: "Pasó demasiado tiempo. Volvé a ingresar tu email y contraseña." };
    if (e.body?.code === "TOO_MANY_ATTEMPTS" || e.status === "TOO_MANY_REQUESTS" || e.body?.code?.includes("LOCK")) {
      return { ok: false, message: "Demasiados intentos. Esperá unos minutos y volvé a probar." };
    }
    return {
      ok: false,
      message: backup ? "Código de respaldo incorrecto o ya usado." : "Código incorrecto. Revisá la hora del teléfono y probá con el código nuevo.",
    };
  }
  redirect(await takeAfterLogin());
}

export interface SetupState {
  ok: boolean;
  message?: string;
  qr?: string;
  secret?: string;
  backupCodes?: string[];
}

/** Configuración, paso 1: con la contraseña genera el secreto, el QR y los códigos de respaldo */
export async function startTwoFactorSetup(_prev: SetupState, fd: FormData): Promise<SetupState> {
  const user = await getCurrentUser();
  if (!user || user.role === "cliente") redirect("/admin/login");
  if (user.twoFactorEnabled) redirect("/admin");
  const password = v(fd, "password");
  if (!password) return { ok: false, message: "Ingresá tu contraseña." };
  try {
    const res = await getAuth().api.enableTwoFactor({ body: { password, issuer: "Estudio Cristofaro" }, headers: await headers() });
    const { totpURI, backupCodes } = res as { totpURI: string; backupCodes: string[] };
    const qr = await QRCode.toDataURL(totpURI, { margin: 1, width: 220, color: { dark: "#1c2235", light: "#ffffff" } });
    const secret = new URL(totpURI).searchParams.get("secret") ?? "";
    return { ok: true, qr, secret, backupCodes };
  } catch (error) {
    const e = errorStatus(error);
    if (e.status === "BAD_REQUEST") return { ok: false, message: "Contraseña incorrecta." };
    console.error("[2fa] enable", error);
    return { ok: false, message: "No se pudo iniciar la configuración. Probá de nuevo." };
  }
}

/** Configuración, paso 2: el primer código de la app confirma y activa el 2FA */
export async function confirmTwoFactorSetup(prev: SetupState, fd: FormData): Promise<SetupState> {
  const user = await getCurrentUser();
  if (!user || user.role === "cliente") redirect("/admin/login");
  const code = v(fd, "code").replace(/\s/g, "");
  if (!/^\d{6}$/.test(code)) return { ...prev, ok: true, message: "El código tiene 6 números." };
  try {
    await getAuth().api.verifyTOTP({ body: { code }, headers: await headers() });
  } catch {
    return { ...prev, ok: true, message: "Código incorrecto. Revisá la hora del teléfono y probá con el código nuevo." };
  }
  await audit({ studioId: user.studioId, actor: user, action: "usuario.2fa_activar", entityType: "usuario", entityId: user.id });
  // Dueño de un estudio nuevo: sigue con el asistente de bienvenida
  if (user.role === "dueno") {
    const [t] = await getDb().select({ onboarding: studios.onboarding, via: studios.created_via }).from(studios).where(eq(studios.id, user.studioId));
    if (t && t.via === "registro" && !t.onboarding.wizard) redirect("/bienvenida");
  }
  redirect("/admin?2fa=1");
}
