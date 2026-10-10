// Pruebas del servidor MCP de Faro con el cliente oficial del SDK:
// listar y llamar herramientas, token revocado y vencido, alcance limitado a
// una organización, solo lectura, sensibles a Aprobaciones y OAuth (token con PKCE).
//
//   node --env-file=.env.local scripts/pruebas/mcp.mjs

import { createHash, randomBytes } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import postgres from "postgres";
import { BASE, check, data, failures } from "./lib.mjs";

const sql = postgres(process.env.DATABASE_URL);
const d = data();
const sha = (t) => createHash("sha256").update(t).digest("hex");

async function access({ studio = d.studios.A, user = d.users.adminA, name, write = false, orgs = null, expires = null, revoked = false, modules = [] }) {
  const [a] = await sql`insert into mcp_accesses (studio_id, user_id, name, can_write, organization_ids, expires_at, revoked_at, modules)
    values (${studio}, ${user}, ${name}, ${write}, ${orgs}, ${expires}, ${revoked ? new Date() : null}, ${modules}) returning id`;
  const token = `faro_mcp_${randomBytes(32).toString("base64url")}`;
  await sql`insert into mcp_tokens (access_id, kind, token_hash) values (${a.id}, 'bearer', ${sha(token)})`;
  return { id: a.id, token };
}

