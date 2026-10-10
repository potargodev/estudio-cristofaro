"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { connections, external_records, legal_entities } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth";
import { encryptionEnabled } from "@/lib/crypto";
import { studioOrganization } from "@/lib/organizations";
import { parseExport } from "@/modules/connectors/archivos/parse";
import { FIELD_LABEL, getTemplate, type MappingField } from "@/modules/connectors/archivos/templates";
import { ensureFolders, getDriveConnection, syncDrive } from "@/modules/connectors/google-drive/drive";
import { cleanPrefix, listRemoteTools, settingsOf, type ToolPermission } from "@/modules/connectors/mcp-externo/client";
import { connectionOfStudio, endLog, readCredentials, sealCredentials, startLog, upsertExternal } from "@/modules/connectors/store";
import { syncXubio, testXubio } from "@/modules/connectors/xubio/sync";

// Hub de Conexiones: solo administradores, siempre dentro de su estudio. Las
// credenciales se cifran antes de guardarse y nunca vuelven al navegador.

function s(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}
const go = (path: string, q: string): never => redirect(`${path}${path.includes("?") ? "&" : "?"}${q}`);
const msg = (path: string, ok: boolean, text: string) => go(path, `${ok ? "ok" : "error"}=${encodeURIComponent(text)}`);

// ───────────── Xubio ─────────────

const XUBIO = "/admin/conexiones/xubio";

export async function saveXubio(fd: FormData) {
  const admin = await requireAdmin();
  if (!encryptionEnabled()) msg(XUBIO, false, "Falta ENCRYPTION_KEY en el servidor.");
  const id = s(fd, "id");
  const current = id ? await connectionOfStudio(id, admin.studioId, "xubio") : null;
  if (id && !current) msg(XUBIO, false, "Esa conexión no existe.");
  const orgId = s(fd, "organization_id");
  const org = orgId ? await studioOrganization(orgId, admin.studioId) : null;
  if (orgId && !org) msg(XUBIO, false, "Esa organización no es del estudio.");
  const prev = current ? readCredentials<{ client_id: string; client_secret: string }>(current) : {};
  const clientId = s(fd, "client_id") ?? prev.client_id;
  const secret = s(fd, "client_secret") ?? prev.client_secret;
  if (!clientId || !secret) msg(XUBIO, false, "Completá el Client ID y el Secret ID de la App Cliente.");
  const values = {
    name: (s(fd, "name") ?? (org ? `Xubio · ${org.name}` : "Xubio del estudio")).slice(0, 80),
    organization_id: org?.id ?? null,
    credentials_enc: sealCredentials({ client_id: clientId!, client_secret: secret! }),
  };
  const db = getDb();
  let connId = current?.id;
  if (current) await db.update(connections).set(values).where(eq(connections.id, current.id));
  else connId = (await db.insert(connections).values({ ...values, studio_id: admin.studioId, connector: "xubio", created_by: admin.id }).returning({ id: connections.id }))[0].id;
  await audit({ studioId: admin.studioId, organizationId: org?.id ?? null, actor: admin, action: current ? "conexion.editar" : "conexion.crear", entityType: "conexion", entityId: connId!, metadata: { conector: "xubio" } });
  // Se prueba al guardar
  const conn = await connectionOfStudio(connId!, admin.studioId, "xubio");
  const r = await testXubio(conn!, admin.id);
  revalidatePath("/admin/conexiones", "layout");
  msg(`${XUBIO}#c-${connId}`, r.ok, r.message);
}

export async function testXubioAction(fd: FormData) {
  const admin = await requireAdmin();
  const conn = await connectionOfStudio(s(fd, "id"), admin.studioId, "xubio");
  if (!conn) msg(XUBIO, false, "Esa conexión no existe.");
  const r = await testXubio(conn!, admin.id);
  await audit({ studioId: admin.studioId, organizationId: conn!.organization_id, actor: admin, action: "conexion.probar", entityType: "conexion", entityId: conn!.id, result: r.ok ? "ok" : "error", metadata: { conector: "xubio" } });
  revalidatePath("/admin/conexiones", "layout");
  msg(`${XUBIO}#c-${conn!.id}`, r.ok, r.message);
}

