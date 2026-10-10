import { randomBytes } from "node:crypto";
import { getDb } from "@/db";
import { oauth_clients } from "@/db/schema";
import { json, preflight } from "@/lib/mcp/http";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** URIs de redirección aceptadas: https, o http solo en localhost (clientes de escritorio como Claude Code) */
function validRedirect(uri: string) {
  try {
    const u = new URL(uri);
    if (u.hash) return false;
    if (u.protocol === "https:") return true;
    return u.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
  } catch {
    return false;
  }
}

/** RFC 7591: registro dinámico de clientes públicos (sin secreto, con PKCE obligatorio) */
export async function POST(request: Request) {
  if (!rateLimit(`oauth-register:${clientIp(request.headers)}`, 20, 3600_000)) return json({ error: "too_many_requests" }, 429);
  let body: { client_name?: unknown; redirect_uris?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_client_metadata", error_description: "JSON inválido" }, 400);
  }
  const uris = Array.isArray(body.redirect_uris) ? body.redirect_uris.filter((u): u is string => typeof u === "string").slice(0, 10) : [];
  if (!uris.length || !uris.every(validRedirect)) {
    return json({ error: "invalid_redirect_uri", error_description: "redirect_uris tiene que tener URLs https (o http://localhost)." }, 400);
  }
  const name = typeof body.client_name === "string" && body.client_name.trim() ? body.client_name.trim().slice(0, 80) : "Cliente MCP";
  const clientId = `faro_client_${randomBytes(16).toString("hex")}`;
  await getDb().insert(oauth_clients).values({ client_id: clientId, name, redirect_uris: uris });
  return json(
    {
      client_id: clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: name,
      redirect_uris: uris,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    },
    201,
  );
}
export const OPTIONS = preflight;
