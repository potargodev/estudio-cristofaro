// Respuestas JSON de los endpoints OAuth/MCP con CORS abierto (los clientes MCP
// del navegador consultan la metadata y el token desde otro origen).

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, MCP-Protocol-Version",
};

export const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...CORS, ...extra } });

export const preflight = () => new Response(null, { status: 204, headers: CORS });

/** Body de un POST OAuth: form-urlencoded (lo normal) o JSON */
export async function oauthBody(request: Request): Promise<Record<string, string>> {
  const type = request.headers.get("content-type") ?? "";
  try {
    if (type.includes("application/json")) {
      const o = (await request.json()) as Record<string, unknown>;
      return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)]));
    }
    return Object.fromEntries(new URLSearchParams(await request.text()));
  } catch {
    return {};
  }
}
