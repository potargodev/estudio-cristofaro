import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { mcp_accesses, organizations } from "@/db/schema";
import { TOOL_MODULES, type ToolModule } from "@/modules/tools/types";

// Alcances de un acceso MCP a partir de un formulario (lo usan /admin/mcp y el
// consentimiento de OAuth). Las organizaciones se validan contra el estudio.

export { EXPIRY_LABELS as EXPIRY_OPTIONS } from "@/components/admin/mcp/labels";

export interface AccessScope {
  modules: ToolModule[];
  can_write: boolean;
  organization_ids: string[] | null;
  expires_at: Date | null;
}

export async function scopeFromForm(fd: FormData, studioId: string): Promise<AccessScope | { error: string }> {
  const modules = fd.getAll("modules").map(String).filter((m): m is ToolModule => m in TOOL_MODULES);
  const allModules = fd.get("modules_all") === "on" || modules.length === 0 || modules.length === Object.keys(TOOL_MODULES).length;
  const orgMode = String(fd.get("orgs") ?? "todas");
  let organization_ids: string[] | null = null;
  if (orgMode === "algunas") {
    const wanted = [...new Set(fd.getAll("organization_ids").map(String))].filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 500);
    if (!wanted.length) return { error: "Elegí al menos una organización (o todas)." };
    const rows = await getDb()
      .select({ id: organizations.id })
      .from(organizations)
      .where(and(eq(organizations.studio_id, studioId), inArray(organizations.id, wanted)));
    if (rows.length !== wanted.length) return { error: "Alguna organización no es del estudio." };
    organization_ids = rows.map((r) => r.id);
  }
  const exp = String(fd.get("expires") ?? "90");
  const days = exp === "nunca" ? null : Number(exp);
  if (days !== null && ![30, 90, 365].includes(days)) return { error: "Elegí un vencimiento." };
  return {
    modules: allModules ? [] : modules,
    can_write: fd.get("can_write") === "on",
    organization_ids,
    expires_at: days ? new Date(Date.now() + days * 86400000) : null,
  };
}

export async function accessOfStudio(id: string, studioId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [a] = await getDb()
    .select()
    .from(mcp_accesses)
    .where(and(eq(mcp_accesses.id, id), eq(mcp_accesses.studio_id, studioId)));
  return a ?? null;
}
