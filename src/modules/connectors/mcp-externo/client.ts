import "server-only";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { readCredentials, type Connection } from "../store";

// Faro como cliente MCP de un servidor remoto (Streamable HTTP). La URL y la
// autenticación se guardan cifradas en la conexión.

export type ToolPermission = "off" | "lectura" | "escritura";

export interface RemoteTool {
  name: string;
  title?: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  readOnly: boolean;
  permission: ToolPermission;
}

export interface McpExternoSettings {
  prefix?: string;
  tools?: RemoteTool[];
  server?: { name?: string; version?: string };
  listed_at?: string;
}

export const settingsOf = (c: Connection) => c.settings as McpExternoSettings;

/** Prefijo de las herramientas en el Asistente: letras, números y guion bajo */
export const cleanPrefix = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24) || "mcp";

export function assistantToolName(prefix: string, tool: string) {
  return `${prefix}__${tool.replace(/[^a-zA-Z0-9_-]/g, "_")}`.slice(0, 64);
}

export async function withRemote<T>(conn: Connection, fn: (client: Client) => Promise<T>): Promise<T> {
  const creds = readCredentials<{ url: string; auth_header?: string; auth_value?: string }>(conn);
  if (!creds.url) throw new Error("La conexión no tiene URL.");
  const headers: Record<string, string> = {};
  if (creds.auth_value) headers[creds.auth_header?.trim() || "Authorization"] = creds.auth_value;
  const client = new Client({ name: "faro", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(creds.url), { requestInit: { headers, signal: AbortSignal.timeout(30000) } });
  await client.connect(transport);
  try {
    return await fn(client);
  } finally {
    await client.close().catch(() => undefined);
  }
}

/** Lista las herramientas del servidor y conserva los permisos ya elegidos (por defecto: solo las de lectura, habilitadas) */
export async function listRemoteTools(conn: Connection) {
  const previous = new Map((settingsOf(conn).tools ?? []).map((t) => [t.name, t.permission]));
  return withRemote(conn, async (client) => {
    const { tools } = await client.listTools();
    const info = client.getServerVersion();
    const out: RemoteTool[] = tools.slice(0, 100).map((t) => {
      const readOnly = t.annotations?.readOnlyHint === true;
      return {
        name: t.name,
        title: t.title ?? t.annotations?.title,
        description: t.description?.slice(0, 1000),
        inputSchema: t.inputSchema as Record<string, unknown>,
        readOnly,
        permission: previous.get(t.name) ?? (readOnly ? "lectura" : "off"),
      };
    });
    return { tools: out, server: { name: info?.name, version: info?.version } };
  });
}

export async function callRemoteTool(conn: Connection, name: string, args: unknown) {
  return withRemote(conn, (client) => client.callTool({ name, arguments: (args ?? {}) as Record<string, unknown> }));
}