export async function syncXubioAction(fd: FormData) {
  const admin = await requireAdmin();
  const conn = await connectionOfStudio(s(fd, "id"), admin.studioId, "xubio");
  if (!conn) msg(XUBIO, false, "Esa conexión no existe.");
  const days = Math.min(365, Math.max(7, Number(s(fd, "days") ?? 90) || 90));
  const r = await syncXubio(conn!, admin.id, days);
  await audit({ studioId: admin.studioId, organizationId: conn!.organization_id, actor: admin, action: "conexion.sincronizar", entityType: "conexion", entityId: conn!.id, result: r.ok ? "ok" : "error", metadata: { conector: "xubio", registros: r.records, dias: days } });
  revalidatePath("/admin/conexiones", "layout");
  msg(`${XUBIO}#c-${conn!.id}`, r.ok, r.message);
}

export async function deleteConnection(fd: FormData) {
  const admin = await requireAdmin();
  const conn = await connectionOfStudio(s(fd, "id"), admin.studioId);
  const back = s(fd, "back") ?? "/admin/conexiones";
  if (!conn) msg(back, false, "Esa conexión no existe.");
  await getDb().delete(connections).where(and(eq(connections.id, conn!.id), eq(connections.studio_id, admin.studioId)));
  await audit({ studioId: admin.studioId, organizationId: conn!.organization_id, actor: admin, action: "conexion.eliminar", entityType: "conexion", entityId: conn!.id, metadata: { conector: conn!.connector, nombre: conn!.name } });
  revalidatePath("/admin/conexiones", "layout");
  msg(back.startsWith("/admin/conexiones") ? back : "/admin/conexiones", true, "Conexión eliminada con sus registros.");
}

/** Vincula a mano un registro externo con una razón social del estudio (queda validado) */
export async function linkExternalRecord(fd: FormData) {
  const admin = await requireAdmin();
  const back = s(fd, "back") ?? "/admin/conexiones";
  const recordId = s(fd, "record_id");
  const leId = s(fd, "legal_entity_id");
  if (!recordId || !leId || !/^[0-9a-f-]{36}$/i.test(recordId) || !/^[0-9a-f-]{36}$/i.test(leId)) msg(back, false, "Elegí la razón social.");
  const db = getDb();
  const [le] = await db.select().from(legal_entities).where(and(eq(legal_entities.id, leId!), eq(legal_entities.studio_id, admin.studioId)));
  if (!le) msg(back, false, "Esa razón social no es del estudio.");
  const [row] = await db
    .update(external_records)
    .set({ organization_id: le!.organization_id, legal_entity_id: le!.id, validation_status: "validado" })
    .where(and(eq(external_records.id, recordId!), eq(external_records.studio_id, admin.studioId)))
    .returning({ id: external_records.id, source: external_records.source });
  if (!row) msg(back, false, "Ese registro no existe.");
  await audit({ studioId: admin.studioId, organizationId: le!.organization_id, actor: admin, action: "conexion.vincular", entityType: "registro_externo", entityId: row!.id, metadata: { fuente: row!.source } });
  revalidatePath(back.split("#")[0]);
  msg(back, true, "Registro vinculado.");
}

// ───────────── Google Drive ─────────────

const DRIVE = "/admin/conexiones/google-drive";

export async function driveFoldersAction() {
  const admin = await requireAdmin();
  const conn = await getDriveConnection(admin.studioId);
  if (!conn) msg(DRIVE, false, "Conectá Google Drive primero.");
  const r = await ensureFolders(conn!, admin.id);
  await audit({ studioId: admin.studioId, actor: admin, action: "conexion.sincronizar", entityType: "conexion", entityId: conn!.id, result: r.ok ? "ok" : "error", metadata: { conector: "google_drive", paso: "carpetas" } });
  revalidatePath(DRIVE);
  msg(DRIVE, r.ok, r.message);
}

