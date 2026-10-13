// §2.p · B9 API pública /api/v1: tokens con permisos, 401/403/429,
// Idempotency-Key, borrador sin el interruptor y emisión con él, webhooks
// firmados con reintentos, /estado, OpenAPI y aislamiento forzando IDs.
//
//   node --conditions=react-server --env-file=.env.local --import tsx scripts/pruebas/api-v1.mts
//   (ALLOW_PRIVATE_URLS=true para mandar los webhooks a un receptor local)

import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import postgres from "postgres";

const d = JSON.parse(readFileSync(new URL("./.salida.json", import.meta.url), "utf8"));
const sql = postgres(process.env.DATABASE_URL!, { onnotice: () => {} });
let fails = 0;
const check = (l: string, ok: boolean, x = "") => {
  if (!ok) fails++;
  console.log(`${ok ? "✔" : "✘"} ${l}${x ? ` · ${x}` : ""}`);
};
const throws = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
    return null;
  } catch (e) {
    return (e as Error).message || "error";
  }
};

const api = await import("../../src/modules/api/server.ts");
const wh = await import("../../src/modules/api/webhooks.ts");
const { verifyWebhook } = await import("../../src/modules/api/core.ts");
const arca = await import("../../src/modules/arca/server.ts");
const { scopeOf } = await import("../../src/modules/arca/queue.ts");
const orgsRoute = await import("../../src/app/api/v1/organizaciones/route.ts");
const invRoute = await import("../../src/app/api/v1/comprobantes/route.ts");
const invOne = await import("../../src/app/api/v1/comprobantes/[id]/route.ts");
const estado = await import("../../src/app/api/v1/estado/route.ts");
const spec = await import("../../src/app/api/v1/openapi.json/route.ts");
const docs = await import("../../src/app/api/v1/docs/route.ts");
const { signupPlan } = await import("../../src/lib/faro/plans.ts");
const MOCK = (process.env.ARCA_WSFE_URL ?? "http://localhost:4060/wsfev1/service.asmx").replace(/\/wsfev1.*$/, "");
await fetch(`${MOCK}/__fuera?on=0`, { method: "POST" });

const A = d.studios.A as string;
const B = d.studios.B as string;
const actorA = { id: d.users.adminA, email: "a@ejemplo.com", name: "Admin A", role: "dueno" };
const actorB = { id: d.users.adminB, email: "b@ejemplo.com", name: "Admin B", role: "dueno" };
const cuitOf = (base: string) => {
  const w = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const s = w.reduce((t, x, i) => t + x * Number(base[i]), 0);
  const r = 11 - (s % 11);
  return `${base}${r === 11 ? 0 : r === 10 ? 9 : r}`;
};

// ─── Organización monotributista con CUIT ───
await sql`insert into tenant_modules (studio_id, module_key, enabled) values (${A}, 'arca', true) on conflict (studio_id, module_key) do update set enabled = true, expires_at = null`;
await sql`delete from organizations where studio_id = ${A} and name = 'API B9 SA'`;
const C = cuitOf("2088877766");
await sql`delete from legal_entities where studio_id = ${A} and cuit = ${C}`;
const [o] = await sql`insert into organizations (studio_id, name, status) values (${A}, 'API B9 SA', 'activa') returning id`;
await sql`insert into legal_entities (studio_id, organization_id, cuit, business_name, regime) values (${A}, ${o.id}, ${C}, 'API B9 SA', 'monotributo')`;
await fetch(`${MOCK}/__delegar?cuit=${C}`, { method: "POST" });
await arca.saveSettings(await scopeOf({ studio_id: A, organization_id: o.id, cuit: C }), { businessName: "API B9 SA", ivaCondition: "monotributo" }, actorA);
await sql`delete from automation_switches where studio_id = ${A} and action = 'facturacion.api'`;
await sql`delete from webhook_endpoints where studio_id in ${sql([A, B])}`;
await sql`delete from api_tokens where studio_id in ${sql([A, B])}`;

const req = (path: string, token: string | null, init: RequestInit & { key?: string } = {}) =>
  new Request(`http://localhost/api/v1${path}`, { ...init, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.key ? { "Idempotency-Key": init.key } : {}), ...(init.body ? { "Content-Type": "application/json" } : {}) } });
const json = async (r: Response) => ({ status: r.status, body: (await r.json()) as Record<string, unknown> & { data?: unknown; error?: { codigo: string } }, headers: r.headers });

// ─── Tokens ───
check("un token sin permisos no se crea", /al menos un permiso/.test((await throws(() => api.createApiToken(A, actorA, { name: "Nada", scopes: ["inventado"] }))) ?? ""));
const full = await api.createApiToken(A, actorA, { name: "Sistema propio", scopes: ["organizaciones:leer", "comprobantes:leer", "comprobantes:emitir", "buzon:leer"] });
check("el token se guarda con hash, no en texto", !(await sql`select 1 from api_tokens where token_hash = ${full.token}`).length && full.token.startsWith("faro_api_"));
const readOnly = await api.createApiToken(A, actorA, { name: "Solo lectura", scopes: ["comprobantes:leer"], organizationId: o.id });

