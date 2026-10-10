"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { mcp_accesses, oauth_clients } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requireTenant, TENANT_OWNERS } from "@/lib/auth";
import { accessOfStudio, scopeFromForm } from "@/lib/mcp/accesses";
import { CODE_TTL_S, storeToken } from "@/lib/mcp/tokens";

// Accesos MCP. Cada persona del estudio crea los suyos (con los permisos de su
// rol); un admin ve y revoca los de todo el estudio. El token se muestra una
// sola vez y en la base queda su hash.

export interface CreateAccessState {
  ok: boolean;
  message?: string;
  token?: string;
  name?: string;
}

export async function createMcpAccess(_prev: CreateAccessState, fd: FormData): Promise<CreateAccessState> {
  const user = await requireTenant();
  const name = String(fd.get("name") ?? "").trim().slice(0, 80);
  if (name.length < 2) return { ok: false, message: "Poné un nombre para reconocer el acceso (ej.: Claude de Marina)." };
  const scope = await scopeFromForm(fd, user.studioId);
  if ("error" in scope) return { ok: false, message: scope.error };
  const db = getDb();
  const [access] = await db
    .insert(mcp_accesses)
    .values({ studio_id: user.studioId, user_id: user.id, name, kind: "token", ...scope })
    .returning();
  const t = await storeToken(access.id, "bearer", null);
  await db.update(mcp_accesses).set({ token_prefix: t.prefix }).where(eq(mcp_accesses.id, access.id));
  await audit({
    studioId: user.studioId,
    actor: user,
    action: "mcp.acceso_crear",
    entityType: "acceso_mcp",
    entityId: access.id,
    metadata: { nombre: name, escritura: scope.can_write, modulos: scope.modules, organizaciones: scope.organization_ids?.length ?? "todas", vence: scope.expires_at?.toISOString() ?? null },
  });
  revalidatePath("/admin/mcp");
  return { ok: true, token: t.token, name };
}

export async function revokeMcpAccess(fd: FormData) {
  const user = await requireTenant();
  const a = await accessOfStudio(String(fd.get("id") ?? ""), user.studioId);
  if (!a || (a.user_id !== user.id && !TENANT_OWNERS.includes(user.role))) redirect("/admin/mcp?error=acceso");
  await getDb()
    .update(mcp_accesses)
    .set({ revoked_at: new Date() })
    .where(and(eq(mcp_accesses.id, a!.id), isNull(mcp_accesses.revoked_at)));
  await audit({ studioId: user.studioId, actor: user, action: "mcp.acceso_revocar", entityType: "acceso_mcp", entityId: a!.id, metadata: { nombre: a!.name } });
  revalidatePath("/admin/mcp");
  redirect("/admin/mcp?revocado=1");
}

// ───────────── OAuth 2.1: consentimiento ─────────────

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "");

function withParams(uri: string, params: Record<string, string>) {
  const u = new URL(uri);
  for (const [k, v] of Object.entries(params)) if (v) u.searchParams.set(k, v);
  return u.toString();
}

/** Aprobar o rechazar el pedido de un cliente OAuth: crea el acceso con los alcances elegidos y el código */
export async function authorizeOAuthClient(fd: FormData) {
  const user = await requireTenant();
  const clientId = s(fd, "client_id");
  const redirectUri = s(fd, "redirect_uri");
  const state = s(fd, "state");
  const challenge = s(fd, "code_challenge");
  const [client] = await getDb().select().from(oauth_clients).where(eq(oauth_clients.client_id, clientId));
  // Se revalida todo: nunca se redirige a una URI que el cliente no registró
  if (!client || !client.redirect_uris.includes(redirectUri) || !/^[\w-]{43,128}$/.test(challenge)) redirect("/oauth/autorizar?error=pedido");
  if (s(fd, "decision") !== "permitir") {
    await audit({ studioId: user.studioId, actor: user, action: "mcp.oauth_rechazar", metadata: { cliente: client!.name } });
    redirect(withParams(redirectUri, { error: "access_denied", state }));
  }
  const scope = await scopeFromForm(fd, user.studioId);
  if ("error" in scope) redirect(`/oauth/autorizar?error=${encodeURIComponent(scope.error)}`);
  const name = (s(fd, "name").trim() || client!.name).slice(0, 80);
  const [access] = await getDb()
    .insert(mcp_accesses)
    .values({ studio_id: user.studioId, user_id: user.id, name, kind: "oauth", oauth_client_id: clientId, ...(scope as Exclude<typeof scope, { error: string }>) })
    .returning();
  const code = await storeToken(access.id, "code", CODE_TTL_S, { client_id: clientId, redirect_uri: redirectUri, code_challenge: challenge });
  await audit({
    studioId: user.studioId,
    actor: user,
    action: "mcp.oauth_autorizar",
    entityType: "acceso_mcp",
    entityId: access.id,
    metadata: { cliente: client!.name, escritura: access.can_write, organizaciones: access.organization_ids?.length ?? "todas" },
  });
  redirect(withParams(redirectUri, { code: code.token, state }));
}
