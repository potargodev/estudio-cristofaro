// §2.p · B6 el Vigía por WhatsApp: facturar por texto y por audio (borrador
// + «SÍ», o directo con el interruptor), descartar con «NO», ARCA caído,
// gasto con la foto del ticket → rendición, consultas, BAJA y ALTA de los
// avisos, permisos del rol, mensajes que siguen al estudio y aislamiento
// forzando IDs.
//
//   node --conditions=react-server --env-file=.env.local --import tsx scripts/pruebas/whatsapp-vigia.mts
//   (con los simuladores de WhatsApp en WHATSAPP_API_URL, ARCA y OpenAI en 4010)

import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import postgres from "postgres";

const d = JSON.parse(readFileSync(new URL("./.salida.json", import.meta.url), "utf8"));
const sql = postgres(process.env.DATABASE_URL!, { onnotice: () => {} });
let fails = 0;
const check = (l: string, ok: boolean, x = "") => {
  if (!ok) fails++;
  console.log(`${ok ? "✔" : "✘"} ${l}${x ? ` · ${x}` : ""}`);
};

const { handleWebhook, saveAccount } = await import("../../src/modules/whatsapp/server.ts");
const arca = await import("../../src/modules/arca/server.ts");
const { scopeOf } = await import("../../src/modules/arca/queue.ts");
const { savePlatformAi } = await import("../../src/modules/copilot/platform.ts");
const WA = process.env.WHATSAPP_API_URL ?? "http://localhost:4090";
const MOCK = (process.env.ARCA_WSFE_URL ?? "http://localhost:4060/wsfev1/service.asmx").replace(/\/wsfev1.*$/, "");
const OPENAI = process.env.MOCK_OPENAI_URL ?? "http://localhost:4010/v1";
await fetch(`${MOCK}/__fuera?on=0`, { method: "POST" });

const A = d.studios.A as string;
const B = d.studios.B as string;
const actorA = { id: d.users.adminA, email: "a@ejemplo.com", name: "Admin A", role: "dueno" };
const cuitOf = (base: string) => {
  const w = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const s = w.reduce((t, x, i) => t + x * Number(base[i]), 0);
  const v = 11 - (s % 11);
  return `${base}${v === 11 ? 0 : v === 10 ? 9 : v}`;
};

// ─── Datos: organización monotributista con su CUIT, dos miembros con WhatsApp verificado ───
for (const m of ["arca", "whatsapp", "smart_docs"]) await sql`insert into tenant_modules (studio_id, module_key, enabled) values (${A}, ${m}, true) on conflict (studio_id, module_key) do update set enabled = true, expires_at = null`;
await sql`delete from organizations where studio_id = ${A} and name = 'Vigía WhatsApp SA'`;
await sql`delete from users where email in ('wa-duena@ejemplo.com', 'wa-consulta@ejemplo.com')`;
const cuit = cuitOf("2077766655");
await sql`delete from legal_entities where studio_id = ${A} and cuit = ${cuit}`;
const [o] = await sql`insert into organizations (studio_id, name, status) values (${A}, 'Vigía WhatsApp SA', 'activa') returning id`;
await sql`insert into legal_entities (studio_id, organization_id, cuit, business_name, regime) values (${A}, ${o.id}, ${cuit}, 'Vigía WhatsApp SA', 'monotributo')`;
await fetch(`${MOCK}/__delegar?cuit=${cuit}`, { method: "POST" });
const scope = await scopeOf({ studio_id: A, organization_id: o.id, cuit });
await arca.saveSettings(scope, { businessName: "Vigía WhatsApp SA", ivaCondition: "monotributo" }, actorA);
const member = async (email: string, role: string, phone: string) => {
  const [u] = await sql`insert into users (name, email, role, studio_id, email_verified) values (${email.split("@")[0]}, ${email}, 'cliente', ${A}, true) returning id`;
  await sql`insert into memberships (user_id, organization_id, studio_id, role, status) values (${u.id}, ${o.id}, ${A}, ${role}, 'activa')`;
  await sql`insert into whatsapp_contacts (studio_id, organization_id, user_id, phone, verified_at) values (${A}, ${o.id}, ${u.id}, ${phone}, now())`;
  return u.id as string;
};
const PHONE = "5491170001111";
const PHONE2 = "5491170002222";
const duena = await member("wa-duena@ejemplo.com", "direccion", PHONE);
await member("wa-consulta@ejemplo.com", "consulta", PHONE2);

