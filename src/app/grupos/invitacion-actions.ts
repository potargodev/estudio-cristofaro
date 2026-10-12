"use server";

import { eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { signup_requests, users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { AUTH_ERRORS, getAuth, googleEnabled, googleSignInUrl, type AuthErrorCode } from "@/lib/auth-server";
import { LEGAL_VERSION } from "@/lib/faro/legal-version";
import { EMAIL_RE } from "@/lib/ids";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { getSiteUrl } from "@/lib/runtime-config";
import { GUEST_COOKIE } from "@/modules/gastos/server/actor";
import { getGastosActor } from "@/modules/gastos/server/session";
import * as svc from "@/modules/gastos/server/service";

// Sumarse a un grupo con su enlace (con cuenta, creándola o sin cuenta) y
// pasar a la cuenta el lugar de un invitado. Todo se valida en el servicio.

export type JoinState = { ok?: boolean; message?: string; link?: string | null };

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const TOKEN = /^[A-Za-z0-9_-]{20,100}$/;
/** Solo vuelve a pantallas de grupos (evita redirecciones abiertas) */
const safeNext = (v: string) => (/^\/grupos\/(unirse\/[A-Za-z0-9_-]{20,100}|reclamar)$/.test(v) || /^\/caja\/[0-9a-f-]{36}\.[A-Za-z0-9_-]{20,100}$/.test(v) ? v : "/grupos");

const setGuestCookie = async (token: string) =>
  (await cookies()).set(GUEST_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: getSiteUrl().startsWith("https"), maxAge: 60 * 60 * 24 * 90, path: "/" });

/** Con sesión: me sumo al grupo */
export async function joinGroupAction(fd: FormData) {
  const token = str(fd, "token");
  const a = await getGastosActor();
  if (!a || a.kind !== "user") redirect(`/grupos/unirse/${TOKEN.test(token) ? token : ""}`);
  let groupId = "";
  try {
    groupId = (await svc.joinWithInvite(a, token)).groupId;
  } catch (e) {
    if (e instanceof svc.GastosError) redirect(`/grupos/unirse/${token}?error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  redirect(`/grupos/g/${groupId}?nuevo=1`);
}

/** Sin cuenta: entra como invitado con su nombre */
export async function joinAsGuestAction(_: JoinState, fd: FormData): Promise<JoinState> {
  if (!rateLimit(`grupo-unirse:${clientIp(await headers())}`, 10, 10 * 60_000)) return { ok: false, message: "Hubo demasiados intentos. Esperá unos minutos." };
  let r: { groupId: string; token: string };
  try {
    r = await svc.joinAsGuest(str(fd, "token"), str(fd, "name"));
  } catch (e) {
    if (e instanceof svc.GastosError) return { ok: false, message: e.message };
    throw e;
  }
  await setGuestCookie(r.token);
  redirect(`/grupos/g/${r.groupId}?nuevo=1`);
}

/**
 * Crear la cuenta (o entrar) con Google o con un enlace por mail y volver al
 * grupo. Si el email no tiene cuenta, se deja el pedido de alta de una
 * persona (plan gratis): la cuenta se crea al volver de Google o del enlace.
 */
export async function groupAccountAction(_: JoinState, fd: FormData): Promise<JoinState> {
  const h = await headers();
  if (!rateLimit(`grupo-cuenta:${clientIp(h)}`, 8, 10 * 60_000)) return { ok: false, message: "Hubo demasiados intentos. Esperá unos minutos." };
  const email = str(fd, "email").toLowerCase();
  const name = str(fd, "name").slice(0, 120);
  const method = str(fd, "method") === "google" ? "google" : "enlace";
  const next = safeNext(str(fd, "next"));
  if (!EMAIL_RE.test(email)) return { ok: false, message: method === "google" ? "Escribí el mail de tu cuenta de Google." : "Revisá el email." };
  if (fd.get("terms") !== "on") return { ok: false, message: "Para crear la cuenta tenés que aceptar los términos y la política de privacidad." };
  const db = getDb();
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (!existing) {
    if (name.length < 2) return { ok: false, message: "Escribí tu nombre." };
    await db.insert(signup_requests).values({ email, kind: "persona", name, data: { origen: "grupo" }, terms_version: LEGAL_VERSION, expires_at: new Date(Date.now() + 3600_000) });
    await audit({ studioId: null, actorLabel: email, action: "faro.registro_pedido", entityType: "registro", metadata: { tipo: "persona", metodo: method, origen: "grupo de gastos" } });
  }
  if (method === "google") {
    if (!googleEnabled()) return { ok: false, message: "Ahora no se puede entrar con Google. Probá con el enlace por mail." };
    const url = await googleSignInUrl(next, next, h);
    if (!url) return { ok: false, message: "No pudimos abrir Google. Probá con el enlace por mail." };
    redirect(url);
  }
  try {
    await getAuth().api.signInMagicLink({ body: { email, callbackURL: next, errorCallbackURL: next }, headers: h });
  } catch (error) {
    const code = (error as { body?: { code?: string } }).body?.code;
    if (code === "MAIL_NO_ENVIADO") return { ok: false, message: googleEnabled() ? "Ahora no pudimos mandar el mail. Probá con Google o seguí sin cuenta." : "Ahora no pudimos mandar el mail. Seguí sin cuenta y creala después." };
    return { ok: false, message: code && code in AUTH_ERRORS ? AUTH_ERRORS[code as AuthErrorCode] : "No pudimos mandarte el enlace. Probá de nuevo." };
  }
  return { ok: true, message: `Te mandamos un enlace a ${email}. Abrilo desde este teléfono: vence en 15 minutos y te deja en el grupo.` };
}

/** Con sesión y con la cookie del invitado: el lugar del invitado pasa a la cuenta */
export async function claimGuestAction() {
  const a = await getGastosActor();
  if (!a || a.kind !== "user") redirect("/grupos/reclamar");
  const jar = await cookies();
  const token = jar.get(GUEST_COOKIE)?.value ?? "";
  let groupId = "";
  try {
    groupId = await svc.claimGuest(a, token);
  } catch (e) {
    if (e instanceof svc.GastosError) redirect(`/grupos/reclamar?error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  jar.delete(GUEST_COOKIE);
  redirect(`/grupos/g/${groupId}?guardado=cuenta`);
}

/** Enlace del grupo para compartir (y renovarlo) */
export async function groupLinkAction(_: JoinState, fd: FormData): Promise<JoinState> {
  const a = await getGastosActor();
  if (!a) redirect("/grupos/entrar");
  try {
    return { ok: true, link: await svc.groupInviteLink(a, str(fd, "group"), fd.get("renew") === "1") };
  } catch (e) {
    if (e instanceof svc.GastosError) return { ok: false, message: e.message };
    throw e;
  }
}
