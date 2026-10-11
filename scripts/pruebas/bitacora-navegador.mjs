// Bitácora completa (F8) de punta a punta en el navegador: fijos y fugas
// detectados, sobres sugeridos, metas con el límite Gratis, importación de un
// CSV con vista previa y duplicados (y el límite mensual), conexiones Plus con
// los simuladores de Mercado Pago (4070) y Gmail (4030), propuestas para
// confirmar, valores reales (IPC), gasto profesional a Faro Personal y hogar
// compartido; más aislamiento forzando IDs.
//
//   PW=/ruta/a/playwright node --env-file=.env.local scripts/pruebas/bitacora-navegador.mjs

import postgres from "postgres";
import { BASE, check, data, failures } from "./lib.mjs";

const { chromium } = await import(process.env.PW ?? "playwright");
const d = data();
const sql = postgres(process.env.DATABASE_URL);
const T = d.users.titular;
const E = d.users.empleadaNorte;
const B = d.users.adminB;
const [{ email: empleadaEmail }] = await sql`select email from users where id = ${E}`;

// Estado limpio
for (const t of ["bitacora_entries", "bitacora_imports", "bitacora_budgets", "bitacora_goals", "bitacora_recurring", "bitacora_insights", "bitacora_connections", "bitacora_proposals"]) await sql`delete from ${sql(t)} where user_id in ${sql([T, E, B])}`;
await sql`delete from bitacora_shares where owner_id in ${sql([T, E, B])}`;
await sql`delete from accounting_expenses where studio_id = ${d.studios.personal} and source = 'bitacora'`;
await sql`update studios set plan_key = 'autonomo_gratis' where id = ${d.studios.personal}`;
await fetch("http://localhost:4070/__reset", { method: "POST" });

// Tres meses de historia: Netflix todos los meses (con aumento), delivery chico y frecuente, súper
const [cat] = await sql`select id from bitacora_categories where user_id = ${T} and key = 'comida'`.catch(() => [null]);
const iso = (daysAgo) => new Date(Date.now() - daysAgo * 86400000).toISOString().slice(0, 10);
const seed = [];
for (const m of [0, 1, 2]) {
  seed.push({ description: "NETFLIX.COM", amount: m === 0 ? 999900 : 899900, date: iso(m * 30 + 3) });
  seed.push({ description: "Supermercado Día", amount: 4500000, date: iso(m * 30 + 6) });
  for (let k = 0; k < 7; k++) seed.push({ description: "PedidosYa", amount: 650000, date: iso(m * 30 + 8 + k) });
}
for (const s of seed) await sql`insert into bitacora_entries (user_id, kind, amount, currency, date, description, source, category_id) values (${T}, 'gasto', ${s.amount}, 'ARS', ${s.date}, ${s.description}, 'manual', ${cat?.id ?? null})`;
const [prev] = await sql`select to_char(now() - interval '1 month', 'YYYY-MM') m, to_char(now(), 'YYYY-MM') n`;
await sql`insert into ipc_series (month, value, source) values (${prev.m}, 100, 'Prueba'), (${prev.n}, 110, 'Prueba') on conflict (month) do update set value = excluded.value, source = excluded.source`;

