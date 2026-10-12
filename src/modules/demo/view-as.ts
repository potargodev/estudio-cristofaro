import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { getCookies } from "better-auth/cookies";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { getDb } from "@/db";
import { demo_impersonations, sessions, studios, users } from "@/db/schema";
import { audit, requestIp } from "@/lib/audit";
import { ASSISTED_COOKIE, ORG_COOKIE, type StaffUser } from "@/lib/auth";
import { getAuth } from "@/lib/auth-server";
import { homeFor } from "@/lib/roles";
import { getSiteUrl } from "@/lib/runtime-config";

// «Ver como…»: el owner de Faro recorre la app con la sesión real de un
// usuario de la demo. No simula permisos: el usuario demo pasa por los mismos
// guards del servidor que cualquier otro, y un usuario demo nunca tiene rol de
// Faro ni pertenece a un espacio real. La sesión original queda guardada para
// volver en un clic; inicio y fin quedan en la auditoría.

export const VIEW_AS_COOKIE = "faro_ver_como";
const HOURS = 2;

export class ViewAsError extends Error {}

const secure = () => getSiteUrl().startsWith("https");

/** Cookie de sesión de Better Auth firmada igual que la librería (token.HMAC-SHA256 en base64) */
async function setSessionCookie(token: string, expires: Date) {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new ViewAsError("Falta BETTER_AUTH_SECRET.");
  const c = getCookies(getAuth().options);
  const jar = await cookies();
  jar.set(c.sessionToken.name, `${token}.${createHmac("sha256", secret).update(token).digest("base64")}`, { httpOnly: true, secure: c.sessionToken.attributes.secure ?? secure(), sameSite: "lax", path: "/", expires });
  jar.delete(c.sessionData.name);
  jar.delete(c.dontRememberToken.name);
}

async function clearContext() {
  const jar = await cookies();
  jar.delete(ORG_COOKIE);
  jar.delete(ASSISTED_COOKIE);
  jar.delete(VIEW_AS_COOKIE);
}

/** La simulación vigente: cookie + fila abierta + la sesión actual es la del usuario demo */
export const activeViewAs = cache(async () => {
  const id = (await cookies()).get(VIEW_AS_COOKIE)?.value;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return null;
  const [row] = await getDb()
    .select({ id: demo_impersonations.id, faroUserId: demo_impersonations.faro_user_id, originalSessionId: demo_impersonations.original_session_id, targetUserId: demo_impersonations.target_user_id, targetEmail: demo_impersonations.target_email, targetSessionId: demo_impersonations.target_session_id, name: users.name, role: users.role, studio: studios.name })
    .from(demo_impersonations)
    .innerJoin(users, eq(users.id, demo_impersonations.target_user_id))
    .innerJoin(studios, eq(studios.id, users.studioId))
    .where(and(eq(demo_impersonations.id, id), isNull(demo_impersonations.ended_at)));
  return row && row.targetSessionId === session.session.id && row.targetUserId === session.user.id ? row : null;
});

/** Empieza a ver la app como un usuario de la demo. Solo para el owner de Faro (lo valida el que llama). */
export async function startViewAs(owner: StaffUser, targetUserId: string): Promise<string> {
  if (owner.faroRole !== "faro_owner" || !owner.twoFactorEnabled || owner.assisted) throw new ViewAsError("Solo el owner de Faro, con 2FA.");
  if (!/^[0-9a-f-]{36}$/i.test(targetUserId)) throw new ViewAsError("Usuario inválido.");
  const db = getDb();
  // Solo usuarios activos de la demo, en un espacio de la demo y sin rol de Faro
  const [t] = await db
    .select({ id: users.id, email: users.email, role: users.role, studioId: users.studioId })
    .from(users)
    .innerJoin(studios, eq(studios.id, users.studioId))
    .where(and(eq(users.id, targetUserId), eq(users.isDemo, true), eq(studios.is_demo, true), eq(users.active, true), isNull(users.faroRole)));
  if (!t) throw new ViewAsError("Solo se puede ver la app como un usuario de la demo.");
  const current = await getAuth().api.getSession({ headers: await headers() });
  if (!current || current.user.id !== owner.id) throw new ViewAsError("Sesión inválida.");

  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + HOURS * 3_600_000);
  const ip = await requestIp();
  const [session] = await db.insert(sessions).values({ token, userId: t.id, expiresAt: expires, ipAddress: ip, userAgent: "Faro · Ver como" }).returning({ id: sessions.id });
  const [row] = await db
    .insert(demo_impersonations)
    .values({ faro_user_id: owner.id, original_session_id: current.session.id, target_user_id: t.id, target_email: t.email, target_session_id: session.id })
    .returning({ id: demo_impersonations.id });

  await clearContext();
  await setSessionCookie(token, expires);
  (await cookies()).set(VIEW_AS_COOKIE, row.id, { httpOnly: true, secure: secure(), sameSite: "lax", path: "/", expires });
  await audit({ studioId: null, actor: owner, action: "demo.ver_como_iniciar", entityType: "usuario", entityId: t.id, ip, metadata: { como: t.email } });
  return homeFor(t.role);
}

/** Termina la simulación: borra la sesión demo y restaura la original si sigue vigente. */
export async function endViewAs(): Promise<string> {
  const row = await activeViewAs();
  await clearContext();
  const c = getCookies(getAuth().options);
  const jar = await cookies();
  if (!row) return "/";
  const db = getDb();
  await db.delete(sessions).where(eq(sessions.id, row.targetSessionId));
  await db.update(demo_impersonations).set({ ended_at: new Date() }).where(eq(demo_impersonations.id, row.id));
  const [owner] = await db.select({ id: users.id, email: users.email }).from(users).where(eq(users.id, row.faroUserId));
  await audit({ studioId: null, actor: owner ?? null, action: "demo.ver_como_terminar", entityType: "usuario", entityId: row.targetUserId, metadata: { como: row.targetEmail } });
  const [orig] = row.originalSessionId
    ? await db
        .select({ token: sessions.token, expires: sessions.expiresAt })
        .from(sessions)
        .where(and(eq(sessions.id, row.originalSessionId), eq(sessions.userId, row.faroUserId), gt(sessions.expiresAt, new Date())))
    : [];
  if (orig) {
    await setSessionCookie(orig.token, orig.expires);
    return "/faro-manager/demo";
  }
  jar.delete(c.sessionToken.name);
  return "/admin/login";
}
