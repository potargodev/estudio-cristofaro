// Pruebas del hub de Conexiones contra los mocks (solo desarrollo):
//   node mocks/xubio/server.mjs & node mocks/google/server.mjs & (cd connector && node mock/server.mjs) &
//   npx tsx --conditions=react-server --env-file=.env.local scripts/pruebas/conexiones.mts
// Necesita el servidor de Faro en :3000 (para MCP externo y Tango) y XUBIO_API_URL / GOOGLE_API_MOCK_URL apuntando a los mocks.

import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { getDb } from "../../src/db";
import { connections, documents, external_records, integrations, mcp_accesses, mcp_tokens, tango_records } from "../../src/db/schema";
import { encrypt } from "../../src/lib/crypto";
import { parseExport } from "../../src/modules/connectors/archivos/parse";
import { getTemplate } from "../../src/modules/connectors/archivos/templates";
import { connectDrive, ensureFolders, getDriveConnection, syncDrive } from "../../src/modules/connectors/google-drive/drive";
import { listRemoteTools } from "../../src/modules/connectors/mcp-externo/client";
import { externalAssistantTools } from "../../src/modules/connectors/mcp-externo/tools";
import { hubEntries } from "../../src/modules/connectors/registry";
import { connectionOfStudio, upsertExternal } from "../../src/modules/connectors/store";
import { syncXubio, testXubio } from "../../src/modules/connectors/xubio/sync";
import { executeTool, type ToolContext } from "../../src/modules/tools";
import { check, data, failures } from "./lib.mjs";

const d = data();
const db = getDb();
const XUBIO = process.env.XUBIO_API_URL!;
const ctxOf = (studioId: string, userId: string, email: string, role: "dueno" | "contador" = "dueno"): ToolContext => ({
  studioId,
  actor: { id: userId, email, name: email, role },
  origin: "asistente",
  organizationIds: null,
  modules: null,
  canWrite: true,
});
const ctxA = ctxOf(d.studios.A, d.users.adminA, "admin@estudiocristofaro.com");
const ctxB = ctxOf(d.studios.B, d.users.adminB, "admin@prueba-b.com");

await db.delete(connections).where(eq(connections.studio_id, d.studios.A));
await db.delete(connections).where(eq(connections.studio_id, d.studios.B));
await db.delete(documents).where(and(eq(documents.studio_id, d.studios.A), eq(documents.external_source, "google_drive")));

async function newConn(values: Partial<typeof connections.$inferInsert> & { connector: string; name: string }, studioId = d.studios.A) {
  const [c] = await db.insert(connections).values({ studio_id: studioId, ...values }).returning();
  return c;
}

// ───────────── Xubio ─────────────
console.log("\n— Xubio (mock) —");
const xs = await newConn({ connector: "xubio", name: "Xubio del estudio", credentials_enc: encrypt(JSON.stringify({ client_id: "mock-client", client_secret: "mock-secret" })) });
const t1 = await testXubio(xs, d.users.adminA);
check("prueba de conexión (TokenEndpoint + /miempresa)", t1.ok, t1.message);
const s1 = await syncXubio((await connectionOfStudio(xs.id, d.studios.A))!, d.users.adminA, 90);
check("sincronización", s1.ok, s1.message);
const recs = await db.select().from(external_records).where(eq(external_records.connection_id, xs.id));
const by = (res: string) => recs.filter((r) => r.resource === res);
check("clientes, ventas (90 días), compras y asientos", by("clientes").length === 3 && by("comprobantes_venta").length === 3 && by("comprobantes_compra").length === 1 && by("asientos").length === 1, `${recs.length} registros`);
const norteCli = by("clientes").find((r) => r.cuit === "30711111119");
const surCli = by("clientes").find((r) => r.cuit === "30722222229");
check("cruce por CUIT: Agencia Norte → su organización", norteCli?.organization_id === d.orgs.norte && norteCli?.validation_status === "cruzado");
check("cruce por CUIT con el campo CUIT en mayúsculas (Consultora Sur)", surCli?.organization_id === d.orgs.sur);
check("cliente sin razón social queda sin cruzar", by("clientes").some((r) => r.cuit === "30799999990" && !r.organization_id && r.validation_status === "sin_cruzar"));
check("las ventas heredan la organización de su cliente", by("comprobantes_venta").filter((r) => r.organization_id === d.orgs.norte).length === 2);
check("guardan fuente, fecha de sincronización, ID externo y registro original", recs.every((r) => r.source === "xubio" && r.synced_at && r.external_id && r.raw));
const before = (await (await fetch(`${XUBIO}/__stats`)).json()) as { issued: number };
await fetch(`${XUBIO}/__expire`, { method: "POST" });
const s2 = await syncXubio((await connectionOfStudio(xs.id, d.studios.A))!, d.users.adminA, 90);
const after = (await (await fetch(`${XUBIO}/__stats`)).json()) as { issued: number };
check("token muerto → se renueva solo y la sincronización sigue", s2.ok && after.issued > before.issued, `tokens emitidos ${before.issued} → ${after.issued}`);
const again = await db.select().from(external_records).where(eq(external_records.connection_id, xs.id));
check("re-sincronizar no duplica", again.length === recs.length);
const bad = await newConn({ connector: "xubio", name: "Xubio mal", credentials_enc: encrypt(JSON.stringify({ client_id: "mock-client", client_secret: "otra" })) });
const t3 = await testXubio(bad, d.users.adminA);
check("credenciales incorrectas → mensaje claro", !t3.ok && /rechazó/.test(t3.message), t3.message);
const xo = await newConn({ connector: "xubio", name: "Xubio · Agencia Norte", organization_id: d.orgs.norte, credentials_enc: encrypt(JSON.stringify({ client_id: "mock-org", client_secret: "mock-org-secret" })) });
await syncXubio(xo, d.users.adminA, 90);
const orgRecs = await db.select().from(external_records).where(eq(external_records.connection_id, xo.id));
check("cuenta propia de una organización: todo queda en esa organización", orgRecs.length > 0 && orgRecs.every((r) => r.organization_id === d.orgs.norte));
check("cuenta propia: la CUIT de Mi empresa valida la razón social", orgRecs.filter((r) => r.resource !== "clientes").every((r) => r.validation_status === "validado"));