check("sin token: 401", (await orgsRoute.GET(req("/organizaciones", null))).status === 401);
check("token inventado: 401", (await orgsRoute.GET(req("/organizaciones", "faro_api_inventadoinventadoinventado"))).status === 401);
const orgs = await json(await orgsRoute.GET(req("/organizaciones", full.token)));
check("organizaciones del tenant", orgs.status === 200 && (orgs.body.data as { id: string }[]).some((x) => x.id === o.id));
check("sin el permiso: 403", (await orgsRoute.GET(req("/organizaciones", readOnly.token))).status === 403);

// ─── Crear comprobantes: Idempotency-Key, borrador y emisión con el interruptor ───
const body = JSON.stringify({ organizacion_id: o.id, cliente: { nombre: "Cliente API" }, items: [{ descripcion: "Servicio por API", cantidad: 1, precio: 15000 }], emitir: true });
check("sin Idempotency-Key: 400", (await invRoute.POST(req("/comprobantes", full.token, { method: "POST", body }))).status === 400);
check("cuerpo inválido: 400 con el detalle", (await json(await invRoute.POST(req("/comprobantes", full.token, { method: "POST", body: '{"items":[]}', key: "clave-invalida-1" })))).status === 400);
const c1 = await json(await invRoute.POST(req("/comprobantes", full.token, { method: "POST", body, key: "pedido-0001" })));
const inv1 = c1.body.data as { id: string; estado: string; total: number };
check("emitir sin el interruptor: queda en borrador con el aviso", c1.status === 201 && inv1.estado === "borrador" && /interruptor|automáticamente/.test(String(c1.body.aviso)), JSON.stringify(c1.body).slice(0, 200));
const c1b = await json(await invRoute.POST(req("/comprobantes", full.token, { method: "POST", body, key: "pedido-0001" })));
check("el mismo pedido con la misma clave: misma respuesta, sin otro comprobante", (c1b.body.data as { id: string }).id === inv1.id && c1b.headers.get("idempotent-replayed") === "true" && (await sql`select count(*)::int n from invoices where organization_id = ${o.id}`)[0].n === 1);
check("la misma clave con otro pedido: 422", (await invRoute.POST(req("/comprobantes", full.token, { method: "POST", body: body.replace("15000", "16000"), key: "pedido-0001" }))).status === 422);
await sql`insert into automation_switches (studio_id, organization_id, action, enabled, paused, set_by) values (${A}, ${o.id}, 'facturacion.api', true, false, ${actorA.id})`;

// Webhooks: receptor local que verifica la firma
const got: { event: string; ok: boolean; body: string }[] = [];
let failing = false;
const srv = createServer((rq, rs) => {
  let b = "";
  rq.on("data", (c) => (b += c));
  rq.on("end", () => {
    got.push({ event: String(rq.headers["x-faro-event"]), ok: verifyWebhook(secret, b, String(rq.headers["x-faro-signature"])), body: b });
    rs.statusCode = failing ? 500 : 200;
    rs.end("ok");
  });
});
await new Promise<void>((r) => srv.listen(0, "127.0.0.1", () => r()));
const port = (srv.address() as { port: number }).port;
check("webhook sin eventos: no se crea", (await throws(() => wh.createEndpoint(A, actorA, { url: `http://127.0.0.1:${port}/hook`, events: ["nada"] }))) !== null);
const ep = await wh.createEndpoint(A, actorA, { url: `http://127.0.0.1:${port}/hook`, events: ["factura.emitida"] });
const secret = ep.secret;
check("el secreto del webhook se guarda cifrado", !String((await sql`select secret_enc from webhook_endpoints where id = ${ep.row.id}`)[0].secret_enc).includes(secret));

const c2 = await json(await invRoute.POST(req("/comprobantes", full.token, { method: "POST", body: body.replace("Cliente API", "Cliente API 2"), key: "pedido-0002" })));
const inv2 = c2.body.data as { id: string; estado: string; cae: string | null };
check("con el interruptor «Facturar automáticamente lo que llega por la API»: autorizada con CAE", c2.status === 201 && inv2.estado === "autorizada" && !!inv2.cae, inv2.estado);
check("queda en la auditoría", (await sql`select 1 from audit_log where action = 'api.comprobante' and entity_id = ${inv2.id}`).length === 1);
await wh.deliverWebhooks();
const h1 = got.find((g) => g.event === "factura.emitida" && JSON.parse(g.body).datos.factura_id === inv2.id);
check("webhook factura.emitida entregado y con firma válida", !!h1 && h1.ok);
await wh.deliverWebhooks();
check("una vez por evento: no se repite", got.filter((g) => g.event === "factura.emitida" && JSON.parse(g.body).datos.factura_id === inv2.id).length === 1);
failing = true;
check("probar con el destino caído: queda para reintentar", (await wh.sendTest(A, actorA, ep.row.id)) === "pendiente");
const [retry] = await sql`select attempts, next_attempt_at > now() as later, last_status from webhook_deliveries where endpoint_id = ${ep.row.id} and event = 'prueba'`;
check("reintento programado con espera", retry.attempts === 1 && retry.later && retry.last_status === 500);
failing = false;
check("un webhook a la red interna no se acepta (sin ALLOW_PRIVATE_URLS)", await (async () => {
  const prev = process.env.ALLOW_PRIVATE_URLS;
  process.env.ALLOW_PRIVATE_URLS = "false";
  const r = await throws(() => wh.createEndpoint(A, actorA, { url: "https://10.0.0.5/hook", events: ["factura.emitida"] }));
  process.env.ALLOW_PRIVATE_URLS = prev;
  return r !== null;
})());

