import { getSiteUrl } from "@/lib/runtime-config";

// URLs públicas del servidor MCP y del servidor de autorización OAuth 2.1
// (RFC 9728 y RFC 8414). Salen de SITE_URL: pasar de staging a producción es
// solo cambiar esa variable.

export const mcpUrls = () => {
  const base = getSiteUrl().replace(/\/$/, "");
  return {
    base,
    resource: `${base}/api/mcp`,
    resourceMetadata: `${base}/.well-known/oauth-protected-resource`,
    authorize: `${base}/oauth/autorizar`,
    token: `${base}/api/oauth/token`,
    register: `${base}/api/oauth/register`,
    revoke: `${base}/api/oauth/revoke`,
  };
};

export const MCP_SCOPES = ["faro"];

export function protectedResourceMetadata() {
  const u = mcpUrls();
  return {
    resource: u.resource,
    authorization_servers: [u.base],
    bearer_methods_supported: ["header"],
    scopes_supported: MCP_SCOPES,
    resource_name: "Faro",
  };
}

export function authorizationServerMetadata() {
  const u = mcpUrls();
  return {
    issuer: u.base,
    authorization_endpoint: u.authorize,
    token_endpoint: u.token,
    registration_endpoint: u.register,
    revocation_endpoint: u.revoke,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: MCP_SCOPES,
  };
}