export async function driveSyncAction() {
  const admin = await requireAdmin();
  const conn = await getDriveConnection(admin.studioId);
  if (!conn) msg(DRIVE, false, "Conectá Google Drive primero.");
  const r = await syncDrive(conn!, admin.id);
  await audit({ studioId: admin.studioId, actor: admin, action: "conexion.sincronizar", entityType: "conexion", entityId: conn!.id, result: r.ok ? "ok" : "error", metadata: { conector: "google_drive" } });
  revalidatePath(DRIVE);
  revalidatePath("/admin");
  msg(DRIVE, r.ok, r.message);
}

// ───────────── MCP externo ─────────────

const MCPX = "/admin/conexiones/mcp-externo";

export async function saveMcpExterno(fd: FormData) {
  const admin = await requireAdmin();
  if (!encryptionEnabled()) msg(MCPX, false, "Falta ENCRYPTION_KEY en el servidor.");
  const id = s(fd, "id");
  const current = id ? await connectionOfStudio(id, admin.studioId, "mcp_externo") : null;
  if (id && !current) msg(MCPX, false, "Esa conexión no existe.");
  const prev = current ? readCredentials<{ url: string; auth_header?: string; auth_value?: string }>(current) : {};
  const url = s(fd, "url") ?? prev.url;
  if (!url || !/^https?:\/\/\S+$/i.test(url)) msg(MCPX, false, "Revisá la URL del servidor MCP (https://…).");
  const name = (s(fd, "name") ?? "Servidor MCP").slice(0, 60);
  const prefix = cleanPrefix(s(fd, "prefix") ?? name);
  const creds = { url: url!, auth_header: s(fd, "auth_header") ?? prev.auth_header ?? "Authorization", auth_value: s(fd, "auth_value") ?? prev.auth_value ?? "" };
  const db = getDb();
  const values = { name, credentials_enc: sealCredentials(creds), settings: { ...(current?.settings ?? {}), prefix } };
  let connId = current?.id;
  if (current) await db.update(connections).set(values).where(eq(connections.id, current.id));
  else connId = (await db.insert(connections).values({ ...values, studio_id: admin.studioId, connector: "mcp_externo", created_by: admin.id }).returning({ id: connections.id }))[0].id;
  await audit({ studioId: admin.studioId, actor: admin, action: current ? "conexion.editar" : "conexion.crear", entityType: "conexion", entityId: connId!, metadata: { conector: "mcp_externo", url: new URL(url!).origin } });
  await refresh(connId!, admin.studioId, admin.id);
}

async function refresh(connId: string, studioId: string, actorId: string) {
  const conn = await connectionOfStudio(connId, studioId, "mcp_externo");
  if (!conn) msg(MCPX, false, "Esa conexión no existe.");
  const log = await startLog(conn!.id, "test", actorId);
  let ok = false;
  let text: string;
  try {
    const r = await listRemoteTools(conn!);
    await getDb()
      .update(connections)
      .set({ settings: { ...conn!.settings, tools: r.tools, server: r.server, listed_at: new Date().toISOString() } })
      .where(eq(connections.id, conn!.id));
    ok = true;
    text = `Conectado${r.server.name ? ` a ${r.server.name}` : ""}: ${r.tools.length} herramientas (${r.tools.filter((t) => t.permission === "lectura").length} de lectura habilitadas).`;
  } catch (error) {
    text = `No se pudo conectar con el servidor MCP: ${(error as Error).message?.slice(0, 200)}`;
  }
  await endLog(log, conn!.id, ok, text);
  revalidatePath("/admin/conexiones", "layout");
  msg(`${MCPX}#c-${conn!.id}`, ok, text);
}

export async function refreshMcpTools(fd: FormData) {
  const admin = await requireAdmin();
  await refresh(s(fd, "id") ?? "", admin.studioId, admin.id);
}