// Cuenta de WhatsApp de Faro (compartida) e IA de la plataforma con el simulador (para transcribir)
await fetch(`${WA}/__reset`, { method: "POST" });
await sql`delete from whatsapp_messages where studio_id = ${A} or studio_id is null`;
await sql`delete from whatsapp_accounts`;
const SECRET = "secreto-vigia";
await saveAccount(actorA, null, "propio", { phoneNumberId: "100200300", wabaId: "900800700", displayPhone: "+54 9 11 5555-0000", accessToken: "EAAprueba", appSecret: SECRET });
await saveAccount(actorA, A, "compartido", null);
const [savedAi] = await sql`select * from platform_ai where id = 'default'`;
await savePlatformAi(actorA.id, { provider: "openai_compatible", apiKey: "clave-de-prueba", baseUrl: OPENAI, modelPrimary: "faro-mock", modelFallback: "faro-mock-2", transcription: "openai", freeTier: false, limits: {}, dailyCap: null, monthlyCap: null, priceIn: 0.1, priceOut: 0.4 });

let n = 0;
const sign = (raw: string) => "sha256=" + createHmac("sha256", SECRET).update(raw).digest("hex");
async function inbound(msg: Record<string, unknown>, from = PHONE) {
  const id = `wamid.VIGIA-${Date.now()}-${++n}`;
  const raw = JSON.stringify({ object: "whatsapp_business_account", entry: [{ id: "WABA", changes: [{ field: "messages", value: { metadata: { phone_number_id: "100200300" }, contacts: [{ wa_id: from, profile: { name: "Cliente" } }], messages: [{ from, id, timestamp: "1", ...msg }] } }] }] });
  const r = await handleWebhook(raw, sign(raw));
  const [reply] = await sql`select body from whatsapp_messages where direction = 'saliente' and kind = 'texto' and phone = ${from} order by created_at desc limit 1`;
  return { id, raw, status: r.status, reply: (reply?.body as string) ?? "" };
}
const say = (text: string, from = PHONE) => inbound({ type: "text", text: { body: text } }, from);
const media = async (data: string | Buffer, mime: string) => ((await (await fetch(`${WA}/__media`, { method: "POST", body: JSON.stringify({ base64: Buffer.from(data).toString("base64"), mime }) })).json()) as { id: string }).id;
const invoicesOf = () => sql`select id, status, total, cae, customer_name, idempotency_key from invoices where organization_id = ${o.id} order by created_at`;
const pendingOf = async (phone = PHONE) => (await sql`select pending from whatsapp_contacts where phone = ${phone} and organization_id = ${o.id}`)[0]?.pending;

// ─── Facturar por texto: borrador y «SÍ» ───
const f1 = await say("Facturá 25 mil a Juan Pérez por clases de inglés");
let inv = await invoicesOf();
check("facturar por texto arma el borrador (no emite sin aprobación)", inv.length === 1 && inv[0].status === "borrador" && Number(inv[0].total) === 25000 && inv[0].customer_name === "Juan Perez", JSON.stringify(inv));
check("pide confirmación con SÍ o NO", /Respondé SÍ/.test(f1.reply) && (await pendingOf())?.type === "factura", f1.reply);
await handleWebhook(f1.raw, sign(f1.raw));
check("el mismo mensaje repetido por Meta no duplica la factura", (await invoicesOf()).length === 1);
const s1 = await say("Sí");
inv = await invoicesOf();
check("«SÍ» emite la factura con CAE", inv[0].status === "autorizada" && !!inv[0].cae && /Listo: emitimos/.test(s1.reply), s1.reply);
check("queda la confirmación en la auditoría y lo pendiente se limpia", (await sql`select 1 from audit_log where action = 'whatsapp.factura_confirmada' and organization_id = ${o.id}`).length === 1 && !(await pendingOf()));
check("un «SÍ» sin nada pendiente sigue como mensaje al estudio", !/emitimos/.test((await say("si")).reply));