const toolA = await executeTool("listar_registros_externos", { fuente: "xubio", recurso: "comprobantes_venta" }, ctxA);
check("herramienta de lectura en el registro (estudio A)", toolA.status === "ok" && (toolA.result as { total: number }).total >= 3);
const toolB = await executeTool("listar_registros_externos", { fuente: "xubio" }, ctxB);
check("aislamiento: el estudio B no ve los registros del A", toolB.status === "ok" && (toolB.result as { total: number }).total === 0);
const forced = await executeTool("resumen_comprobantes", { organizacion_id: d.orgs.norte }, ctxB);
check("aislamiento: el estudio B forzando el ID de una organización del A se rechaza", forced.status === "denegado");
const res = await executeTool("resumen_comprobantes", { organizacion_id: d.orgs.norte }, ctxA);
check("resumen de comprobantes por organización", res.status === "ok" && JSON.stringify(res.result).includes("comprobantes_venta"));
const hiddenB = await connectionOfStudio(xs.id, d.studios.B);
check("aislamiento: la conexión del A no se encuentra desde el B", hiddenB === null);

// ───────────── Archivos ─────────────
console.log("\n— Archivos —");
const csv = "Código;Razón Social;C.U.I.T.\n001;Agencia Norte SRL;30-71111111-9\n002;Otra Empresa;20-11111111-2\n003;Sin CUIT;\n";
const parsed = await parseExport(new File([csv], "clientes-holistor.csv"), getTemplate("holistor_clientes")!, {});
check("plantilla Holistor: encabezados con tildes y ; como separador", parsed.rows.length === 3 && parsed.columns.cuit === "C.U.I.T.", JSON.stringify(parsed.columns));
const fc = await newConn({ connector: "archivos", name: "Holistor", status: "activa" });
await upsertExternal(fc, "holistor", parsed.rows);
const fr = await db.select().from(external_records).where(eq(external_records.connection_id, fc.id));
check("importación cruza por CUIT", fr.some((r) => r.cuit === "30711111119" && r.organization_id === d.orgs.norte) && fr.some((r) => r.external_id === "002" && !r.organization_id));
check("guarda archivo y fila de origen", (fr[0].raw as Record<string, unknown>)._archivo === "clientes-holistor.csv");

// ───────────── MCP externo (contra el propio servidor MCP de Faro) ─────────────
console.log("\n— MCP externo —");
const [acc] = await db.insert(mcp_accesses).values({ studio_id: d.studios.A, user_id: d.users.adminA, name: "prueba-externo", can_write: true }).returning();
const token = `faro_mcp_${randomBytes(32).toString("base64url")}`;
await db.insert(mcp_tokens).values({ access_id: acc.id, kind: "bearer", token_hash: createHash("sha256").update(token).digest("hex") });
const mx = await newConn({ connector: "mcp_externo", name: "Faro espejo", status: "activa", settings: { prefix: "espejo" }, credentials_enc: encrypt(JSON.stringify({ url: "http://localhost:3000/api/mcp", auth_header: "Authorization", auth_value: `Bearer ${token}` })) });
const listed = await listRemoteTools(mx);
check("lista las herramientas del servidor remoto", listed.tools.length > 5, `${listed.tools.length} herramientas`);
check("por defecto: lectura habilitada, escritura desactivada", listed.tools.find((t) => t.name === "buscar_organizaciones")?.permission === "lectura" && listed.tools.find((t) => t.name === "crear_solicitud")?.permission === "off");
await db.update(connections).set({ settings: { prefix: "espejo", tools: listed.tools } }).where(eq(connections.id, mx.id));
const ext = await externalAssistantTools(ctxA);
check("se suman al Asistente con el prefijo del conector", "espejo__buscar_organizaciones" in ext && !("espejo__crear_solicitud" in ext));
const extOut = await (ext["espejo__buscar_organizaciones"] as { execute: (i: unknown, o: unknown) => Promise<{ texto?: string }> }).execute({}, { toolCallId: "t", messages: [] });
check("ejecutar una herramienta externa de lectura", typeof extOut.texto === "string" && extOut.texto.includes("Agencia Norte"));
check("el estudio B no ve los servidores MCP del A", Object.keys(await externalAssistantTools(ctxB)).length === 0);

