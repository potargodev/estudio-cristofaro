import { json, preflight } from "@/lib/mcp/http";
import { protectedResourceMetadata } from "@/lib/mcp/oauth-meta";

export const dynamic = "force-dynamic";
/** RFC 9728: metadata del recurso protegido (también en /.well-known/oauth-protected-resource/api/mcp) */
export const GET = () => json(protectedResourceMetadata());
export const OPTIONS = preflight;
