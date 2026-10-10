import { json, preflight } from "@/lib/mcp/http";
import { authorizationServerMetadata } from "@/lib/mcp/oauth-meta";

export const dynamic = "force-dynamic";
/** RFC 8414: metadata del servidor de autorización de Faro (OAuth 2.1 con PKCE) */
export const GET = () => json(authorizationServerMetadata());
export const OPTIONS = preflight;
