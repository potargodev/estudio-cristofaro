import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { mcpUrls } from "@/lib/mcp/oauth-meta";
import { createFaroMcpServer } from "@/lib/mcp/server";
import { accessForToken } from "@/lib/mcp/tokens";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Endpoint MCP remoto (Streamable HTTP, sin estado: un servidor por pedido).
// Autenticación: Authorization: Bearer <token> (token de /admin/mcp o access
// token de OAuth 2.1). Sin token válido responde 401 con el header que indica
// dónde está la metadata OAuth, como pide la especificación de MCP.

function unauthorized(message: string) {
  return new Response(JSON.stringify({ jsonrpc: "2.0", error: { code: -32001, message }, id: null }), {
    status: 401,
    headers: {
      "Content-Type": "application/json",
      // Los headers HTTP van en ASCII: sin tildes en la descripción
      "WWW-Authenticate": `Bearer realm="faro", error="invalid_token", error_description="${message.normalize("NFD").replace(/[^\x20-\x7e]/g, "")}", resource_metadata="${mcpUrls().resourceMetadata}"`,
    },
  });
}

async function handle(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  const token = /^Bearer\s+(\S+)$/i.exec(auth)?.[1];
  if (!token) return unauthorized("Falta el token de acceso.");
  const found = await accessForToken(token);
  if (!found) return unauthorized("El token no es válido, venció o el acceso fue revocado.");
  if (!rateLimit(`mcp:${found.access.id}`, 120, 60_000)) {
    return Response.json({ jsonrpc: "2.0", error: { code: -32000, message: "Demasiadas llamadas: esperá un minuto." }, id: null }, { status: 429 });
  }
  const server = createFaroMcpServer(found.access, found.user);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  return transport.handleRequest(request);
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