// ───────────── Google Drive (mock) ─────────────
console.log("\n— Google Drive (mock) —");
await connectDrive(d.studios.A, d.users.adminA, "mock-code");
const drive = (await getDriveConnection(d.studios.A))!;
const f1 = await ensureFolders(drive, d.users.adminA);
check("crea una carpeta por organización", f1.ok, f1.message);
const links = await db.query.connection_links.findMany({ where: (l, { eq }) => eq(l.connection_id, drive.id) });
const norteFolder = links.find((l) => l.organization_id === d.orgs.norte)!;
check("carpetas mapeadas a organizaciones", links.length >= 2 && Boolean(norteFolder));
const pdf = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");
await fetch(`${process.env.GOOGLE_API_MOCK_URL}/__upload?folder=${norteFolder.external_id}&name=factura-octubre.pdf`, { method: "POST", body: pdf });
const sy = await syncDrive((await getDriveConnection(d.studios.A))!, d.users.adminA);
const got = await db.select().from(documents).where(and(eq(documents.organization_id, d.orgs.norte), eq(documents.external_source, "google_drive")));
check("el archivo del cliente entra a Documentos de su organización", sy.ok && got.length === 1 && got[0].source === "cliente" && got[0].reviewed_at === null, sy.message);
await syncDrive((await getDriveConnection(d.studios.A))!, d.users.adminA);
const got2 = await db.select().from(documents).where(and(eq(documents.organization_id, d.orgs.norte), eq(documents.external_source, "google_drive")));
check("sincronizar de nuevo no duplica", got2.length === 1);

// ───────────── Tango con el simulador, dentro del hub ─────────────
console.log("\n— Tango (simulador) —");
const key = `ectango_${randomBytes(32).toString("base64url")}`;
await db.delete(integrations).where(and(eq(integrations.studio_id, d.studios.A), eq(integrations.type, "tango")));
await db.insert(integrations).values({ studio_id: d.studios.A, type: "tango", connector_key_hash: createHash("sha256").update(key).digest("hex"), key_prefix: key.slice(0, 14), key_created_at: new Date() });
const dir = mkdtempSync(path.join(tmpdir(), "tango-"));
writeFileSync(
  path.join(dir, "config.json"),
  JSON.stringify({ tangoUrl: "http://localhost:17000", apiAuthorization: "11111111-2222-3333-4444-555555555555", companies: [{ id: 1, name: "Empresa 1" }], platformUrl: "http://localhost:3000", connectorKey: key, pageSize: 50, intervalMinutes: 60, logFile: path.join(dir, "log.txt") }),
);
const out = execFileSync("node", ["connector/index.mjs", "sync", "--config", path.join(dir, "config.json")], { cwd: path.resolve(import.meta.dirname, "../.."), encoding: "utf8" });
const tr = await db.select().from(tango_records).where(eq(tango_records.studio_id, d.studios.A));
check("el conector local sincroniza contra el simulador", tr.length > 0, `${tr.length} clientes · ${out.trim().split("\n").at(-1)}`);
const hub = await hubEntries(d.studios.A);
const tangoHub = hub.find((h) => h.def.key === "tango")!;
check("Tango aparece conectado en el hub con sus registros", tangoHub.state === "conectada" && tangoHub.records === tr.length);
const xubioHub = hub.find((h) => h.def.key === "xubio")!;
check("Xubio en el hub (con la cuenta mal configurada marca error)", xubioHub.accounts === 3 && xubioHub.records > 0, xubioHub.state);
const hubB = await hubEntries(d.studios.B);
check("aislamiento del hub: el estudio B no tiene conexiones", hubB.every((h) => h.state === "sin_configurar"));

console.log(failures ? `\n${failures} prueba(s) fallaron` : "\nTodo OK");
process.exit(failures ? 1 : 0);
