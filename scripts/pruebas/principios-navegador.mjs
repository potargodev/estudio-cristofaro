// Principios de producto en el navegador (390 px y escritorio, claro y oscuro),
// etapa por etapa. Correr después de datos.mjs, con el servidor en :3000.
//
//   PW=/ruta/a/playwright node --env-file=.env.local scripts/pruebas/principios-navegador.mjs [etapa]

import { createHmac, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { BASE, check, data, failures } from "./lib.mjs";

const { chromium } = await import(process.env.PW ?? "playwright");
const d = data();
const sql = postgres(process.env.DATABASE_URL, { onnotice: () => {} });
const only = process.argv[2];
const stage = (n) => !only || only === n;
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const errors = [];

/** Cookie de sesión firmada para un usuario (como datos.mjs) */
async function cookieFor(userId) {
  const token = randomBytes(24).toString("base64url");
  await sql`insert into sessions (token, user_id, expires_at) values (${token}, ${userId}, now() + interval '1 day')`;
  const sig = createHmac("sha256", process.env.BETTER_AUTH_SECRET).update(token).digest("base64");
  return `better-auth.session_token=${encodeURIComponent(`${token}.${sig}`)}`;
}
/** Persona de prueba (tenant persona con su usuario titular) */
async function persona(email, name) {
  const [u0] = await sql`select id, studio_id from users where email = ${email}`;
  if (u0) return u0;
  const slug = `p-${randomBytes(4).toString("hex")}`;
  const [s] = await sql`insert into studios (slug, name, kind, plan_key, status) values (${slug}, ${name}, 'persona', 'persona_gratis', 'activo') returning id`;
  const [u] = await sql`insert into users (name, email, email_verified, role, studio_id) values (${name}, ${email}, true, 'titular', ${s.id}) returning id, studio_id`;
  await sql`update studios set owner_user_id = ${u.id} where id = ${s.id}`;
  await sql`insert into organizations (studio_id, name, status) values (${s.id}, ${name}, 'activa')`;
  return u;
}
async function as(cookie, { width = 390, dark = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: dark ? "dark" : "light" });
  if (cookie) {
    const [name, value] = cookie.split("=");
    await ctx.addCookies([{ name, value, domain: "localhost", path: "/" }]);
  }
  const page = await ctx.newPage();
  page.on("dialog", (dlg) => dlg.accept());
  page.on("pageerror", (e) => errors.push(e.message));
  return page;
}
const seen = async (p, text, timeout = 15000) => p.waitForFunction((t) => document.body.innerText.includes(t), text, { timeout }).then(() => true, () => false);
const noHScroll = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

// ─── Etapa 1 · Inicial gratis ───
if (stage("1")) {
  const pub = await as(null);
  await pub.goto(`${BASE}/precios`);
  await pub.getByRole("tab", { name: "Para estudios" }).click();
  check("/precios: Inicial gratis y sin prueba", (await seen(pub, "Gratis, sin prueba ni débito")) && (await seen(pub, "¿El plan Inicial es gratis de verdad?")));
  check("/precios: sin el precio viejo", !(await pub.evaluate(() => document.body.innerText.includes("USD 49"))));
  check("/precios en 390 px sin scroll horizontal", await noHScroll(pub));
  await pub.goto(`${BASE}/faro`);
  await pub.getByRole("tab", { name: /Contadores independientes/ }).first().click().catch(() => pub.getByText("Contadores independientes").first().click());
  check("/faro: estudios empiezan gratis", await seen(pub, "Hasta 5 organizaciones gratis con el plan Inicial"));
  await pub.goto(`${BASE}/faro/registro?tipo=studio`);
  check("registro: Inicial gratis", await seen(pub, "Estudios · Inicial, gratis"));

  await sql`update studios set plan_key = 'inicial', status = 'activo', trial_ends_at = null where id = ${d.studios.B}`;
  for (const dark of [false, true]) {
    const b = await as(d.cookies.adminB, { dark, width: dark ? 1280 : 390 });
    await b.goto(`${BASE}/admin/configuracion/plan`);
    check(`Plan y facturación (${dark ? "oscuro, escritorio" : "claro, 390 px"}): Inicial gratis sin débito ni prueba`, (await seen(b, "Gratis, sin vencimiento")) && (await seen(b, "Sin débito (plan gratis)")) && !(await b.evaluate(() => document.body.innerText.includes("Estás en la prueba gratis"))));
    check(`Plan y facturación sin scroll horizontal (${dark ? "oscuro" : "claro"})`, await noHScroll(b));
  }
  const [owner] = await sql`update users set two_factor_enabled = true where faro_role = 'faro_owner' returning id`;
  const fm = await as(await cookieFor(owner.id), { width: 1280 });
  await fm.goto(`${BASE}/faro-manager/planes`);
  check("Faro Manager: Inicial gratis sin prueba ni extra", await seen(fm, "Plan gratis: sin prueba, sin débito ni organizaciones extra."));
}

