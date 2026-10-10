import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull, or } from "drizzle-orm";
import { getDb } from "@/db";
import { mcp_accesses, mcp_tokens, users } from "@/db/schema";

// Tokens de los accesos MCP. Se muestran una sola vez; en la base queda el SHA-256.
// - bearer: token fijo creado en /admin/mcp (vence con el acceso)
// - access / refresh: emitidos por OAuth 2.1 (1 hora / 30 días, con rotación)
// - code: código de autorización de OAuth (10 minutos, un solo uso)

export const ACCESS_TTL_S = 3600;
export const REFRESH_TTL_S = 30 * 86400;
export const CODE_TTL_S = 600;

export const hashToken = (t: string) => createHash("sha256").update(t, "utf8").digest("hex");

export function newToken(kind: "bearer" | "access" | "refresh" | "code") {
  const prefix = { bearer: "faro_mcp_", access: "faro_at_", refresh: "faro_rt_", code: "faro_code_" }[kind];
  const token = `${prefix}${randomBytes(32).toString("base64url")}`;
  return { token, hash: hashToken(token), prefix: token.slice(0, prefix.length + 6) };
}

export async function storeToken(accessId: string, kind: "bearer" | "access" | "refresh" | "code", ttlSeconds: number | null, data: Record<string, unknown> = {}) {
  const t = newToken(kind);
  await getDb()
    .insert(mcp_tokens)
    .values({ access_id: accessId, kind, token_hash: t.hash, data, expires_at: ttlSeconds ? new Date(Date.now() + ttlSeconds * 1000) : null });
  return t;
}

export type McpAccess = typeof mcp_accesses.$inferSelect;

/** Acceso vigente (no revocado ni vencido, usuario activo del estudio) para un token Bearer u OAuth */
export async function accessForToken(token: string) {
  if (!/^faro_(mcp|at)_[\w-]{20,}$/.test(token)) return null;
  const now = new Date();
  const [row] = await getDb()
    .select({ access: mcp_accesses, user: users, tokenId: mcp_tokens.id })
    .from(mcp_tokens)
    .innerJoin(mcp_accesses, eq(mcp_accesses.id, mcp_tokens.access_id))
    .innerJoin(users, eq(users.id, mcp_accesses.user_id))
    .where(
      and(
        eq(mcp_tokens.token_hash, hashToken(token)),
        or(eq(mcp_tokens.kind, "bearer"), eq(mcp_tokens.kind, "access")),
        or(isNull(mcp_tokens.expires_at), gt(mcp_tokens.expires_at, now)),
        isNull(mcp_tokens.used_at),
        isNull(mcp_accesses.revoked_at),
        or(isNull(mcp_accesses.expires_at), gt(mcp_accesses.expires_at, now)),
      ),
    );
  if (!row) return null;
  const u = row.user;
  if (!u.active || u.studioId !== row.access.studio_id || (u.role !== "admin" && u.role !== "contador")) return null;
  return row;
}
