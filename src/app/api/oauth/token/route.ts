import { createHash } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { mcp_accesses, mcp_tokens } from "@/db/schema";
import { audit } from "@/lib/audit";
import { json, oauthBody, preflight } from "@/lib/mcp/http";
import { ACCESS_TTL_S, hashToken, REFRESH_TTL_S, storeToken } from "@/lib/mcp/tokens";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const error = (code: string, description: string, status = 400) => json({ error: code, error_description: description }, status);

/** Consume un token de un solo uso (código o refresh): lo marca usado de forma atómica */
async function consume(token: string, kind: "code" | "refresh") {
  const db = getDb();
  const [row] = await db
    .update(mcp_tokens)
    .set({ used_at: new Date() })
    .where(and(eq(mcp_tokens.token_hash, hashToken(token)), eq(mcp_tokens.kind, kind), isNull(mcp_tokens.used_at), gt(mcp_tokens.expires_at, new Date())))
    .returning();
  if (!row) return null;
  const [access] = await db.select().from(mcp_accesses).where(eq(mcp_accesses.id, row.access_id));
  if (!access || access.revoked_at || (access.expires_at && access.expires_at < new Date())) return null;
  return { row, access };
}

/** Emite el par access/refresh sin pasarse del vencimiento del acceso */
async function issue(access: typeof mcp_accesses.$inferSelect, clientId: string) {
  const left = access.expires_at ? Math.floor((access.expires_at.getTime() - Date.now()) / 1000) : Infinity;
  const accessTtl = Math.max(60, Math.min(ACCESS_TTL_S, left));
  const at = await storeToken(access.id, "access", accessTtl, { client_id: clientId });
  const rt = await storeToken(access.id, "refresh", Math.max(60, Math.min(REFRESH_TTL_S, left)), { client_id: clientId });
  return json({ access_token: at.token, token_type: "Bearer", expires_in: accessTtl, refresh_token: rt.token, scope: "faro" });
}

/** Token endpoint de OAuth 2.1: authorization_code (con PKCE S256) y refresh_token (con rotación) */
export async function POST(request: Request) {
  if (!rateLimit(`oauth-token:${clientIp(request.headers)}`, 60, 60_000)) return error("slow_down", "Demasiados pedidos.", 429);
  const b = await oauthBody(request);
  const clientId = b.client_id ?? "";
  if (b.grant_type === "authorization_code") {
    if (!b.code || !b.code_verifier || !b.redirect_uri) return error("invalid_request", "Faltan code, code_verifier o redirect_uri.");
    const found = await consume(b.code, "code");
    if (!found) return error("invalid_grant", "El código no es válido, venció o ya se usó.");
    const data = found.row.data as { client_id?: string; redirect_uri?: string; code_challenge?: string };
    const challenge = createHash("sha256").update(b.code_verifier).digest("base64url");
    if (data.client_id !== clientId || data.redirect_uri !== b.redirect_uri || data.code_challenge !== challenge) {
      await audit({ studioId: found.access.studio_id, actorLabel: `OAuth ${clientId}`, action: "mcp.oauth_token", result: "denegado", metadata: { motivo: "PKCE, cliente o redirect no coinciden" } });
      return error("invalid_grant", "PKCE, client_id o redirect_uri no coinciden.");
    }
    await audit({ studioId: found.access.studio_id, actorLabel: `OAuth ${clientId}`, action: "mcp.oauth_token", entityType: "acceso_mcp", entityId: found.access.id });
    return issue(found.access, clientId);
  }
  if (b.grant_type === "refresh_token") {
    if (!b.refresh_token) return error("invalid_request", "Falta refresh_token.");
    const found = await consume(b.refresh_token, "refresh");
    if (!found) return error("invalid_grant", "El refresh token no es válido, venció, ya se usó o el acceso fue revocado.");
    if ((found.row.data as { client_id?: string }).client_id !== clientId) return error("invalid_grant", "El refresh token es de otro cliente.");
    return issue(found.access, clientId);
  }
  return error("unsupported_grant_type", "Solo authorization_code y refresh_token.");
}
export const OPTIONS = preflight;