// ─── Etapa 2 · Escudo de responsabilidad ───
if (stage("2")) {
  const T = d.users.titular;
  await sql`delete from derivation_suggestions where user_id = ${T}`;
  await sql`insert into derivation_suggestions (user_id, rule_key, context) values (${T}, 'facturacion_exterior', ${sql.json({ need: "Facturación al exterior y cobro de divisas", why: "Según lo que cargaste, tenés 1 comprobante E (exportación)." })})`;
  for (const dark of [false, true]) {
    const p = await as(d.cookies.titular, { dark, width: dark ? 1280 : 390 });
    await p.goto(`${BASE}/personal`);
    check(`Inicio (${dark ? "oscuro" : "claro, 390 px"}): sugerencia amable de sumar un contador`, (await seen(p, "Empezaste a facturar al exterior")) && (await seen(p, "Esto no reemplaza el criterio de un contador")));
    check(`Inicio (${dark ? "oscuro" : "claro"}): sin scroll horizontal`, await noHScroll(p));
  }
  const p = await as(d.cookies.titular);
  await p.goto(`${BASE}/personal`);
  await p.getByRole("button", { name: "Ahora no" }).first().click();
  const gone = await p.waitForFunction(() => !document.body.innerText.includes("Empezaste a facturar al exterior"), null, { timeout: 15000 }).then(() => true, () => false);
  check("«Ahora no»: la sugerencia se esconde", gone);
  const [sg] = await sql`select status, snoozed_until from derivation_suggestions where user_id = ${T} and rule_key = 'facturacion_exterior'`;
  check("y vuelve más adelante (snooze guardado)", sg.status === "descartada" && sg.snoozed_until > new Date());
  await sql`update derivation_suggestions set status = 'activa', snoozed_until = null where user_id = ${T}`;
  await p.goto(`${BASE}/personal`);
  await p.getByRole("link", { name: "Sumar un contador" }).first().click();
  check("«Sumar un contador» lleva a la Red con el contexto armado", (await seen(p, "Lo que necesitás: Facturación al exterior")) && p.url().includes("/red-contable?derivacion="));
  // Una sugerencia ajena forzando el ID no muestra nada
  const [other] = await sql`select id from derivation_suggestions where user_id = ${T}`;
  const b = await as(d.cookies.adminB);
  await b.goto(`${BASE}/red-contable?derivacion=${other.id}`);
  check("Red con una derivación ajena: no muestra el contexto", !(await b.evaluate(() => document.body.innerText.includes("Lo que necesitás"))));
  await p.goto(`${BASE}/facturacion/monotributo?compras=100000`);
  check("Monotributo: hechos «Según lo que cargaste» y la simulación como dato", (await seen(p, "Es un dato, no una recomendación")) && !(await p.evaluate(() => document.body.innerText.includes("Vas bien"))));
  check("Facturación: «Esto no reemplaza el criterio de un contador» al pie", await seen(p, "no revisa ni valida tu situación"));
  check("usar la simulación crea la sugerencia de pase a RI", (await sql`select count(*)::int n from derivation_suggestions where user_id = ${T} and rule_key = 'simulacion_ri'`)[0].n === 1);
  await p.goto(`${BASE}/facturacion/chequeos`);
  check("Chequeos: sin «Todo en orden»", (await seen(p, "no una revisión profesional")) && !(await p.evaluate(() => document.body.innerText.includes("Todo en orden"))));
  const [owner] = await sql`update users set two_factor_enabled = true where faro_role = 'faro_owner' returning id`;
  const fm = await as(await cookieFor(owner.id), { width: 1280, dark: true });
  await fm.goto(`${BASE}/faro-manager/escudo`);
  check("Faro Manager → Escudo: tareas y reglas «a validar por un contador»", (await seen(fm, "Tareas que requieren un matriculado")) && (await seen(fm, "Disparador de derivación")) && (await fm.getByText("A validar por un contador").count()) >= 6);
  const form = fm.locator("#regla-monotributo_tope");
  await form.getByLabel(/Umbral/).fill("0,85");
  await form.getByRole("button", { name: "Guardar" }).click();
  check("Faro Manager: umbral guardado", (await seen(fm, "Regla guardada")) && Number((await sql`select threshold from derivation_rules where key = 'monotributo_tope'`)[0]?.threshold) === 0.85);
  await sql`delete from derivation_rules where key = 'monotributo_tope'`;
  await sql`delete from derivation_suggestions where user_id = ${T}`;
  const pub = await as(null);
  await pub.goto(`${BASE}/faro`);
  check("/faro: sin «sin ser contador» ni «sin contador»", !(await pub.evaluate(() => /sin ser contador|acompaña sin contador/i.test(document.body.innerText))));
}

