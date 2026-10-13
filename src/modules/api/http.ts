import "server-only";
import { rateLimit } from "@/lib/rate-limit";
import { ApiError, authenticate, type ApiAuth } from "./server";

// Respuestas de /api/v1: JSON siempre, errores con { error: { codigo, mensaje } },
// 401 sin token válido y 429 con Retry-After al pasar el límite por minuto.

const json = (status: number, body: unknown, headers: Record<string, string> = {}) => Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });
export const apiError = (status: number, codigo: string, mensaje: string, headers: Record<string, string> = {}) => json(status, { error: { codigo, mensaje } }, headers);

export async function withApi(req: Request, run: (a: ApiAuth) => Promise<{ status?: number; body: unknown; headers?: Record<string, string> }>) {
  const a = await authenticate(req.headers.get("authorization"));
  if (!a) return apiError(401, "no_autorizado", "Falta el token o no es válido (Authorization: Bearer faro_api_…).", { "WWW-Authenticate": 'Bearer realm="faro"' });
  if (!rateLimit(`api:${a.tokenId}`, a.rate, 60_000)) return apiError(429, "limite", `Pasaste el límite de ${a.rate} pedidos por minuto de este token.`, { "Retry-After": "60" });
  try {
    const r = await run(a);
    return json(r.status ?? 200, r.body, r.headers);
  } catch (e) {
    if (e instanceof ApiError) return apiError(e.status, e.code, e.message);
    console.error("[api]", (e as Error).message);
    return apiError(500, "error", "Algo salió mal. Probá de nuevo; si sigue, escribinos.");
  }
}