// ─── «NO» descarta ───
await say("facturame 1000 a Prueba por nada");
const before = (await invoicesOf()).length;
const no = await say("no");
check("«NO» descarta el borrador", (await invoicesOf()).length === before - 1 && /descarté/.test(no.reply), no.reply);

// ─── Factura por audio en el teléfono de prueba ───
const audioId = await media("TRANSCRIPCION:facturá 12000 a Pedro Gómez por reparación de PC", "audio/ogg");
const au = await inbound({ type: "audio", audio: { id: audioId, mime_type: "audio/ogg", voice: true } });
inv = await invoicesOf();
const last = inv[inv.length - 1];
check("factura por audio: se transcribe y arma el borrador", last.status === "borrador" && Number(last.total) === 12000 && last.customer_name === "Pedro Gomez" && /Respondé SÍ/.test(au.reply), au.reply);
const [aMsg] = await sql`select body, kind from whatsapp_messages where external_id = ${au.id}`;
check("la transcripción queda guardada como origen del mensaje", aMsg.kind === "audio" && /Pedro Gómez/.test(aMsg.body));
await say("dale");
check("y con «dale» se emite", (await sql`select status from invoices where id = ${last.id}`)[0].status === "autorizada");

// ─── Con el interruptor «Facturar automáticamente lo pedido por WhatsApp» ───
await sql`insert into automation_switches (studio_id, organization_id, action, enabled, paused, set_by) values (${A}, ${o.id}, 'facturacion.whatsapp', true, false, ${d.users.adminA})`;
const auto = await say("facturá $5.000 a Ana Díaz por diseño de logo");
inv = await invoicesOf();
check("con el interruptor activo se emite sin esperar el SÍ", inv[inv.length - 1].status === "autorizada" && /Listo: emitimos/.test(auto.reply), auto.reply);
await sql`update automation_switches set paused = true where studio_id = ${A} and action = 'facturacion.whatsapp'`;
await say("facturá 2000 a Ana Díaz por ajuste");
inv = await invoicesOf();
check("con el interruptor en pausa vuelve a pedir el SÍ", inv[inv.length - 1].status === "borrador");
await sql`delete from automation_switches where studio_id = ${A} and action = 'facturacion.whatsapp'`;

// ─── ARCA caído ───
await fetch(`${MOCK}/__fuera?on=1`, { method: "POST" });
const down = await say("si");
await fetch(`${MOCK}/__fuera?on=0`, { method: "POST" });
inv = await invoicesOf();
check("ARCA caído: queda en cola con número previsto y lo avisa", inv[inv.length - 1].status === "en_cola" && /en cola/.test(down.reply), down.reply);

// ─── Gasto con la foto del ticket → rendición ───
await sql`delete from reimbursements where organization_id = ${o.id}`;
const g = await say("gasté 3500 en nafta");
check("gasto: lo anota y pide el ticket", /Mandame la foto del ticket/.test(g.reply) && (await pendingOf())?.type === "gasto", g.reply);
const img = await media(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0]), Buffer.alloc(200, 1), Buffer.from([0xff, 0xd9])]), "image/jpeg");
const t = await inbound({ type: "image", image: { id: img, mime_type: "image/jpeg" } });
const [rb] = await sql`select amount, description, user_id from reimbursements where organization_id = ${o.id}`;
check("la foto del ticket carga la rendición a nombre de quien escribió", Number(rb?.amount) === 350000 && rb.description === "Nafta" && rb.user_id === duena && /cargué la rendición/.test(t.reply), t.reply);

