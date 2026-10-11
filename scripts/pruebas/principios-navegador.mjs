// Principios de producto en el navegador (390 px y escritorio, claro y oscuro),
// etapa por etapa. Correr después de datos.mjs, con el servidor en :3000.
//
//   PW=/ruta/a/playwright node --env-file=.env.local scripts/pruebas/principios-navegador.mjs [etapa]

import { createHmac, randomBytes } from "node:crypto";
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
  await p.waitForLoadState("networkidle");
  check("«Ahora no»: la sugerencia se esconde", !(await p.evaluate(() => document.body.innerText.includes("Empezaste a facturar al exterior"))));
  const [sg] = await sql`select status, snoozed_until from derivation_suggestions where user_id = ${T} and rule_key = 'facturacion_exterior'`;
  check("y vuelve más adelante (snooze guardado)", sg.status === "descartada" && sg.snoozed_until > new Date());
  await sql`update derivation_suggestions set status = 'activa', snoozed_until = null where user_id = ${T}`;
  await p.goto(`${BASE}/personal`);
  await p.getByRole("link", { name: "Sumar un contador" }).first().click();
  check("«Sumar un contador» lleva a la Red con el contexto armado", (await seen(p, "Lo que necesitás: Facturación al exterior")) && p.url().includes("/red?derivacion="));
  // Una sugerencia ajena forzando el ID no muestra nada
  const [other] = await sql`select id from derivation_suggestions where user_id = ${T}`;
  const b = await as(d.cookies.adminB);
  await b.goto(`${BASE}/red?derivacion=${other.id}`);
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

check("sin errores de JavaScript", errors.length === 0, errors.slice(0, 3).join(" | "));
await browser.close();
await sql.end();
process.exit(failures ? 1 : 0);
