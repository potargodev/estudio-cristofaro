import "server-only";
import { and, eq, inArray, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { connection_links, connections, documents, organizations } from "@/db/schema";
import { encryptionEnabled } from "@/lib/crypto";
import { getSiteUrl } from "@/lib/runtime-config";
import { checkUpload, storeUpload } from "@/lib/uploads";
import { endLog, readCredentials, sealCredentials, startLog, upsertExternal, type Connection } from "../store";

// Google Drive como buzón de comprobantes: una carpeta por organización dentro
// de una carpeta raíz del estudio. Al sincronizar, cada archivo nuevo entra a
// los documentos de su organización (origen cliente, sin revisar) y queda el
// registro externo con el ID de Drive. Es la base de la lectura inteligente.
//
// Usa las credenciales OAuth del proyecto de Google (GOOGLE_CLIENT_ID/SECRET)
// con la Drive API habilitada y la URI de redirección
// <SITE_URL>/api/conexiones/google-drive/callback. GOOGLE_API_MOCK_URL apunta
// todo a un simulador (mocks/google) para pruebas.

export const DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive", "openid", "email"];
const FOLDER = "application/vnd.google-apps.folder";
const MAX_BYTES = 10 * 1024 * 1024;

const mock = () => process.env.GOOGLE_API_MOCK_URL?.trim() || null;
const urls = () => {
  const m = mock();
  return {
    auth: m ? `${m}/o/oauth2/v2/auth` : "https://accounts.google.com/o/oauth2/v2/auth",
    token: m ? `${m}/token` : "https://oauth2.googleapis.com/token",
    userinfo: m ? `${m}/oauth2/v3/userinfo` : "https://openidconnect.googleapis.com/v1/userinfo",
    api: m ? `${m}/drive/v3` : "https://www.googleapis.com/drive/v3",
  };
};
const creds = () => ({ id: process.env.GOOGLE_CLIENT_ID?.trim(), secret: process.env.GOOGLE_CLIENT_SECRET?.trim() });

export const driveAvailable = () => Boolean(((creds().id && creds().secret) || mock()) && encryptionEnabled());
export const driveRedirectUri = () => `${getSiteUrl()}/api/conexiones/google-drive/callback`;

export function driveAuthUrl(state: string) {
  const u = new URL(urls().auth);
  u.searchParams.set("client_id", creds().id ?? "mock-client");
  u.searchParams.set("redirect_uri", driveRedirectUri());
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", DRIVE_SCOPES.join(" "));
  u.searchParams.set("access_type", "offline");
  u.searchParams.set("prompt", "consent");
  u.searchParams.set("state", state);
  return u.toString();
}

type DriveCreds = { access_token: string; refresh_token?: string; expires_at: string; email?: string };

async function tokenRequest(params: Record<string, string>) {
  const res = await fetch(urls().token, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: creds().id ?? "mock-client", client_secret: creds().secret ?? "mock-secret", ...params }),
  });
  if (!res.ok) throw new Error(`Google token ${res.status}`);
  return (await res.json()) as { access_token: string; refresh_token?: string; expires_in?: number };
}

export async function getDriveConnection(studioId: string) {
  const [c] = await getDb().select().from(connections).where(and(eq(connections.studio_id, studioId), eq(connections.connector, "google_drive")));
  return c ?? null;
}

export async function connectDrive(studioId: string, userId: string, code: string) {
  const t = await tokenRequest({ code, grant_type: "authorization_code", redirect_uri: driveRedirectUri() });
  const info = (await fetch(urls().userinfo, { headers: { authorization: `Bearer ${t.access_token}` } }).then((r) => (r.ok ? r.json() : {}))) as { email?: string };
  const current = await getDriveConnection(studioId);
  const prev = current ? readCredentials<DriveCreds>(current) : {};
  const c: DriveCreds = {
    access_token: t.access_token,
    refresh_token: t.refresh_token ?? prev.refresh_token,
    expires_at: new Date(Date.now() + (t.expires_in ?? 3600) * 1000).toISOString(),
    email: info.email,
  };
  const db = getDb();
  if (current) {
    await db.update(connections).set({ credentials_enc: sealCredentials(c), status: "activa", last_error: null, name: `Google Drive · ${info.email ?? ""}`.trim() }).where(eq(connections.id, current.id));
  } else {
    await db.insert(connections).values({ studio_id: studioId, connector: "google_drive", name: `Google Drive · ${info.email ?? ""}`.trim(), status: "activa", credentials_enc: sealCredentials(c), created_by: userId });
  }
  return info.email ?? null;
}

async function accessToken(conn: Connection) {
  const c = readCredentials<DriveCreds>(conn);
  if (!c.access_token) throw new Error("Drive no está conectado.");
  if (new Date(c.expires_at ?? 0).getTime() - 60000 > Date.now()) return c.access_token;
  if (!c.refresh_token) throw new Error("Google no entregó un refresh token: volvé a conectar Drive.");
  const t = await tokenRequest({ refresh_token: c.refresh_token, grant_type: "refresh_token" });
  const next = { ...c, access_token: t.access_token, expires_at: new Date(Date.now() + (t.expires_in ?? 3600) * 1000).toISOString() };
  await getDb().update(connections).set({ credentials_enc: sealCredentials(next) }).where(eq(connections.id, conn.id));
  return t.access_token;
}

async function api<T>(conn: Connection, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${urls().api}${path}`, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${await accessToken(conn)}` }, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`Drive respondió ${res.status} en ${path.split("?")[0]}`);
  return res.json() as Promise<T>;
}