// ─── Consultas ───
const c1 = await say("¿Cuánto facturé este mes?");
check("consulta: lo facturado en el mes", /facturó \$/.test(c1.reply), c1.reply);
await sql`insert into obligations (studio_id, organization_id, tax, period, due_date) values (${A}, ${o.id}, 'Monotributo', '2026-10', (now() + interval '5 days')::date)`;
const c2 = await say("qué vencimientos tengo");
check("consulta: próximos vencimientos", /Monotributo 2026-10/.test(c2.reply), c2.reply);
const c3 = await say("cómo vengo con el monotributo");
check("consulta: semáforo del monotributo con su aviso", /no es una revisión profesional/.test(c3.reply), c3.reply);

// ─── BAJA y ALTA ───
await say("BAJA");
check("BAJA: deja de recibir avisos", (await sql`select opt_in_avisos from whatsapp_contacts where phone = ${PHONE}`)[0].opt_in_avisos === false);
await say("alta");
check("ALTA: vuelve a recibirlos (auditado)", (await sql`select opt_in_avisos from whatsapp_contacts where phone = ${PHONE}`)[0].opt_in_avisos === true && (await sql`select 1 from audit_log where action = 'whatsapp.avisos' and organization_id = ${o.id}`).length >= 2);

// ─── Permisos y mensajes que siguen al estudio ───
const nInv = (await invoicesOf()).length;
const r2 = await say("facturá 9000 a Alguien por algo", PHONE2);
check("un rol de consulta no puede facturar", (await invoicesOf()).length === nInv && /no puede facturar/.test(r2.reply), r2.reply);
await sql`delete from requests where organization_id = ${o.id}`;
await say("Hola, ¿me mandan el F.931 de septiembre?");
check("lo que no es un pedido sigue como solicitud al estudio", (await sql`select 1 from requests where organization_id = ${o.id} and data->>'canal' = 'whatsapp'`).length === 1);

// ─── El Vigía del estudio ve lo pedido por WhatsApp ───
const { executeTool } = await import("../../src/modules/tools/index.ts");
const ctx = { studioId: A, actor: { id: actorA.id, email: actorA.email, name: "Admin A", role: "dueno" as const }, origin: "asistente" as const, organizationIds: null, modules: null, canWrite: true };
const pw = await executeTool("pedidos_whatsapp", {}, ctx);
const pwr = (pw as { result?: { facturas?: { organizacion: string; estado: string }[] } }).result;
check("el Vigía lista las facturas pedidas por WhatsApp", pw.status === "ok" && (pwr?.facturas ?? []).filter((f) => f.organizacion === "Vigía WhatsApp SA").length >= 4, pw.status);
const pwB = await executeTool("pedidos_whatsapp", {}, { ...ctx, studioId: B, actor: { ...ctx.actor, id: d.users.adminB } });
check("el Vigía de otro estudio no las ve", !((pwB as { result?: { facturas?: { organizacion: string }[] } }).result?.facturas ?? []).some((f) => f.organizacion === "Vigía WhatsApp SA"));

// ─── Aislamiento forzando IDs ───
const [ajena] = await sql`select id from invoices where studio_id = ${B} limit 1`;
const [otra] = ajena ? [ajena] : await sql`select id from invoices where organization_id <> ${o.id} limit 1`;
if (otra) {
  await sql`update whatsapp_contacts set pending = ${sql.json({ type: "factura", id: otra.id, at: new Date().toISOString() })} where phone = ${PHONE}`;
  const x = await say("si");
  check("una factura de otra organización forzada como pendiente no se emite", /No encontré la factura/.test(x.reply), x.reply);
} else check("hay facturas de otra organización para forzar", false);
await sql`update whatsapp_contacts set pending = null where phone = ${PHONE}`;
const stranger = await say("facturá 1000 a X por Y", "5491100000000");
check("un número sin verificar no factura", /no está registrado/.test(stranger.reply) && (await invoicesOf()).length === nInv);

// Limpieza
if (savedAi) await sql`update platform_ai set ${sql(savedAi)} where id = 'default'`;
else await sql`delete from platform_ai where id = 'default'`;
await sql.end();
console.log(fails ? `\n${fails} fallas` : "\nTodo en verde");
process.exit(fails ? 1 : 0);