// ─── Etapa 3 · Mis cajas, caja de negocio y sueldo ───
if (stage("3")) {
  const T = d.users.titular;
  // En una base nueva el autónomo de datos.mjs se crea después de la migración 0037:
  // se repiten sus dos inserts (idempotentes) para tener el estado migrado
  const mig = readFileSync(new URL("../../drizzle/0037_cajas.sql", import.meta.url), "utf8").split("--> statement-breakpoint");
  for (const st of mig.filter((x) => /INSERT INTO "box(es|_members)"/.test(x) && !/bitacora_entries" e\n/.test(x)).slice(0, 2)) await sql.unsafe(st);
  const [biz] = await sql`select id from boxes where owner_id = ${T} and kind = 'negocio'`;
  check("el autónomo ya tiene su caja de negocio", !!biz);
  await sql`delete from box_salaries where box_id = ${biz.id}`;
  await sql`delete from box_entries where box_id = ${biz.id}`;
  const [lic] = await sql`insert into bitacora_entries (user_id, kind, amount, date, description) values (${T}, 'gasto', 2500000, current_date, 'Licencia Figma') returning id`;
  for (const dark of [false, true]) {
    const p = await as(d.cookies.titular, { dark, width: dark ? 1280 : 390 });
    await p.goto(`${BASE}/cajas`);
    check(`Mis cajas (${dark ? "oscuro, escritorio" : "claro, 390 px"}): personal, negocio y compartida`, (await seen(p, "Tu plata de todos los días. Es tu Bitácora.")) && (await seen(p, "Mi negocio")) && (await seen(p, "Caja compartida")));
    check(`Mis cajas (${dark ? "oscuro" : "claro"}): sin scroll horizontal`, await noHScroll(p));
  }
  const p = await as(d.cookies.titular);
  await p.goto(`${BASE}/cajas`);
  check("«Licencia Figma» en lo personal: Faro sugiere moverla", await seen(p, "Esto parece de tu negocio"));
  await p.locator("li", { hasText: "Licencia Figma" }).getByRole("button", { name: "Mover al negocio" }).click();
  await p.waitForURL(/\/cajas\/[0-9a-f-]{36}/);
  check("moverla lleva a la caja de negocio con el gasto", (await seen(p, "ya no está en lo personal")) && (await seen(p, "Licencia Figma")) && (await seen(p, "movido de lo personal")));
  check("y sale de lo personal", !!(await sql`select deleted_at from bitacora_entries where id = ${lic.id}`)[0].deleted_at);
  await p.getByRole("radio", { name: "Ingreso" }).check();
  await p.getByLabel("Monto").first().fill("500.000");
  await p.getByLabel("En qué fue").fill("Cobro proyecto");
  await p.locator("select[name=category]").selectOption("ventas");
  await p.getByLabel("Ingreso con factura").check();
  await p.getByRole("button", { name: "Cargar", exact: true }).click();
  check("cargar un ingreso en el negocio", await seen(p, "Cargado en la caja de negocio."));
  const salary = p.locator("section", { hasText: "Tu sueldo" });
  await salary.getByLabel("Monto").first().fill("200.000");
  await salary.getByRole("button", { name: "Guardar sueldo" }).click();
  check("configurar el sueldo (monto y frecuencia)", await seen(p, "Sueldo guardado"));
  await p.locator("form", { hasText: "Pagarte ahora" }).getByRole("button", { name: "Registrar sueldo" }).click();
  check("registrar el sueldo: sale del negocio", (await seen(p, "entró en tu caja personal")) && (await seen(p, "Sueldo del dueño")));
  const [tr] = await sql`select id from bitacora_entries where user_id = ${T} and transfer_id is not null and deleted_at is null order by created_at desc limit 1`;
  await p.goto(`${BASE}/bitacora`);
  check("y entra en la Bitácora (caja personal)", await seen(p, "Sueldo de Mi negocio"));
  await p.goto(`${BASE}/bitacora/${tr.id}`);
  check("en la Bitácora se ve como movimiento entre cajas (no se edita ahí)", await seen(p, "Es un movimiento entre cajas"));
  const b = await as(d.cookies.adminB);
  const r = await b.goto(`${BASE}/cajas/${biz.id}`);
  check("caja ajena forzando el ID: 404", r.status() === 404);
  const q = await as(d.cookies.duenaNorte);
  const r2 = await q.goto(`${BASE}/cajas/${biz.id}`);
  check("otra persona con cuenta, forzando el ID: 404", r2.status() === 404);
}

// ─── Etapa 4 · Registro compartido ───
if (stage("4")) {
  const T = d.users.titular;
  await sql`delete from boxes where owner_id = ${T} and kind = 'compartida'`;
  const pareja = await persona("pareja.prueba@prueba.local", "Pato Pareja");
  await sql`delete from box_members where user_id = ${pareja.id}`;
  const p = await as(d.cookies.titular);
  await p.goto(`${BASE}/cajas/nueva`);
  check("opciones ya armadas: pareja, familia, amigos, negocio, padres y abuelos", (await seen(p, "Padres y abuelos")) && (await p.locator("[data-opcion]").count()) === 5);
  check("«Padres y abuelos» por el fin: cualquiera puede participar", await seen(p, "hermanos, cuñados, primos, sobrinos, nietos"));
  await p.locator('[data-opcion="pareja"]').click();
  await p.waitForURL(/\/cajas\/[0-9a-f-]{36}/);
  const boxId = p.url().split("/cajas/")[1].split("?")[0];
  await p.getByRole("button", { name: "Invitar con un enlace" }).click();
  check("invitar: enlace y WhatsApp", (await seen(p, "Mandar por WhatsApp")) && (await p.getByTestId("share-link").count()) === 1);
  const link = (await p.getByTestId("share-link").innerText()).trim();
  const anon = await as(null);
  await anon.goto(link);
  check("sin cuenta: para entrar hay que tener cuenta (se crea ahí)", (await seen(anon, "necesitás una cuenta de Faro")) && !(await anon.evaluate(() => document.body.innerText.includes("Sin cuenta"))));
  const q = await as(await cookieFor(pareja.id));
  await q.goto(link);
  await q.getByRole("button", { name: /Sumarme como/ }).click();
  await q.waitForURL(/\/cajas\/[0-9a-f-]{36}/);
  check("con cuenta: se suma y entra a la caja", await seen(q, "Te sumaste a la caja."));
  // Cena de $3.000 dividida
  await p.goto(`${BASE}/cajas/${boxId}`);
  await p.getByLabel("Monto").first().fill("3.000");
  await p.getByLabel("En qué fue").fill("Cena");
  await p.locator('input[name="final"][value="dividir"]').check();
  await p.getByRole("button", { name: "Cargar", exact: true }).click();
  check("dividir: «Pato Pareja le debe $ 1.500»", (await seen(p, "Pato Pareja le debe $ 1.500")) && (await seen(p, "pendiente hasta que confirme")));
  await q.goto(`${BASE}/cajas/${boxId}`);
  check("la pareja ve «Para confirmar» con su parte", (await seen(q, "Tu parte de Cena")) && (await q.getByRole("button", { name: "Ya la pagué" }).count()) === 1);
  await q.getByRole("button", { name: "Ya la pagué" }).click();
  check("al confirmar el pago: están parejos", (await seen(q, "Confirmado: ya cuenta en tu seguimiento.")) && (await seen(q, "Están parejos.")));
  // Una carga, dos destinos desde la Bitácora
  await p.goto(`${BASE}/bitacora?cargar=1`);
  if (!(await p.locator('select[name="box"]').isVisible())) await p.getByText("Cargar a mano").first().click();
  await p.locator('select[name="box"]').selectOption(boxId);
  await p.locator('input[name="amount"]').first().fill("3.000");
  await p.locator('input[name="description"]').first().fill("Cena del sábado");
  await p.getByRole("button", { name: "Cargar", exact: true }).click();
  check("Bitácora → también a la caja: queda en las dos", (await seen(p, "Cargado en tu Bitácora y en la caja")) && (await sql`select count(*)::int n from box_entries where box_id = ${boxId} and description = 'Cena del sábado' and personal_entry_id is not null`)[0].n === 1);
  for (const dark of [false, true]) {
    const v = await as(d.cookies.titular, { dark, width: dark ? 1280 : 390 });
    await v.goto(`${BASE}/cajas/${boxId}`);
    check(`caja compartida (${dark ? "oscuro, escritorio" : "claro, 390 px"}): desglose y sin scroll horizontal`, (await seen(v, "Quién puso qué")) && (await noHScroll(v)));
  }
  const b = await as(d.cookies.adminB);
  check("alguien que no es integrante (forzando el ID): 404", (await b.goto(`${BASE}/cajas/${boxId}`)).status() === 404);
  const o = await as(d.cookies.duenaNorte);
  check("otra persona con cuenta, no integrante: 404", (await o.goto(`${BASE}/cajas/${boxId}`)).status() === 404);
  await p.goto(`${BASE}/cajas`);
  check("Mis cajas muestra la caja de pareja con su gente", await seen(p, "Pareja · 2 personas"));
}

// ─── Etapa 5 · Conexión con un contador ───
if (stage("5")) {
  const T = d.users.titular;
  const A = d.studios.A;
  const [{ slug, plan_key }] = await sql`select slug, plan_key from studios where id = ${A}`;
  await sql`update studios set plan_key = 'profesional' where id = ${A}`;
  await sql`insert into directory_profiles (studio_id, published, accepting_clients, headline, province, city, contact_email, license_body, license_number, license_holder, license_status) values (${A}, true, true, 'Estudio de prueba', 'Santa Fe', 'Rosario', 'hola@estudio.test', 'CPCE Santa Fe', '123', 'Admin', 'verificada') on conflict (studio_id) do update set published = true, accepting_clients = true, license_status = 'verificada', contact_email = 'hola@estudio.test'`;
  await sql`delete from account_connections where user_id = ${T}`;
  const t = await as(d.cookies.titular);
  await t.goto(`${BASE}/personal`);
  check("Personal: indicador «Autogestión»", (await seen(t, "Autogestión")) && (await t.locator('[data-modo="autogestion"]').count()) === 1);
  await t.goto(`${BASE}/red-contable/${slug}`);
  check("Red: «Conectar mi cuenta» (conexión, no copia; personal apagado)", (await seen(t, "Conectar mi cuenta")) && !(await t.locator('[data-conectar] input[name="personal"]').isChecked()));
  await t.locator("[data-conectar] textarea[name=message]").fill("Necesito contador para el monotributo");
  await t.getByRole("button", { name: "Pedir la conexión" }).click();
  check("solicitud enviada: en admisión", (await seen(t, "Ahora hace su admisión")) && (await seen(t, "En admisión")));
  const [c] = await sql`select id from account_connections where user_id = ${T} order by created_at desc limit 1`;
  const a = await as(d.cookies.adminA, { width: 1280 });
  await a.goto(`${BASE}/admin/comercial/conexiones`);
  check("Comercial → Conexiones: el pedido para revisar", (await seen(a, "Para revisar")) && (await seen(a, "En admisión")));
  await a.goto(`${BASE}/admin/comercial/conexiones/${c.id}`);
  check("admisión: resumen de lo autorizado, sin cajas personales", (await seen(a, "Lo que autorizó a ver")) && (await seen(a, "No compartidas")));
  await a.locator("input[name=question]").fill("¿Facturás al exterior?");
  await a.getByRole("button", { name: "Pedir", exact: true }).click();
  await seen(a, "Le pediste más información");
  await t.goto(`${BASE}/contador`);
  await t.locator("textarea[name=answer]").fill("No, solo en el país.");
  await t.getByRole("button", { name: "Responder" }).click();
  check("la persona responde la información pedida", await seen(t, "Respuesta enviada al estudio."));
  await a.goto(`${BASE}/admin/comercial/conexiones/${c.id}`);
  await a.locator("textarea[name=services]").fill("Monotributo, recategorización y vencimientos");
  await a.locator("input[name=price]").fill("45.000");
  await a.getByRole("button", { name: "Aceptar y pasar al acuerdo" }).click();
  check("el estudio acepta: pasa al acuerdo", await seen(a, "Aceptada: falta que firmen el acuerdo."));
  await a.getByRole("button", { name: "Firmar" }).click();
  await seen(a, "Firmaste el acuerdo.");
  await t.goto(`${BASE}/contador`);
  check("la persona ve el acuerdo de servicio (honorarios y preaviso)", (await seen(t, "Acuerdo de servicio con")) && (await seen(t, "$ 45.000")));
  await t.locator("input[name=policies]").check();
  const [tu] = await sql`select name from users where id = ${T}`;
  await t.locator("input[name=signed_name]").fill(tu.name);
  await t.getByRole("button", { name: "Firmar", exact: true }).click();
  check("con las dos firmas: conectados", (await seen(t, "Firmaste el acuerdo.")) && (await seen(t, "Conectada")));
  await t.goto(`${BASE}/personal`);
  check("Personal: «Gestión profesional» con el estudio y su contacto", (await seen(t, "Gestión profesional")) && (await seen(t, "hola@estudio.test")));
  await a.goto(`${BASE}/admin/organizaciones`);
  check("Organizaciones: aparece con la marca «Cuenta conectada»", (await a.locator("[data-cuenta-conectada]").count()) === 1 && (await seen(a, "Cuenta conectada")));
  await a.goto(`${BASE}/admin/organizaciones/cuenta/${c.id}`);
  check("cuenta en vivo: caja de negocio y lo fiscal; personal no compartido", (await seen(a, "Caja de negocio")) && (await seen(a, "No compartidas")));
  await a.locator("input[name=amount]").fill("12.000");
  await a.locator("input[name=description]").fill("Monotributo de octubre");
  await a.locator("form", { has: a.locator("input[name=description]") }).locator("select[name=category]").selectOption("impuestos");
  await a.getByRole("button", { name: "Cargar", exact: true }).click();
  check("delegar y mirar: el contador carga y se aplica", await seen(a, "Monotributo de octubre"));
  await t.goto(`${BASE}/contador`);
  check("«Lo que hizo tu contador»: quién, qué y cuándo", (await seen(t, "Lo que hizo tu contador")) && (await seen(t, "Monotributo de octubre")));
  await t.locator("select[name=autonomy]").selectOption("proponer");
  await t.getByRole("button", { name: "Cambiar" }).click();
  await seen(t, "Guardado.");
  await a.goto(`${BASE}/admin/organizaciones/cuenta/${c.id}`);
  await a.locator("input[name=amount]").fill("8.000");
  await a.locator("input[name=description]").fill("Licencia contable");
  await a.getByRole("button", { name: "Cargar", exact: true }).click();
  await seen(a, "Listo.");
  await t.goto(`${BASE}/contador`);
  check("proponer y aprobar: queda «Para aprobar»", (await seen(t, "Para aprobar")) && (await seen(t, "Licencia contable")));
  await t.getByRole("button", { name: "Aprobar" }).click();
  check("al aprobar se aplica", (await seen(t, "Aprobado: ya se aplicó.")) && (await sql`select count(*)::int n from box_entries where description = 'Licencia contable' and deleted_at is null`)[0].n === 1);
  // Aislamiento: otro estudio forzando el ID
  const b = await as(d.cookies.adminB);
  check("otro estudio, forzando el ID: no ve la cuenta", (await b.goto(`${BASE}/admin/organizaciones/cuenta/${c.id}`)).status() === 404 && (await b.goto(`${BASE}/admin/comercial/conexiones/${c.id}`)).status() === 404);
  // Desconexión con mediación
  await t.goto(`${BASE}/contador`);
  await t.locator("textarea[name=reason]").fill("Me mudo de ciudad");
  await t.getByRole("button", { name: "Iniciar el cierre" }).click();
  check("cierre: «En cierre», solo lectura 30 días", (await seen(t, "El estudio queda en solo lectura por 30 días.")) && (await seen(t, "Checklist de cierre")));
  await a.goto(`${BASE}/admin/organizaciones/cuenta/${c.id}`);
  check("el estudio ve solo lectura (sin cargar)", (await seen(a, "En cierre: solo lectura")) && (await a.getByRole("button", { name: "Cargar", exact: true }).count()) === 0);
  for (let i = 0; i < 3; i++) {
    await a.getByRole("button", { name: "Confirmar" }).first().click();
    await seen(a, "Guardado en el checklist.");
  }
  await t.goto(`${BASE}/contador`);
  await t.getByRole("button", { name: "Nadie le debe nada a nadie" }).click();
  check("constancia de los dos: cerrada, con el registro del período", (await seen(t, "Relaciones anteriores")) && (await sql`select status from account_connections where id = ${c.id}`)[0].status === "cerrada");
  check("encuesta al cerrar la relación", await seen(t, "¿Cómo fue tu relación con"));
  await t.getByRole("button", { name: "Enviar" }).click();
  check("calificación guardada (no pública)", await seen(t, "Tu opinión queda guardada"));
  await a.goto(`${BASE}/admin/organizaciones/cuenta/${c.id}`);
  check("conexión cerrada: el estudio no ve nada", (await seen(a, "el estudio no tiene acceso a los datos")) && !(await a.evaluate(() => document.body.innerText.includes("Caja de negocio"))));
  await a.goto(`${BASE}/admin/comercial/conexiones`);
  check("el estudio ve su calificación en Conexiones", await seen(a, "Tus calificaciones"));
  for (const dark of [false, true]) {
    const v = await as(d.cookies.titular, { dark, width: dark ? 1280 : 390 });
    await v.goto(`${BASE}/contador`);
    check(`Contador (${dark ? "oscuro, escritorio" : "claro, 390 px"}): sin scroll horizontal`, (await seen(v, "Relaciones anteriores")) && (await noHScroll(v)));
  }
  await sql`update studios set plan_key = ${plan_key} where id = ${A}`;
}

// ─── Etapa 6 · Red Contable de doble mano ───
if (stage("6")) {
  const T = d.users.titular;
  const A = d.studios.A;
  const [{ slug, plan_key }] = await sql`select slug, plan_key from studios where id = ${A}`;
  await sql`update studios set plan_key = 'profesional' where id = ${A}`;
  await sql`insert into directory_profiles (studio_id, published, license_status, accepting_clients) values (${A}, true, 'verificada', true) on conflict (studio_id) do update set published = true, license_status = 'verificada'`;
  await sql`delete from account_connections where user_id = ${T}`;
  await sql`delete from seeker_profiles where user_id = ${T}`;
  const pub = await as(null);
  const r1 = await pub.goto(`${BASE}/red`);
  check("ruta vieja /red redirige a /red-contable", pub.url().endsWith("/red-contable") && r1.status() === 200);
  check("la interfaz dice «Red Contable»", (await pub.title()).includes("Red Contable") || (await seen(pub, "Red Contable")));
  await pub.goto(`${BASE}/red/${slug}`);
  check("la ficha vieja también redirige", pub.url().includes(`/red-contable/${slug}`));
  await pub.goto(`${BASE}/ayuda/red-de-estudios/buscar-un-estudio`);
  check("la ayuda vieja redirige", pub.url().includes("/ayuda/red-contable/buscar-un-estudio") && (await seen(pub, "Disponible, busco contador")));
  const t = await as(d.cookies.titular);
  await t.goto(`${BASE}/contador/disponible`);
  await t.getByRole("checkbox", { name: "Disponible, busco contador" }).check();
  await t.locator("select[name=province]").selectOption("Santa Fe");
  await t.locator('input[name=needs][value="monotributo"]').check();
  await t.locator("input[name=note]").fill("Arranco a facturar, mail yo@mail.com");
  await t.getByRole("button", { name: "Guardar", exact: true }).last().click();
  check("«Disponible, busco contador» activado", await seen(t, "te ven sin tu nombre ni tus datos"));
  const a = await as(d.cookies.adminA, { width: 1280 });
  await a.goto(`${BASE}/admin/comercial/buscar-clientes?provincia=Santa+Fe`);
  const [tu] = await sql`select name, email from users where id = ${T}`;
  check("Buscar clientes: listado anónimo (sin nombre ni mail)", (await seen(a, "Necesita: Monotributo")) && !(await a.evaluate((n) => document.body.innerText.includes(n), tu.name)) && !(await a.evaluate(() => document.body.innerText.includes("yo@mail.com"))));
  await a.locator("[data-buscando]").filter({ hasText: "Necesita: Monotributo" }).first().getByRole("button", { name: "Contactar" }).click();
  check("el estudio contacta", await seen(a, "Contacto enviado"));
  await t.goto(`${BASE}/contador`);
  check("la persona ve qué estudio la contactó", (await t.locator("[data-contacto]").count()) === 1);
  await t.getByRole("button", { name: "Aceptar", exact: true }).click();
  check("acepta: empieza la admisión", (await seen(t, "empieza su admisión")) && (await seen(t, "En admisión")));
  await a.goto(`${BASE}/admin/comercial/buscar-clientes`);
  check("recién ahora el estudio ve su nombre y su mail", (await seen(a, "Aceptaron tu contacto")) && (await a.evaluate((e) => document.body.innerText.includes(e), tu.email)));
  for (const dark of [false, true]) {
    const v = await as(d.cookies.adminA, { dark, width: dark ? 1280 : 390 });
    await v.goto(`${BASE}/admin/comercial/buscar-clientes`);
    check(`Buscar clientes (${dark ? "oscuro" : "claro, 390 px"}): sin scroll horizontal`, (await seen(v, "Buscar clientes")) && (await noHScroll(v)));
  }
  await sql`delete from account_connections where user_id = ${T}`;
  await sql`update studios set plan_key = ${plan_key} where id = ${A}`;
}

// ─── Etapa 7 · La changa en zona gris ───
if (stage("7")) {
  const u = await persona("changa.prueba@prueba.local", "Cami Changa");
  await sql`delete from boxes where owner_id = ${u.id}`;
  await sql`delete from derivation_suggestions where user_id = ${u.id}`;
  const p = await as(await cookieFor(u.id));
  await p.goto(`${BASE}/cajas`);
  await p.getByRole("button", { name: "Abrir caja de negocio" }).click();
  await p.waitForURL(/\/cajas\/[0-9a-f-]{36}/);
  for (const [monto, desc] of [["1.000.000", "Diseño de logo"], ["700.000", "Página web"]]) {
    await p.getByRole("radio", { name: "Ingreso" }).check();
    await p.getByLabel("Monto").first().fill(monto);
    await p.getByLabel("En qué fue").fill(desc);
    await p.locator("select[name=category]").selectOption("changa");
    await p.getByRole("button", { name: "Cargar", exact: true }).click();
    await seen(p, "Cargado en la caja de negocio.");
  }
  check("sin monotributo: la changa queda «sin facturar»", await seen(p, "sin facturar"));
  check("la foto real: «Esto ya es una actividad»", (await seen(p, "Esto ya es una actividad")) && (await seen(p, "$ 1.700.000")));
  check("contexto de §13 marcado «a confirmar por un contador»", await seen(p, "Dato de contexto, a confirmar por un contador"));
  check("pasado el umbral: sugerencia de anotarse en el monotributo con un contador", (await p.locator('[data-derivacion="changa_actividad"]').count()) === 1);
  await p.locator('[data-derivacion="changa_actividad"]').getByRole("link", { name: "Sumar un contador" }).click();
  check("lleva a la Red Contable con el contexto armado", await seen(p, "Inscripción en el monotributo"));
  for (const dark of [false, true]) {
    const v = await as(await cookieFor(u.id), { dark, width: dark ? 1280 : 390 });
    await v.goto(`${BASE}/cajas`);
    await v.locator('[data-caja="negocio"]').click();
    check(`caja de negocio con la changa (${dark ? "oscuro" : "claro, 390 px"}): sin scroll horizontal`, (await seen(v, "Esto ya es una actividad")) && (await noHScroll(v)));
  }
}

// ─── Etapa 8 · Tango en los dos sentidos ───
if (stage("8")) {
  const { spawn } = await import("node:child_process");
  const MOCK = "http://127.0.0.1:4080";
  const mock = spawn(process.execPath, ["mocks/tango/server.mjs"], { stdio: "ignore" });
  for (let i = 0; i < 40 && !(await fetch(`${MOCK}/__estado`).then((r) => r.ok, () => false)); i++) await new Promise((r) => setTimeout(r, 100));
  const t = (path, body) => fetch(`${MOCK}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
  const A = d.studios.A;
  const URL8 = `${BASE}/admin/configuracion/conexiones/tango/sincronizacion`;
  try {
    await t("/__reset");
    await sql`delete from tango_documents where studio_id = ${A}`;
    await sql`delete from tango_norm_rules where studio_id = ${A}`;
    await sql`delete from tango_links where studio_id = ${A}`;
    await t("/__crear", { TIPO_COMP: "Factura B", N_COMP: "00001-00000901", RAZON_SOCI: "Pérez Juan", IMPORTE_TOTAL: 1500 });
    await t("/__crear", { TIPO_COMP: "Factura B", N_COMP: "00001-00000902", RAZON_SOCI: "PEREZ JUAN.", IMPORTE_TOTAL: 2500 });
    const p = await as(d.cookies.adminA);
    await p.goto(`${BASE}/admin/configuracion/conexiones/tango`);
    await p.getByRole("link", { name: /Tango en los dos sentidos/ }).click();
    await p.waitForURL(/sincronizacion/);
    await p.getByLabel("URL de la API").fill(MOCK);
    await p.getByLabel(/Token de la API/).fill("tango-token-de-prueba");
    await p.getByLabel(/Secreto de los webhooks/).fill("secreto");
    await p.getByRole("button", { name: "Guardar enlace" }).click();
    check("Tango: guardar el enlace", await seen(p, "Enlace guardado."));
    await t("/__sin_webhooks", { on: true });
    await p.getByRole("button", { name: "Registrar webhook" }).click();
    check("versión sin webhooks: avisa que consulta cada 15 minutos", await seen(p, "Faro va a consultar los cambios cada 15 minutos"));
    await p.getByRole("button", { name: /Sincronizar ahora/ }).click();
    check("sincronizar ahora: trae los comprobantes de Tango", (await seen(p, "Sincronizado:")) && (await seen(p, "00001-00000901")) && (await seen(p, "Nació en Tango")));
    await p.getByRole("button", { name: "Buscar nombres para unificar" }).click();
    await seen(p, "sugerencias nuevas");
    const regla = p.locator("[data-regla]").first();
    check("sugiere unificar el mismo cliente escrito distinto", (await regla.count()) === 1);
    await regla.getByLabel("Queda como").fill("Juan Pérez");
    await regla.getByRole("button", { name: "Aprobar" }).click();
    check("aprobada: los comprobantes muestran el nombre estándar y el original", (await seen(p, "Regla aprobada y aplicada.")) && (await seen(p, "Factura B 00001-00000902 · Juan Pérez")) && (await seen(p, "original: PEREZ JUAN.")));
    // Diferencia para decidir
    const [doc] = await sql`select id, external_id from tango_documents where studio_id = ${A} and number = '00001-00000901'`;
    await sql`update tango_documents set status = 'conflicto' where id = ${doc.id}`;
    await sql`insert into tango_conflicts (studio_id, document_id, fields, tango_raw) values (${A}, ${doc.id}, ${sql.json([{ field: "total", faro: 1500, tango: 1800 }])}, ${sql.json({ ID_GVA12: doc.external_id, TIPO_COMP: "Factura B", N_COMP: "00001-00000901", RAZON_SOCI: "Pérez Juan", IMPORTE_TOTAL: 1800 })})`;
    await p.goto(URL8);
    check("conflicto: muestra las dos versiones", (await seen(p, "Faro: 1500")) && (await seen(p, "Tango: 1800")));
    for (const dark of [false, true]) {
      const v = await as(d.cookies.adminA, { dark, width: dark ? 1280 : 390 });
      await v.goto(URL8);
      check(`Tango en los dos sentidos (${dark ? "oscuro, escritorio" : "claro, 390 px"}): sin scroll horizontal`, (await seen(v, "Diferencias para decidir")) && (await noHScroll(v)));
    }
    await p.locator("[data-conflicto]").getByRole("button", { name: "Quedarme con Tango" }).click();
    check("quedarse con Tango: se resuelve", (await seen(p, "Quedó lo de Tango.")) && (await seen(p, "No hay diferencias abiertas.")));
    const csv = await p.request.get(`${BASE}/api/integrations/tango/exportar`);
    check("exportar CSV para Tango (archivos sin API)", csv.ok() && (await csv.text()).includes("Juan Pérez"));
    const col = await as(d.cookies.colaboradorA);
    await col.goto(URL8);
    check("un colaborador no entra a la sincronización", !(await col.evaluate(() => document.body.innerText.includes("Diferencias para decidir"))));
    const b = await as(d.cookies.adminB);
    const r = await b.request.get(`${BASE}/api/integrations/tango/exportar`);
    check("otro estudio no exporta lo de A", !(await r.text()).includes("Juan Pérez"));
  } finally {
    await sql`delete from tango_documents where studio_id = ${A}`;
    await sql`delete from tango_norm_rules where studio_id = ${A}`;
    await sql`delete from tango_links where studio_id = ${A}`;
    mock.kill();
  }
}

check("sin errores de JavaScript", errors.length === 0, errors.slice(0, 3).join(" | "));
await browser.close();
await sql.end();
process.exit(failures ? 1 : 0);
