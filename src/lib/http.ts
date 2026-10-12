import { createHash, timingSafeEqual } from "node:crypto";
import { clientIp, rateLimit } from "./rate-limit";

// Utilidades para rutas que reciben pedidos de terceros sin sesión (webhooks).

/** Lee el cuerpo como texto hasta `maxBytes`; si lo supera corta la lectura y devuelve null */
export async function readBodyLimited(req: Request, maxBytes: number): Promise<string | null> {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > maxBytes) return null;
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** Límite por IP para un webhook: false si ya pasó `perMinute` pedidos en el último minuto */
export const webhookAllowed = (req: Request, name: string, perMinute: number) => rateLimit(`webhook:${name}:${clientIp(req.headers)}`, perMinute, 60_000);

export const tooLarge = () => new Response("Muy grande", { status: 413 });
export const tooMany = () => new Response("Demasiados pedidos", { status: 429, headers: { "Retry-After": "60" } });

/** Cron externo: Authorization: Bearer <CRON_SECRET>. Compara los digests (mismo largo siempre, tiempo constante) */
export function cronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const given = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const digest = (v: string) => createHash("sha256").update(v).digest();
  return timingSafeEqual(digest(given), digest(secret));
}

export const unauthorized = () => new Response("No autorizado", { status: 401 });

/**
 * Pedido hecho desde la propia app (defensa contra CSRF en las rutas de API
 * con cookie de sesión). Los navegadores mandan Sec-Fetch-Site; si no está, se
 * compara el Origin con el host del pedido.
 */
export function sameOrigin(req: Request): boolean {
  const site = req.headers.get("sec-fetch-site");
  if (site) return site === "same-origin" || site === "none";
  const origin = req.headers.get("origin");
  if (!origin) return true; // clientes sin navegador (sin cookie de un tercero)
  try {
    return new URL(origin).host === (req.headers.get("x-forwarded-host") ?? req.headers.get("host"));
  } catch {
    return false;
  }
}

export const forbidden = () => new Response("Origen no permitido", { status: 403 });