export async function saveMcpPermissions(fd: FormData) {
  const admin = await requireAdmin();
  const conn = await connectionOfStudio(s(fd, "id"), admin.studioId, "mcp_externo");
  if (!conn) msg(MCPX, false, "Esa conexión no existe.");
  const st = settingsOf(conn!);
  const tools = (st.tools ?? []).map((t) => {
    const p = s(fd, `perm:${t.name}`) as ToolPermission | null;
    return { ...t, permission: p === "lectura" || p === "escritura" || p === "off" ? p : t.permission };
  });
  await getDb().update(connections).set({ settings: { ...st, tools }, status: fd.get("active") === "on" ? "activa" : "pausada" }).where(eq(connections.id, conn!.id));
  await audit({ studioId: admin.studioId, actor: admin, action: "conexion.editar", entityType: "conexion", entityId: conn!.id, metadata: { conector: "mcp_externo", permisos: Object.fromEntries(tools.map((t) => [t.name, t.permission])) } });
  revalidatePath("/admin/conexiones", "layout");
  msg(`${MCPX}#c-${conn!.id}`, true, "Permisos guardados.");
}

// ───────────── Archivos ─────────────

export interface ImportState {
  ok: boolean;
  message?: string;
  preview?: { externalId: string; cuit: string | null; name: string | null; date: string | null; amount: number | null }[];
  columns?: Record<string, string>;
  errors?: string[];
  total?: number;
  imported?: number;
  matched?: number;
}

export async function importExportFile(_prev: ImportState, fd: FormData): Promise<ImportState> {
  const admin = await requireAdmin();
  const template = getTemplate(s(fd, "template") ?? "");
  if (!template) return { ok: false, message: "Elegí una plantilla." };
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Elegí el archivo exportado (CSV o XLSX)." };
  if (file.size > 10 * 1024 * 1024) return { ok: false, message: "El archivo supera los 10 MB." };
  const orgId = s(fd, "organization_id");
  const org = orgId ? await studioOrganization(orgId, admin.studioId) : null;
  if (orgId && !org) return { ok: false, message: "Esa organización no es del estudio." };
  const overrides: Partial<Record<MappingField, string[]>> = {};
  for (const f of Object.keys(FIELD_LABEL) as MappingField[]) {
    const v = s(fd, `col_${f}`);
    if (v) overrides[f] = v.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 5);
  }
  let parsed;
  try {
    parsed = await parseExport(file, template, overrides);
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
  const preview = parsed.rows.slice(0, 8).map((r) => ({ externalId: r.externalId, cuit: r.cuit ?? null, name: r.name ?? null, date: r.date ?? null, amount: r.amount ?? null }));
  const base = { columns: parsed.columns as Record<string, string>, errors: parsed.errors, total: parsed.total, preview };
  if (s(fd, "mode") !== "importar") return { ok: true, ...base, message: `Vista previa: ${parsed.rows.length} filas válidas de ${parsed.total}.` };
  if (!parsed.rows.length) return { ok: false, ...base, message: "No hay filas para importar." };

  // Una conexión de archivos por estudio (u organización) y sistema
  const db = getDb();
  const name = `${template.label.split(" · ")[0]}${org ? ` · ${org.name}` : ""}`;
  const [existing] = await db
    .select()
    .from(connections)
    .where(and(eq(connections.studio_id, admin.studioId), eq(connections.connector, "archivos"), eq(connections.name, name)));
  const conn =
    existing ??
    (await db.insert(connections).values({ studio_id: admin.studioId, connector: "archivos", name, organization_id: org?.id ?? null, status: "activa", settings: { system: template.system }, created_by: admin.id }).returning())[0];
  const log = await startLog(conn.id, "import", admin.id);
  const rows = org && template.resource !== "clientes" ? parsed.rows.map((r) => ({ ...r, organizationId: org.id })) : parsed.rows;
  const imported = await upsertExternal(conn, template.system, rows);
  const [{ n: matched }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(external_records)
    .where(and(eq(external_records.connection_id, conn.id), eq(external_records.validation_status, "cruzado")));
  const message = `Importadas ${imported} filas de ${file.name} (${template.label}). ${matched} cruzadas por CUIT con razones sociales.`;
  await endLog(log, conn.id, true, message, imported);
  await audit({ studioId: admin.studioId, organizationId: org?.id ?? null, actor: admin, action: "conexion.importar", entityType: "conexion", entityId: conn.id, metadata: { plantilla: template.key, archivo: file.name, filas: imported } });
  revalidatePath("/admin/conexiones", "layout");
  return { ok: true, ...base, imported, matched, message };
}
