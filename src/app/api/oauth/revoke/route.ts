import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { mcp_tokens } from "@/db/schema";
import { json, oauthBody, preflight } from "@/lib/mcp/http";
import { hashToken } from "@/lib/mcp/tokens";

export const dynamic = "force-dynamic";

/** RFC 7009: revoca un access o refresh token (siempre responde 200) */
export async function POST(request: Request) {
  const b = await oauthBody(request);
  if (b.token) await getDb().update(mcp_tokens).set({ used_at: new Date() }).where(eq(mcp_tokens.token_hash, hashToken(b.token)));
  return json({});
}
export const OPTIONS = preflight;