async function createFolder(conn: Connection, name: string, parent?: string) {
  return api<{ id: string; name: string }>(conn, "/files?fields=id,name", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: FOLDER, ...(parent ? { parents: [parent] } : {}) }),
  });
}

/** Carpeta raíz del estudio y una carpeta por organización activa que todavía no la tenga */
export async function ensureFolders(conn: Connection, actorId: string) {
  const log = await startLog(conn.id, "sync", actorId);
  try {
    const db = getDb();
    let root = (conn.settings as { root_id?: string }).root_id;
    if (!root) {
      root = (await createFolder(conn, "Faro · Comprobantes de clientes")).id;
      await db.update(connections).set({ settings: { ...conn.settings, root_id: root } }).where(eq(connections.id, conn.id));
    }
    const [orgs, links] = await Promise.all([
      db.select({ id: organizations.id, name: organizations.name }).from(organizations).where(and(eq(organizations.studio_id, conn.studio_id), ne(organizations.status, "baja"))),
      db.select({ org: connection_links.organization_id }).from(connection_links).where(eq(connection_links.connection_id, conn.id)),
    ]);
    const have = new Set(links.map((l) => l.org));
    let created = 0;
    for (const o of orgs.filter((x) => !have.has(x.id))) {
      const f = await createFolder(conn, o.name, root);
      await db.insert(connection_links).values({ connection_id: conn.id, organization_id: o.id, external_id: f.id, external_name: f.name }).onConflictDoNothing();
      created++;
    }
    const message = created ? `Se crearon ${created} carpetas (una por organización).` : "Todas las organizaciones ya tienen su carpeta.";
    await endLog(log, conn.id, true, message, created);
    return { ok: true, message };
  } catch (error) {
    const message = (error as Error).message ?? "No se pudieron crear las carpetas.";
    await endLog(log, conn.id, false, message);
    return { ok: false, message };
  }
}

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  webViewLink?: string;
}

/** Trae los archivos nuevos de cada carpeta a los documentos de su organización */
export async function syncDrive(conn: Connection, actorId: string) {
  const log = await startLog(conn.id, "sync", actorId);
  const db = getDb();
  let imported = 0;
  const skipped: string[] = [];
  try {
    const links = await db
      .select({ link: connection_links, org: organizations.name })
      .from(connection_links)
      .innerJoin(organizations, and(eq(organizations.id, connection_links.organization_id), eq(organizations.studio_id, conn.studio_id)))
      .where(eq(connection_links.connection_id, conn.id));
    for (const { link } of links) {
      const q = encodeURIComponent(`'${link.external_id}' in parents and trashed = false and mimeType != '${FOLDER}'`);
      const { files = [] } = await api<{ files?: DriveFile[] }>(conn, `/files?q=${q}&fields=files(id,name,mimeType,size,modifiedTime,webViewLink)&pageSize=100`);
      if (!files.length) continue;
      const known = new Set(
        (
          await db
            .select({ id: documents.external_id })
            .from(documents)
            .where(and(eq(documents.organization_id, link.organization_id), eq(documents.external_source, "google_drive"), inArray(documents.external_id, files.map((f) => f.id))))
        ).map((d) => d.id),
      );
      const records = [];
      for (const f of files.filter((x) => !known.has(x.id))) {
        if (Number(f.size ?? 0) > MAX_BYTES) {
          skipped.push(`${f.name} (más de 10 MB)`);
          continue;
        }
        const res = await fetch(`${urls().api}/files/${encodeURIComponent(f.id)}?alt=media`, { headers: { Authorization: `Bearer ${await accessToken(conn)}` } });
        if (!res.ok) {
          skipped.push(`${f.name} (no se pudo bajar)`);
          continue;
        }
        const file = new File([await res.arrayBuffer()], f.name, { type: f.mimeType });
        const check = await checkUpload(file);
        if (!check.ok) {
          skipped.push(`${f.name} (${check.error})`);
          continue;
        }
        const stored = await storeUpload(file, conn.studio_id, link.organization_id);
        const [doc] = await db
          .insert(documents)
          .values({
            studio_id: conn.studio_id,
            organization_id: link.organization_id,
            name: stored.name,
            storage_path: stored.storagePath,
            mime_type: stored.mimeType,
            size_bytes: stored.sizeBytes,
            category: "comprobantes",
            source: "cliente",
            external_source: "google_drive",
            external_id: f.id,
          })
          .returning({ id: documents.id });
        records.push({ resource: "archivos", externalId: f.id, name: f.name, date: f.modifiedTime ?? null, raw: { ...f, document_id: doc.id }, organizationId: link.organization_id, validation: "sin_cruzar" as const });
        imported++;
      }
      await upsertExternal(conn, "google_drive", records);
    }
    const message = `${imported ? `Entraron ${imported} archivo${imported === 1 ? "" : "s"} nuevo${imported === 1 ? "" : "s"} a Documentos.` : "No hay archivos nuevos."}${skipped.length ? ` Salteados: ${skipped.slice(0, 5).join(", ")}.` : ""}`;
    await endLog(log, conn.id, true, message, imported);
    return { ok: true, message };
  } catch (error) {
    const message = (error as Error).message ?? "Error al sincronizar Drive.";
    await endLog(log, conn.id, false, message, imported);
    return { ok: false, message };
  }
}

export const folderUrl = (id: string) => (mock() ? `${mock()}/drive/folders/${id}` : `https://drive.google.com/drive/folders/${id}`);
