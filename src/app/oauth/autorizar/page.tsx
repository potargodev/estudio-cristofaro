import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { authorizeOAuthClient } from "@/app/admin/mcp-actions";
import { AuthShell } from "@/components/auth/AuthShell";
import { ScopeFields } from "@/components/admin/mcp/ScopeFields";
import { getDb } from "@/db";
import { oauth_clients, organizations } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { mcpUrls } from "@/lib/mcp/oauth-meta";
import { TOOL_MODULES } from "@/modules/tools/types";

export const metadata: Metadata = { title: "Conectar con Faro", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

function Problem({ text }: { text: string }) {
  return (
    <AuthShell title="No se pudo conectar" subtitle="Faro · MCP">
      <p className="text-[15px] text-muted">{text}</p>
    </AuthShell>
  );
}

/**
 * Endpoint de autorización de OAuth 2.1 para clientes MCP (Claude, ChatGPT,
 * Claude Code). Exige sesión del estudio (con 2FA) y PKCE S256. La persona
 * elige los alcances: el acceso queda en /admin/mcp y se puede revocar.
 */
export default async function AutorizarPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  if (sp.error) return <Problem text={sp.error === "pedido" ? "El pedido de autorización no es válido. Volvé a conectar desde tu cliente MCP." : sp.error} />;
  const clientId = sp.client_id ?? "";
  const redirectUri = sp.redirect_uri ?? "";
  const [client] = clientId ? await getDb().select().from(oauth_clients).where(eq(oauth_clients.client_id, clientId)) : [];
  if (!client) return <Problem text="El cliente no está registrado en Faro. Volvé a conectar desde tu cliente MCP." />;
  if (!client.redirect_uris.includes(redirectUri)) return <Problem text="La dirección de retorno no coincide con la registrada por el cliente." />;
  if (sp.response_type !== "code") return <Problem text="Faro solo acepta response_type=code." />;
  if (sp.code_challenge_method !== "S256" || !/^[\w-]{43,128}$/.test(sp.code_challenge ?? "")) return <Problem text="Falta PKCE (code_challenge con S256)." />;
  if (sp.resource && sp.resource.replace(/\/$/, "") !== mcpUrls().resource) return <Problem text="El recurso pedido no es el servidor MCP de Faro." />;

  const user = await getCurrentUser();
  if (!user || (user.role !== "admin" && user.role !== "contador") || !user.twoFactorEnabled || user.mustChangePassword) {
    const here = `/oauth/autorizar?${new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => typeof e[1] === "string")).toString()}`;
    redirect(`/api/oauth/continuar?next=${encodeURIComponent(here)}`);
  }
  const orgs = await getDb().select({ id: organizations.id, name: organizations.name }).from(organizations).where(eq(organizations.studio_id, user.studioId)).orderBy(organizations.name);

  return (
    <AuthShell title={`Conectar ${client.name}`} subtitle="Faro · acceso MCP" wide>
      <p className="text-[15px] leading-relaxed text-ink">
        <strong>{client.name}</strong> quiere operar Faro en tu nombre ({user.email}), con los permisos de tu rol. Elegí qué puede ver y hacer. Lo sensible igual pasa por Aprobaciones y podés revocar el acceso cuando quieras en Accesos MCP.
      </p>
      <p className="mt-2 break-all text-[12px] text-muted">Vuelve a: {redirectUri}</p>
      <form action={authorizeOAuthClient} className="mt-5 grid gap-5">
        <input type="hidden" name="client_id" value={clientId} />
        <input type="hidden" name="redirect_uri" value={redirectUri} />
        <input type="hidden" name="state" value={sp.state ?? ""} />
        <input type="hidden" name="code_challenge" value={sp.code_challenge ?? ""} />
        <div>
          <label htmlFor="oauth-name" className="text-sm font-medium text-ink/80">
            Nombre del acceso
          </label>
          <input id="oauth-name" name="name" defaultValue={client.name} maxLength={80} className="mt-1 h-9 w-full border border-line bg-surface px-2 text-[15px]" />
        </div>
        <ScopeFields modules={TOOL_MODULES} orgs={orgs} idPrefix="oauth" />
        <div className="flex flex-wrap gap-2">
          <button type="submit" name="decision" value="permitir" className="h-10 bg-navy px-5 text-[15px] font-medium text-paper hover:bg-navy-deep">
            Permitir acceso
          </button>
          <button type="submit" name="decision" value="rechazar" formNoValidate className="h-10 border border-line bg-surface px-5 text-[15px] text-ink hover:border-muted">
            Rechazar
          </button>
        </div>
      </form>
    </AuthShell>
  );
}