async function connect(token) {
  const client = new Client({ name: "cliente-de-prueba", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${BASE}/api/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
  return client;
}
const parse = (r) => JSON.parse(r.content?.[0]?.text ?? "null");

await sql`delete from mcp_accesses where name like 'prueba-%'`;

// 1. Acceso completo de lectura
const full = await access({ name: "prueba-lectura" });
const c1 = await connect(full.token);
const tools = (await c1.listTools()).tools.map((t) => t.name);
check("lista herramientas de lectura", tools.includes("buscar_organizaciones") && tools.includes("listar_vencimientos"), `${tools.length} herramientas`);
check("solo lectura: no lista crear_solicitud ni responder_solicitud", !tools.includes("crear_solicitud") && !tools.includes("responder_solicitud"));
const orgs = parse(await c1.callTool({ name: "buscar_organizaciones", arguments: {} }));
const names = orgs.organizaciones.map((o) => o.nombre);
check("buscar_organizaciones devuelve las del estudio A", names.includes("Agencia Norte SRL") && names.includes("Consultora Sur SAS"));
check("aislamiento: no aparece la organización del estudio B", !names.includes("Empresa Ajena SA"));
const forced = await c1.callTool({ name: "ver_organizacion", arguments: { organizacion_id: d.orgs.ajena } });
check("forzar el ID de una organización de otro estudio se rechaza", forced.isError === true, forced.content[0].text);
const forcedDoc = await c1.callTool({ name: "leer_documento", arguments: { documento_id: d.documents.ajena } });
check("forzar el ID de un documento de otro estudio se rechaza", forcedDoc.isError === true);
const doc = parse(await c1.callTool({ name: "leer_documento", arguments: { documento_id: d.documents.norte } }));
check("leer_documento devuelve el texto del CSV", doc?.texto?.includes("Honorarios septiembre"));
const write = await c1.callTool({ name: "crear_solicitud", arguments: { organizacion_id: d.orgs.norte, asunto: "x", detalle: "yy" } });
check("solo lectura: llamar una de escritura se rechaza", write.isError === true, write.content[0].text);
await c1.close();

// 2. Revocado y vencido
for (const [label, opts] of [
  ["revocado", { name: "prueba-revocado", revoked: true }],
  ["vencido", { name: "prueba-vencido", expires: new Date(Date.now() - 1000) }],
]) {
  const a = await access(opts);
  const res = await fetch(`${BASE}/api/mcp`, {
    method: "POST",
    headers: { Authorization: `Bearer ${a.token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
  check(`token ${label} → 401`, res.status === 401, res.headers.get("www-authenticate")?.slice(0, 60));
}
const none = await fetch(`${BASE}/api/mcp`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
check("sin token → 401 con resource_metadata", none.status === 401 && /resource_metadata=/.test(none.headers.get("www-authenticate") ?? ""));

// 3. Limitado a una organización
const one = await access({ name: "prueba-una-org", orgs: [d.orgs.norte] });
const c3 = await connect(one.token);
const o3 = parse(await c3.callTool({ name: "buscar_organizaciones", arguments: {} })).organizaciones.map((o) => o.nombre);
check("alcance a una organización: buscar solo devuelve esa", o3.length === 1 && o3[0] === "Agencia Norte SRL", o3.join(", "));
const v3 = parse(await c3.callTool({ name: "listar_vencimientos", arguments: {} })).vencimientos;
check("alcance a una organización: vencimientos solo de esa", v3.length > 0 && v3.every((v) => v.organizacion === "Agencia Norte SRL"));
const s3 = await c3.callTool({ name: "ver_organizacion", arguments: { organizacion_id: d.orgs.sur } });
check("alcance a una organización: otra del mismo estudio se rechaza", s3.isError === true);
const l3 = await c3.callTool({ name: "listar_consultas", arguments: {} });
check("alcance a una organización: consultas comerciales del estudio no se ven", l3.isError === true);
await c3.close();

// 4. Escritura y sensible
const rw = await access({ name: "prueba-escritura", write: true });
const c4 = await connect(rw.token);
const created = parse(await c4.callTool({ name: "crear_solicitud", arguments: { organizacion_id: d.orgs.sur, asunto: "Desde MCP", detalle: "Prueba de escritura" } }));
check("escritura por MCP se ejecuta (crear_solicitud)", created?.creada === true);
const before = (await sql`select count(*)::int n from request_messages where request_id = ${d.requests.sur}`)[0].n;
const sens = await c4.callTool({ name: "responder_solicitud", arguments: { solicitud_id: d.requests.sur, mensaje: "Respuesta desde MCP" } });
const after = (await sql`select count(*)::int n from request_messages where request_id = ${d.requests.sur}`)[0].n;
const ap = sens.structuredContent?.aprobacion_id ? (await sql`select status, origin, mcp_access_id from approvals where id = ${sens.structuredContent.aprobacion_id}`)[0] : null;
check("sensible por MCP termina en Aprobaciones y no se ejecuta", ap?.status === "pendiente" && ap?.origin === "mcp" && before === after, sens.content[0].text.slice(0, 70));
await c4.close();

// 5. Log de llamadas
const calls = await sql`select tool, result from mcp_calls where access_id = ${one.id}`;
check("log de llamadas por acceso", calls.some((c) => c.result === "ok") && calls.some((c) => c.result === "denegado"), `${calls.length} llamadas`);

// 6. OAuth 2.1: metadata, registro, código con PKCE, token y rotación del refresh
const meta = await (await fetch(`${BASE}/.well-known/oauth-authorization-server`)).json();
const prm = await (await fetch(`${BASE}/.well-known/oauth-protected-resource/api/mcp`)).json();
check("metadata OAuth (RFC 8414 y 9728)", meta.code_challenge_methods_supported?.includes("S256") && prm.resource.endsWith("/api/mcp"));
const reg = await (await fetch(meta.registration_endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client_name: "Cliente OAuth de prueba", redirect_uris: ["http://localhost:8976/callback"] }) })).json();
check("registro dinámico de cliente", reg.client_id?.startsWith("faro_client_"));
const bad = await fetch(meta.registration_endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ redirect_uris: ["http://evil.example/cb"] }) });
check("registro rechaza redirect http no local", bad.status === 400);
// El consentimiento lo da una persona en /oauth/autorizar (se prueba en el navegador); acá se simula el código que emite
const verifier = randomBytes(32).toString("base64url");
const challenge = createHash("sha256").update(verifier).digest("base64url");
const oa = await access({ name: "prueba-oauth" });
await sql`update mcp_accesses set kind = 'oauth', oauth_client_id = ${reg.client_id} where id = ${oa.id}`;
const code = `faro_code_${randomBytes(32).toString("base64url")}`;
await sql`insert into mcp_tokens (access_id, kind, token_hash, data, expires_at) values (${oa.id}, 'code', ${sha(code)}, ${sql.json({ client_id: reg.client_id, redirect_uri: "http://localhost:8976/callback", code_challenge: challenge })}, now() + interval '10 minutes')`;
const form = (o) => ({ method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(o).toString() });
const wrong = await fetch(meta.token_endpoint, form({ grant_type: "authorization_code", code, client_id: reg.client_id, redirect_uri: "http://localhost:8976/callback", code_verifier: "x".repeat(43) }));
check("PKCE incorrecto se rechaza", wrong.status === 400);
const code2 = `faro_code_${randomBytes(32).toString("base64url")}`;
await sql`insert into mcp_tokens (access_id, kind, token_hash, data, expires_at) values (${oa.id}, 'code', ${sha(code2)}, ${sql.json({ client_id: reg.client_id, redirect_uri: "http://localhost:8976/callback", code_challenge: challenge })}, now() + interval '10 minutes')`;
const tok = await (await fetch(meta.token_endpoint, form({ grant_type: "authorization_code", code: code2, client_id: reg.client_id, redirect_uri: "http://localhost:8976/callback", code_verifier: verifier }))).json();
check("código + PKCE → access y refresh token", tok.access_token?.startsWith("faro_at_") && tok.refresh_token?.startsWith("faro_rt_"));
const reuse = await fetch(meta.token_endpoint, form({ grant_type: "authorization_code", code: code2, client_id: reg.client_id, redirect_uri: "http://localhost:8976/callback", code_verifier: verifier }));
check("el código no se puede usar dos veces", reuse.status === 400);
const c6 = await connect(tok.access_token);
check("el access token de OAuth abre el MCP", (await c6.listTools()).tools.length > 0);
await c6.close();
const ref = await (await fetch(meta.token_endpoint, form({ grant_type: "refresh_token", refresh_token: tok.refresh_token, client_id: reg.client_id }))).json();
check("refresh token rota", ref.access_token && ref.refresh_token !== tok.refresh_token);
const oldRef = await fetch(meta.token_endpoint, form({ grant_type: "refresh_token", refresh_token: tok.refresh_token, client_id: reg.client_id }));
check("el refresh viejo ya no sirve", oldRef.status === 400);
await sql`update mcp_accesses set revoked_at = now() where id = ${oa.id}`;
const afterRevoke = await fetch(`${BASE}/api/mcp`, { method: "POST", headers: { Authorization: `Bearer ${ref.access_token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
check("revocar el acceso corta los tokens de OAuth", afterRevoke.status === 401);

console.log(failures ? `\n${failures} prueba(s) fallaron` : "\nTodo OK");
await sql.end();
process.exit(failures ? 1 : 0);