// ─── Leer ───
const list = await json(await invRoute.GET(req(`/comprobantes?organizacion_id=${o.id}`, readOnly.token)));
check("listar comprobantes con un token de solo lectura de esa organización", list.status === 200 && (list.body.data as unknown[]).length === 2);
const one = await json(await invOne.GET(req(`/comprobantes/${inv2.id}`, readOnly.token), { params: Promise.resolve({ id: inv2.id }) }));
check("un comprobante", one.status === 200 && (one.body.data as { cae: string }).cae === inv2.cae);
check("el token de solo lectura no crea", (await invRoute.POST(req("/comprobantes", readOnly.token, { method: "POST", body, key: "pedido-0003" }))).status === 403);

// ─── Límite por minuto ───
await sql`update api_tokens set rate_per_minute = 2 where id = ${readOnly.row.id}`;
const statuses = [];
for (let i = 0; i < 3; i++) statuses.push((await invRoute.GET(req("/comprobantes", readOnly.token))).status);
check("pasado el límite por minuto: 429 con Retry-After", statuses.includes(429), statuses.join(","));
await sql`update api_tokens set rate_per_minute = 120 where id = ${readOnly.row.id}`;

// ─── Aislamiento forzando IDs ───
const tB = await api.createApiToken(B, actorB, { name: "Otro estudio", scopes: ["organizaciones:leer", "comprobantes:leer", "comprobantes:emitir"] });
check("otro estudio no ve un comprobante ajeno por su ID", (await invOne.GET(req(`/comprobantes/${inv2.id}`, tB.token), { params: Promise.resolve({ id: inv2.id }) })).status === 404);
check("otro estudio no factura en una organización ajena", (await invRoute.POST(req("/comprobantes", tB.token, { method: "POST", body, key: "pedido-ajeno-1" }))).status === 404);
check("otro estudio no lista organizaciones ajenas", !((await json(await orgsRoute.GET(req("/organizaciones", tB.token)))).body.data as { id: string }[]).some((x) => x.id === o.id));
check("un token de una organización no ve otras", (await invRoute.GET(req(`/comprobantes?organizacion_id=${d.orgs.sur}`, readOnly.token))).status === 404);
check("otro estudio no revoca un token ajeno", (await api.revokeApiToken(B, actorB, full.row.id)) === false);
check("otro estudio no toca un webhook ajeno", await (async () => {
  await wh.setEndpoint(B, actorB, ep.row.id, "borrar");
  return (await sql`select 1 from webhook_endpoints where id = ${ep.row.id}`).length === 1;
})());
await api.revokeApiToken(A, actorA, full.row.id);
check("token revocado: 401", (await orgsRoute.GET(req("/organizaciones", full.token))).status === 401);

// ─── Estado, OpenAPI y documentación ───
const st = await json(await estado.GET());
check("/api/v1/estado sin token, con ARCA y la cola", st.status === 200 && "arca" in st.body && "cola_de_emision" in st.body);
const sp = (await (await spec.GET()).json()) as { openapi: string; paths: Record<string, unknown>; webhooks: Record<string, unknown> };
check("OpenAPI 3.1 con las rutas y los webhooks", sp.openapi === "3.1.0" && "/comprobantes" in sp.paths && "factura.emitida" in sp.webhooks);
const html = await (await docs.GET()).text();
check("documentación en /api/v1/docs", /API de Faro/.test(html) && /Idempotency-Key/.test(html));

// ─── Prueba gratis sin tarjeta ───
check("registrarse desde Profesional arranca su prueba; desde un plan de otro tipo, el gratis", signupPlan("studio", "profesional").key === "profesional" && signupPlan("studio", "autonomo_pro").key === "inicial" && signupPlan("studio", null).key === "inicial", signupPlan("studio", "profesional").key);

srv.close();
await sql`delete from automation_switches where studio_id = ${A} and action = 'facturacion.api'`;
await sql.end();
console.log(fails ? `\n${fails} fallas` : "\nTodo en verde");
process.exit(fails ? 1 : 0);