const browser = await chromium.launch({ executablePath: process.env.CHROME ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
async function as(cookie) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const [name, value] = cookie.split("=");
  await ctx.addCookies([{ name, value, domain: "localhost", path: "/" }]);
  const page = await ctx.newPage();
  page.on("dialog", (dlg) => dlg.accept());
  return page;
}
const page = await as(d.cookies.titular);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const seen = async (text, p = page, timeout = 20000) => p.waitForFunction((t) => document.body.innerText.includes(t), text, { timeout }).then(() => true, () => false);

// Fijos y fugas
await page.goto(`${BASE}/bitacora/fijos`);
check("fijo detectado: Netflix", await seen("NETFLIX"));
check("aumento de precio marcado", await seen("subió"));
await page.goto(`${BASE}/bitacora`);
check("aviso de fuga en Bitácora", await seen("PedidosYa"));
await page.goto(`${BASE}/bitacora?ver=real&mes=${prev.m}`);
check("valores ajustados por IPC con la fuente", await seen("según el IPC (Prueba)"));

// Sobres
await page.goto(`${BASE}/bitacora/presupuesto`);
await page.getByRole("button", { name: /Usar los \d+ sugeridos/ }).click();
check("sobres sugeridos aplicados", await seen("Armamos"));
const budgets = await sql`select count(*)::int n from bitacora_budgets where user_id = ${T}`;
check("sobres guardados", budgets[0].n > 0);

// Metas (Gratis: 1)
await page.goto(`${BASE}/bitacora/metas`);
await page.getByLabel("Para qué").fill("Vacaciones");
await page.getByLabel("Cuánto querés juntar").fill("600000");
await page.getByRole("button", { name: "Crear la meta" }).click();
check("meta creada con ahorro semanal", (await seen("Meta creada")) && (await seen("por semana")));
await page.getByLabel("Para qué").fill("Auto");
await page.getByLabel("Cuánto querés juntar").fill("100");
await page.getByRole("button", { name: "Crear la meta" }).click();
check("segunda meta frenada en Gratis", await seen("podés tener 1 meta activa"));

// Importación CSV con un duplicado
const csv = `Fecha;Descripción;Importe\n${iso(6).split("-").reverse().join("/")};Supermercado Día;-45000,00\n${iso(2).split("-").reverse().join("/")};Farmacia Central;-12.500,50\n${iso(1).split("-").reverse().join("/")};Transferencia recibida;80000\n`;
const upload = async () => {
  await page.goto(`${BASE}/bitacora/importar`);
  await page.locator('input[type="file"]').setInputFiles({ name: "resumen.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await page.getByRole("button", { name: "Ver vista previa" }).click();
};
await upload();
check("vista previa: 3 leídos, 1 ya estaba", await seen("3 movimientos leídos, 1 ya estaban"));
await page.getByRole("button", { name: /Importar \d+ movimientos/ }).click();
check("importados 2, salteado 1", await seen("Importamos 2 movimientos y salteamos 1"));
const imported = await sql`select external_id, raw, import_id, validation from bitacora_entries where user_id = ${T} and source = 'importacion'`;
check("importados con ID externo, lote y fila original", imported.length === 2 && imported.every((r) => r.external_id && r.import_id && r.raw && r.validation === "importado"));
await upload();
check("segunda vez: todo duplicado", await seen("3 movimientos leídos, 3 ya estaban"));
await page.getByRole("button", { name: /Importar 0 movimientos/ }).click();
check("nada repetido", await seen("Importamos 0 movimientos y salteamos 3"));
await upload();
check("tercera importación del mes frenada en Gratis", await seen("podés importar 2 resúmenes por mes"));

// Conexiones: Gratis no conecta
await page.goto(`${BASE}/bitacora/conexiones`);
check("conexiones: aviso de Plus", (await seen("son de Bitácora Plus")) && !(await page.getByRole("button", { name: /Conectar/ }).count()));

// Plus
await sql`update studios set plan_key = 'autonomo_pro' where id = ${d.studios.personal}`;
await page.goto(`${BASE}/bitacora/conexiones`);
await page.getByRole("button", { name: "Conectar Mercado Pago" }).click();
check("Mercado Pago conectado por OAuth", await seen("Mercado Pago conectado"), errors.join(" | "));
await page.getByRole("button", { name: "Traer movimientos" }).click();
check("movimientos de Mercado Pago traídos", await seen("de Mercado Pago."));
const mpRows = await sql`select external_id, raw, synced_at from bitacora_entries where user_id = ${T} and source = 'mercadopago'`;
check("con fuente, ID externo, fecha de sync y registro original", mpRows.length > 0 && mpRows.every((r) => r.external_id.startsWith("mp:") && r.raw && r.synced_at));
await page.getByRole("button", { name: "Traer movimientos" }).click();
check("sin duplicar al volver a traer", await seen("No hay movimientos nuevos"));
const [tok] = await sql`select access_token_enc from bitacora_connections where user_id = ${T} and provider = 'mercadopago'`;
check("token guardado cifrado", tok.access_token_enc.startsWith("v1:"));
await page.getByRole("button", { name: "Conectar Gmail" }).click();
check("Gmail conectado", await seen("Gmail conectado"));
await page.getByRole("button", { name: "Buscar mails" }).click();
check("mails con gastos detectados (sin el del asado)", (await seen("Para confirmar")) && !(await page.content()).includes("Asado"));
const props = await sql`select id, description from bitacora_proposals where user_id = ${T} and status = 'pendiente' order by description`;
check("3 propuestas", props.length === 3, props.map((p) => p.description).join(", "));
await page.getByRole("button", { name: "Cargar" }).first().click();
check("propuesta aceptada", await seen("Cargado en tu Bitácora"));
await page.getByRole("button", { name: "Descartar" }).first().click();
check("propuesta descartada", await seen("Descartado."));
const gm = await sql`select count(*)::int n from bitacora_entries where user_id = ${T} and source = 'gmail'`;
check("solo lo aceptado entra a la Bitácora", gm[0].n === 1);

// Gasto profesional → Faro Personal
const [farm] = await sql`select id from bitacora_entries where user_id = ${T} and description = 'Farmacia Central'`;
await page.goto(`${BASE}/bitacora/${farm.id}`);
await page.getByLabel(/Es un gasto de mi actividad/).check();
await page.getByLabel(/Se puede deducir/).check();
await page.getByRole("button", { name: "Guardar", exact: true }).last().click();
check("marcado como profesional", await seen("Guardado."));
await page.getByRole("button", { name: "Pasar a Faro Personal" }).click();
check("pasado a Faro Personal", await seen("Pasado a los gastos de tu actividad"));
const [acc] = await sql`select * from accounting_expenses where source = 'bitacora' and source_id = ${farm.id}`;
check("gasto de la actividad con su origen y deducible", !!acc && acc.deductible === true);

// Hogar compartido
await page.goto(`${BASE}/bitacora/compartida`);
await page.getByLabel("Mail de la persona").fill(empleadaEmail);
await page.getByLabel("Puede").selectOption("ver");
await page.getByRole("button", { name: "Invitar" }).click();
check("invitación enviada", await seen("Invitación enviada"));
const [share] = await sql`select * from bitacora_shares where owner_id = ${T} and status = 'invitada'`;
const other = await as(d.cookies.adminB);
await other.goto(`${BASE}/bitacora/compartida/aceptar/${share.token}`);
await other.getByRole("button", { name: "Aceptar" }).click();
check("otra persona no puede aceptar la invitación", await seen(`La invitación es para ${empleadaEmail}`, other));
const emp = await as(d.cookies.empleadaNorte);
await emp.goto(`${BASE}/bitacora/compartida/${share.id}`);
check("antes de aceptar: 404", (await emp.content()).includes("404") || (await seen("no existe", emp, 3000)));
await emp.goto(`${BASE}/bitacora/compartida/aceptar/${share.token}`);
await emp.getByRole("button", { name: "Aceptar" }).click();
check("aceptada: ve la Bitácora compartida", await seen("Bitácora de", emp));
check("solo ver: sin formulario de carga", !(await emp.getByRole("button", { name: "Cargar" }).count()));
const res = await emp.request.post(`${BASE}/bitacora/compartida/${share.id}`, { failOnStatusCode: false }).catch(() => null);
check("POST suelto no carga nada", !res || res.status() !== 200 || (await sql`select count(*)::int n from bitacora_entries where user_id = ${T} and note like 'Cargado por%'`)[0].n === 0);
await other.goto(`${BASE}/bitacora/compartida/${share.id}`);
check("aislamiento: otra persona forzando el ID de la invitación → 404", (await other.content()).includes("404") || (await seen("no existe", other, 3000)));
await page.goto(`${BASE}/bitacora/compartida`);
await page.getByRole("button", { name: "Dejar de compartir" }).click();
check("revocada por quien comparte", await seen("Dejaron de compartir"));
await emp.goto(`${BASE}/bitacora/compartida/${share.id}`);
check("después de revocar: 404", (await emp.content()).includes("404") || (await seen("no existe", emp, 3000)));
const aud = await sql`select action from audit_log where entity_id = ${share.id}`;
check("auditoría: compartir, aceptar y revocar", ["bitacora.compartir", "bitacora.compartida_aceptada", "bitacora.compartida_revocada"].every((a) => aud.some((r) => r.action === a)));

// Aislamiento forzando IDs: importación y movimiento de otra persona
const [bImp] = await sql`insert into bitacora_imports (user_id, source, file_name, rows, total) values (${B}, 'csv', 'ajeno.csv', ${sql.json([["Fecha", "D", "I"], ["01/01/2026", "x", "-1"]])}, 1) returning id`;
await page.goto(`${BASE}/bitacora/importar/${bImp.id}`);
check("importación ajena → 404", (await page.content()).includes("404") || (await seen("no existe", page, 3000)));
const [bEntry] = await sql`insert into bitacora_entries (user_id, kind, amount, currency, date, description, source) values (${B}, 'gasto', 100, 'ARS', ${iso(1)}, 'ajeno', 'manual') returning id`;
await page.goto(`${BASE}/bitacora/${bEntry.id}`);
check("movimiento ajeno → 404", (await page.content()).includes("404") || (await seen("no existe", page, 3000)));

check("sin errores de la página", errors.length === 0, errors.join(" | "));
await sql`update studios set plan_key = 'autonomo_gratis' where id = ${d.studios.personal}`;
await browser.close();
await sql.end();
console.log(failures ? `\n${failures} fallaron` : "\nTodo bien");
process.exit(failures ? 1 : 0);
