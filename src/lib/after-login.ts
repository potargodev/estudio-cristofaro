import "server-only";
import { cookies } from "next/headers";

// A dónde volver después del login del estudio. Solo se usa para el
// consentimiento de OAuth de MCP (/oauth/autorizar), nunca para otras URLs.

export const AFTER_LOGIN_COOKIE = "faro_despues_login";

/** Destino guardado (y lo borra), o el panel */
export async function takeAfterLogin(fallback = "/admin") {
  const jar = await cookies();
  const next = jar.get(AFTER_LOGIN_COOKIE)?.value;
  if (!next) return fallback;
  jar.delete(AFTER_LOGIN_COOKIE);
  return next.startsWith("/oauth/autorizar?") ? next : fallback;
}
